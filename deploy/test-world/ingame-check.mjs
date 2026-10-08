// In-game checks against a running test-world container, through the server console (no client needed).
//   node deploy/test-world/ingame-check.mjs [container] [--only probes|examples|orientation]
// Needs `pnpm build` (it imports the built core and export packages) and every example exported into the pack the
// container mounts, with the server restarted after a new file appears (a reload picks up edits to existing
// functions but does not discover new ones). It only touches an 80 x 64 area at the world origin.
//
// Every check fails when the server does not answer: a query that times out, or a command the server rejects, is a
// failure, never a "no". Checks that do not apply are recorded as skipped, not passed.
//
// Probes test what the VERIFY-IN-GAME mappings mean, in controlled set-ups, with negative controls (the mappings
// used before the M1 review must fail the same probes). Examples are built with their own functions and their
// truth-table tests run on fresh builds. The orientation test is built and every block checked by ID.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseText, registryEntry, toEditionBlocks } from "../../packages/core/dist/index.js";
import { formatStates } from "../../packages/export/dist/index.js";

const args = process.argv.slice(2);
const container =
  args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--only") ?? "dustwright-test";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const root = fileURLToPath(new URL("../..", import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The server log's non-empty lines. */
const logLines = () =>
  execFileSync("docker", ["logs", container], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    .split("\n")
    .filter((l) => l.trim() !== "");
const send = (command) =>
  execFileSync("docker", ["exec", container, "send-command", command], { stdio: "ignore" });

/** A query the server never answered, or answered with an error. */
class NoAnswer extends Error {}

/** Sends a command that needs no answer, then waits for the game to act on it. */
async function cmd(command, settleMs = 120) {
  send(command);
  await sleep(settleMs);
}

/** Sends a query and returns the first new log line `match` recognises; throws NoAnswer after 3 seconds. */
async function query(command, match) {
  const start = logLines().length;
  send(command);
  for (let i = 0; i < 40; i++) {
    await sleep(75);
    const line = logLines()
      .slice(start)
      .find((l) => match.test(l));
    if (line) return line;
  }
  throw new NoAnswer(`no answer to: ${command}`);
}

const at = (p) => p.join(" ");

/** Whether the block at `p` is `id` (states optional). Throws NoAnswer when the game neither confirms nor denies. */
async function isBlock(p, id) {
  const coords = p.join(",");
  const line = await query(
    `testforblock ${at(p)} ${id}`,
    new RegExp(
      `(Successfully found the block at|The block at) ${coords}\\b|Cannot test|is invalid|[Ss]yntax error`,
    ),
  );
  if (/Successfully found/.test(line)) return true;
  if (new RegExp(`The block at ${coords}\\b`).test(line)) return false;
  throw new NoAnswer(`testforblock ${at(p)} ${id}: ${line}`);
}

/** Whether any item entity exists (something popped off). Throws NoAnswer when the game does not say. */
async function itemsExist() {
  return /Found /.test(await query("testfor @e[type=item]", /Found |No targets matched/));
}

/** A Bedrock block for an abstract type, with registry defaults for any state not given. */
const block = (type, states) => {
  const defaults = Object.fromEntries(
    Object.entries(registryEntry(type).states).map(([k, d]) => [k, d.default]),
  );
  return toEditionBlocks({ type, states: { ...defaults, ...states } }, "bedrock")[0];
};
const spec = (b) => `${b.id}${formatStates(b.states)}`;
const OFF = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};
const add = (p, d, k = 1) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];

const results = [];
function record(area, name, pass, detail = "") {
  results.push({ area, name, status: pass ? "pass" : "fail", detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${area}  ${name}${detail ? `  (${detail})` : ""}`);
}
function skip(area, name, reason) {
  results.push({ area, name, status: "skipped", detail: reason });
  console.log(`SKIP  ${area}  ${name}  (${reason})`);
}
/** Runs one check; any error (a NoAnswer included) fails that check. */
async function check(area, name, fn) {
  try {
    const [pass, detail] = await fn();
    record(area, name, pass, detail);
  } catch (err) {
    record(area, name, false, `error: ${err.message}`);
  }
}

async function clearProbe(p) {
  await cmd(`fill ${at(add(p, [-2, -2, -2]))} ${at(add(p, [2, 2, 2]))} minecraft:air`);
  await cmd("kill @e[type=item]");
}

/** Places a block and confirms the game holds it (by ID) before anything is concluded from it. */
async function place(p, blockSpec, id) {
  await cmd(`setblock ${at(p)} ${blockSpec}`);
  if (!(await isBlock(p, id))) throw new Error(`${id} did not place at ${at(p)}`);
}

/** The block survives a neighbour update while its support is there and breaks without it. */
async function supportProbe(area, label, blockSpec, id, supportDir, p) {
  await clearProbe(p);
  const support = add(p, OFF[supportDir]);
  await place(support, "minecraft:stone", "minecraft:stone");
  await place(p, blockSpec, id);
  const other = supportDir === "up" ? add(p, OFF.down) : add(p, OFF.up);
  await cmd(`setblock ${at(other)} minecraft:glass`);
  await cmd(`setblock ${at(other)} minecraft:air`, 300);
  const survived = !(await isBlock(p, "minecraft:air"));
  await cmd(`setblock ${at(support)} minecraft:air`, 300);
  const broke = await isBlock(p, "minecraft:air");
  return { survived, broke };
}

/** A lamp beside `p` (not on the support side) lights when the block at `p` gives power. */
async function lampProbe(p, blockSpec, id, supportDir, lampDir) {
  await clearProbe(p);
  if (supportDir) await place(add(p, OFF[supportDir]), "minecraft:stone", "minecraft:stone");
  await place(add(p, OFF[lampDir]), "minecraft:redstone_lamp", "minecraft:redstone_lamp");
  await cmd(`setblock ${at(p)} ${blockSpec}`, 600);
  if (await isBlock(p, "minecraft:air")) throw new Error(`${id} did not stay at ${at(p)}`);
  return isBlock(add(p, OFF[lampDir]), "minecraft:lit_redstone_lamp");
}

async function probes() {
  let site = -1;
  // Probe sites on a 5-block grid inside the ticking area (x 5..75, z 6..56), 10 blocks up.
  const next = () => {
    site++;
    return [5 + (site % 15) * 5, 10, 6 + Math.floor(site / 15) * 5];
  };
  const mountDir = (m) => (m === "floor" ? "down" : m === "ceiling" ? "up" : m);
  const supports = [
    ...["floor", "north", "south", "east", "west"].map((mount) => [
      "torch support (VIG-20)",
      "torch",
      { mount, lit: true },
    ]),
    ...["floor", "ceiling", "north", "south", "east", "west"].map((mount) => [
      "lever support (VIG-11)",
      "lever",
      { mount, on: false },
    ]),
    ...["floor", "ceiling", "north", "south", "east", "west"].flatMap((mount) =>
      ["stone", "wood"].map((material) => [
        "button support (VIG-01)",
        "button",
        { mount, material, pressed: false },
      ]),
    ),
  ];
  for (const [area, type, states] of supports) {
    const b = block(type, states);
    const label = `${type} ${Object.entries(states)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`;
    await check(area, label, async () => {
      const r = await supportProbe(area, label, spec(b), b.id, mountDir(states.mount), next());
      return [r.survived && r.broke, `survived update: ${r.survived}, broke without support: ${r.broke}`];
    });
  }
  // An unlit torch ID is accepted (the game then relights it).
  await check("torch lit state (VIG-20)", "unlit_redstone_torch places", async () => {
    const p = next();
    await clearProbe(p);
    await place(add(p, OFF.down), "minecraft:stone", "minecraft:stone");
    await cmd(`setblock ${at(p)} ${spec(block("torch", { mount: "floor", lit: false }))}`, 300);
    const lit = await isBlock(p, "minecraft:redstone_torch");
    const unlit = await isBlock(p, "minecraft:unlit_redstone_torch");
    return [lit || unlit, `now ${lit ? "lit" : unlit ? "unlit" : "gone"}`];
  });
  // Repeater and comparator: a redstone block behind (opposite facing) lights a lamp in front.
  for (const type of ["repeater", "comparator"]) {
    for (const facing of ["north", "south", "east", "west"]) {
      await check(
        `${type} direction (${type === "repeater" ? "VIG-16" : "VIG-02"})`,
        `${type} facing=${facing}`,
        async () => {
          const p = next();
          await clearProbe(p);
          await place(add(p, OFF.down), "minecraft:stone", "minecraft:stone");
          await place(add(p, OFF[facing]), "minecraft:redstone_lamp", "minecraft:redstone_lamp");
          const b = block(type, { facing });
          await place(p, spec(b), b.id);
          await cmd(`setblock ${at(add(p, OFF[facing], -1))} minecraft:redstone_block`, 600);
          const lit = await isBlock(add(p, OFF[facing]), "minecraft:lit_redstone_lamp");
          return [lit, `lamp in front lit: ${lit}`];
        },
      );
    }
  }
  // Levers on (floor, ceiling and every wall) and pressed buttons give power.
  for (const mount of ["floor", "ceiling", "north", "south", "east", "west"]) {
    await check("lever on state (VIG-12)", `lever mount=${mount} on=true lights a lamp`, async () => {
      const lampDir = mount === "east" || mount === "west" ? "north" : "east";
      const lit = await lampProbe(
        next(),
        spec(block("lever", { mount, on: true })),
        "minecraft:lever",
        mountDir(mount),
        lampDir,
      );
      return [lit, `lamp lit: ${lit}`];
    });
  }
  await check("button pressed state (VIG-01)", "button pressed=true lights a lamp", async () => {
    const lit = await lampProbe(
      next(),
      spec(block("button", { mount: "floor", pressed: true })),
      "minecraft:stone_button",
      "down",
      "east",
    );
    return [lit, `lamp lit: ${lit}`];
  });
  // Negative controls: the pre-review mappings must fail the same probes.
  await check(
    "control (VIG-20)",
    "torch_facing_direction=south does not hold on a north support",
    async () => {
      const p = next();
      await clearProbe(p);
      await place(add(p, OFF.north), "minecraft:stone", "minecraft:stone");
      // The server must accept the command; the torch may then break at once, which is the expected failure.
      const reply = await query(
        `setblock ${at(p)} minecraft:redstone_torch ["torch_facing_direction"="south"]`,
        /Block placed|Unable|invalid|[Ss]yntax/,
      );
      if (!/Block placed/.test(reply)) throw new Error(`setblock refused: ${reply}`);
      await cmd(`setblock ${at(add(p, OFF.up))} minecraft:glass`);
      await cmd(`setblock ${at(add(p, OFF.up))} minecraft:air`, 300);
      const stands = !(await isBlock(p, "minecraft:air"));
      return [!stands, `placed, then ${stands ? "still stands" : "broke"} after a neighbour update`];
    },
  );
  await check(
    "control (VIG-16)",
    "cardinal_direction=east does not carry a signal west to east",
    async () => {
      const p = next();
      await clearProbe(p);
      await place(add(p, OFF.down), "minecraft:stone", "minecraft:stone");
      await place(add(p, OFF.east), "minecraft:redstone_lamp", "minecraft:redstone_lamp");
      await place(
        p,
        'minecraft:unpowered_repeater ["minecraft:cardinal_direction"="east","repeater_delay"=0]',
        "minecraft:unpowered_repeater",
      );
      await cmd(`setblock ${at(add(p, OFF.west))} minecraft:redstone_block`, 600);
      const lit = await isBlock(add(p, OFF.east), "minecraft:lit_redstone_lamp");
      return [!lit, `lamp lit: ${lit}`];
    },
  );
  await check("control (VIG-14)", "facing_direction=2 does not push north", async () => {
    const p = next();
    await clearProbe(p);
    await place(p, 'minecraft:piston ["facing_direction"=2]', "minecraft:piston");
    await cmd(`setblock ${at(add(p, OFF.up))} minecraft:redstone_block`, 800);
    const north = await isBlock(add(p, OFF.north), "minecraft:piston_arm_collision");
    const south = await isBlock(add(p, OFF.south), "minecraft:piston_arm_collision");
    return [!north && south, `arm north: ${north}, arm south: ${south}`];
  });
  // Pistons: powered from a side, the arm appears on the facing side.
  for (const type of ["piston", "sticky_piston"]) {
    for (const facing of ["north", "south", "east", "west", "up", "down"]) {
      await check(
        `${type} direction (${type === "piston" ? "VIG-14" : "VIG-19"})`,
        `${type} facing=${facing}`,
        async () => {
          const p = next();
          await clearProbe(p);
          const b = block(type, { facing });
          await place(p, spec(b), b.id);
          const powerSide = facing === "up" || facing === "down" ? "east" : "up";
          await cmd(`setblock ${at(add(p, OFF[powerSide]))} minecraft:redstone_block`, 800);
          const arm =
            type === "piston" ? "minecraft:piston_arm_collision" : "minecraft:sticky_piston_arm_collision";
          const ok = await isBlock(add(p, OFF[facing]), arm);
          return [ok, `arm on the ${facing} side: ${ok}`];
        },
      );
    }
  }
}

/** The command that sets a lever input to a value, at the build origin `o` (the function builds one block east). */
function inputCommand(model, port, value, o) {
  const pos = port.pos;
  const b = model.blocks.get(`${pos[0]},${pos[1]},${pos[2]}`);
  return `setblock ${o[0] + 1 + pos[0]} ${o[1] + pos[1]} ${o[2] + pos[2]} ${spec(block(b.type, { ...b.states, on: value === 1 }))}`;
}

/** Reads an output port: lamps by their lit ID, pistons by the arm on their facing side, dust as off (0) or on (1). */
async function readOutput(model, port, o) {
  const pos = port.pos;
  const b = model.blocks.get(`${pos[0]},${pos[1]},${pos[2]}`);
  const p = [o[0] + 1 + pos[0], o[1] + pos[1], o[2] + pos[2]];
  if (b.type === "lamp") {
    if (await isBlock(p, "minecraft:lit_redstone_lamp")) return 1;
    if (await isBlock(p, "minecraft:redstone_lamp")) return 0;
    throw new Error(`no lamp at ${at(p)}`);
  }
  if (b.type === "piston" || b.type === "sticky_piston") {
    const arm =
      b.type === "piston" ? "minecraft:piston_arm_collision" : "minecraft:sticky_piston_arm_collision";
    if (!(await isBlock(p, `minecraft:${b.type}`))) throw new Error(`no ${b.type} at ${at(p)}`);
    return (await isBlock(add(p, OFF[b.states.facing]), arm)) ? 1 : 0;
  }
  if (b.type === "dust") {
    if (await isBlock(p, 'minecraft:redstone_wire ["redstone_signal"=0]')) return 0;
    if (await isBlock(p, "minecraft:redstone_wire")) return 1;
    throw new Error(`no dust at ${at(p)}`);
  }
  throw new Error(`cannot read ${b.type}`);
}

/** Input sequences for designs with memory: each step sets inputs and the outputs that must follow, in order. */
const SEQUENCES = {
  "t-flip-flop": [
    [{ T: 1 }, { Q: 1 }],
    [{ T: 0 }, { Q: 1 }],
    [{ T: 1 }, { Q: 0 }],
    [{ T: 0 }, { Q: 0 }],
  ],
};
/**
 * Designs whose authored state is not their state at rest: once built they move (the door's torches extend its
 * pistons), so building again over them pushes their blocks a second time. They must be cleared before a rebuild.
 */
const MOVES_AT_REST = new Set(["2x2-piston-door"]);
/** Designs with no moving parts, used to check that a build never removes a block around it. */
const STATIC = new Set(["not-gate", "repeater-line"]);

async function examples() {
  const files = readdirSync(`${root}/examples`)
    .filter((f) => f.endsWith(".rsd.json") && f !== "orientation-test.rsd.json")
    .sort();
  let z = 2;
  for (const file of files) {
    const model = parseText(readFileSync(`${root}/examples/${file}`, "utf8")).model;
    const slug = model.meta.slug;
    const area = `example ${slug}`;
    const o = [40, 4, z];
    z += model.size[2] + 4;
    const build = async () => {
      await cmd(`execute positioned ${at(o)} run function rsd/${slug}_clear`);
      await cmd("kill @e[type=item]");
      await cmd(`execute positioned ${at(o)} run function rsd/${slug}`, 2500);
    };
    await check(area, "builds without dropping items", async () => {
      await build();
      const items = await itemsExist();
      return [!items, items ? "items found" : "no items"];
    });
    for (const [i, t] of model.tests.entries()) {
      for (const [name, expected] of Object.entries(t.expect)) {
        await check(area, `test ${i}: set ${JSON.stringify(t.set)} expect ${name}=${expected}`, async () => {
          await build();
          for (const [input, value] of Object.entries(t.set)) {
            await cmd(
              inputCommand(
                model,
                model.ports.inputs.find((p) => p.name === input),
                value,
                o,
              ),
            );
          }
          await sleep(t.afterTicks * 100 + 1500);
          const actual = await readOutput(
            model,
            model.ports.outputs.find((p) => p.name === name),
            o,
          );
          return [actual === expected, `actual ${actual}`];
        });
      }
    }
    const sequence = SEQUENCES[slug];
    if (sequence) {
      const label = `sequence ${sequence.map(([s, e]) => `${JSON.stringify(s)}->${JSON.stringify(e)}`).join(" ")}`;
      await check(area, label, async () => {
        await build();
        const seen = [];
        for (const [set, expect] of sequence) {
          for (const [name, value] of Object.entries(set)) {
            await cmd(
              inputCommand(
                model,
                model.ports.inputs.find((p) => p.name === name),
                value,
                o,
              ),
              1500,
            );
          }
          for (const [name, value] of Object.entries(expect)) {
            seen.push(
              (await readOutput(
                model,
                model.ports.outputs.find((p) => p.name === name),
                o,
              )) === value,
            );
          }
        }
        return [seen.every(Boolean), `steps ok: ${seen.join(",")}`];
      });
    }
    if (model.tests.length > 0 && MOVES_AT_REST.has(slug)) {
      skip(
        area,
        "clear, build, build equals clear, build",
        "moves at rest: rebuild only after the clear function",
      );
    } else if (model.tests.length > 0) {
      await check(area, "clear, build, build equals clear, build", async () => {
        const b = [o[0], o[1] + 40, o[2]];
        await build();
        await cmd(`execute positioned ${at(b)} run function rsd/${slug}_clear`);
        await cmd(`execute positioned ${at(b)} run function rsd/${slug}`, 1500);
        await cmd(`execute positioned ${at(b)} run function rsd/${slug}`, 2500);
        const from = [o[0] + 1, o[1], o[2]];
        const to = [o[0] + model.size[0], o[1] + model.size[1] - 1, o[2] + model.size[2] - 1];
        const line = await query(
          `testforblocks ${at(from)} ${at(to)} ${at([b[0] + 1, b[1], b[2]])}`,
          /blocks compared|not identical|Cannot|outside/i,
        );
        const text = line.replace(/^\[[^\]]+\] /, "");
        return [/\d+ blocks compared/i.test(text) && !/not/i.test(text), text];
      });
    }
    if (STATIC.has(slug)) {
      await check(area, "the build alone never removes a block", async () => {
        // Glass fills the design's box and a one-block margin around it (above included); after the build, every
        // cell the design does not set must still be glass.
        const c = [o[0], o[1] + 20, o[2] + 1];
        const from = [c[0], c[1], c[2] - 1];
        const to = [c[0] + model.size[0] + 1, c[1] + model.size[1], c[2] + model.size[2]];
        await cmd(`fill ${at(from)} ${at(to)} minecraft:glass`);
        await cmd(`execute positioned ${at(c)} run function rsd/${slug}`, 1500);
        let kept = 0;
        let lost = 0;
        for (let y = from[1]; y <= to[1]; y++) {
          for (let zz = from[2]; zz <= to[2]; zz++) {
            for (let x = from[0]; x <= to[0]; x++) {
              if (model.blocks.has(`${x - c[0] - 1},${y - c[1]},${zz - c[2]}`)) continue;
              if (await isBlock([x, y, zz], "minecraft:glass")) kept++;
              else lost++;
            }
          }
        }
        return [kept > 0 && lost === 0, `${kept} cells kept, ${lost} lost`];
      });
    }
    if (model.tests.length === 0 && model.ports.outputs.length > 0) {
      await check(area, "output changes over time (clock)", async () => {
        await build();
        const samples = [];
        for (let k = 0; k < 12; k++) samples.push(await readOutput(model, model.ports.outputs[0], o));
        return [samples.includes(0) && samples.includes(1), `samples ${samples.join("")}`];
      });
    }
  }
}

/** Builds the orientation test and checks every block under test by its Bedrock ID, and that nothing dropped. */
async function orientation() {
  const model = parseText(readFileSync(`${root}/examples/orientation-test.rsd.json`, "utf8")).model;
  const o = [2, 30, 2];
  await check("orientation test", "builds without dropping items", async () => {
    await cmd(`execute positioned ${at(o)} run function rsd/orientation-test_clear`);
    await cmd("kill @e[type=item]");
    await cmd(`execute positioned ${at(o)} run function rsd/orientation-test`, 3000);
    const items = await itemsExist();
    return [!items, items ? "items found" : "no items"];
  });
  await check(
    "orientation test",
    `all ${model.annotations.length} blocks under test stand, with the right IDs`,
    async () => {
      const wrong = [];
      for (const a of model.annotations) {
        const b = model.blocks.get(a.pos.join(","));
        const p = [o[0] + 1 + a.pos[0], o[1] + a.pos[1], o[2] + a.pos[2]];
        // Lit and unlit, powered and unpowered IDs are the same block for this check.
        const ids = new Set([toEditionBlocks(b, "bedrock")[0].id]);
        for (const [k, d] of Object.entries(registryEntry(b.type).states)) {
          if (typeof d.default === "boolean")
            for (const v of d.values)
              ids.add(toEditionBlocks({ ...b, states: { ...b.states, [k]: v } }, "bedrock")[0].id);
        }
        let ok = false;
        for (const id of ids) if (await isBlock(p, id)) ok = true;
        if (!ok) wrong.push(a.text);
      }
      return [
        wrong.length === 0,
        wrong.length ? `wrong or missing: ${wrong.join("; ")}` : `${model.annotations.length} checked`,
      ];
    },
  );
}

await cmd("reload", 3000);
await cmd("tickingarea add 0 0 0 79 0 63 dustwright-check");
if (!only || only === "probes") await probes();
if (!only || only === "examples") await examples();
if (!only || only === "orientation") await orientation();
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count("pass")} passed, ${count("fail")} failed, ${count("skipped")} skipped`);
console.log(JSON.stringify({ when: new Date().toISOString(), container, results }));
process.exitCode = count("fail") > 0 ? 1 : 0;
