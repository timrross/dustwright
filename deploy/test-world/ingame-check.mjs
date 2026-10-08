// In-game checks against a running test-world container, through the server console (no client needed).
//   node deploy/test-world/ingame-check.mjs [container] [--only probes|examples|orientation|structures]
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
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseText, registryEntry, toEditionBlocks } from "../../packages/core/dist/index.js";
import { formatStates } from "../../packages/export/dist/index.js";
import {
  add,
  at,
  block,
  cmd,
  countGlass,
  filledCells,
  isBlock,
  itemsExist,
  OFF,
  query,
  sleep,
  spec,
  stalled,
  useContainer,
  worldTicks,
} from "./console.mjs";

const args = process.argv.slice(2);
const container =
  args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--only") ?? "dustwright-test";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const root = fileURLToPath(new URL("../..", import.meta.url));
useContainer(container);

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

/**
 * Reads an output until it shows `expected` or the deadline passes, and returns the last value read. Console
 * commands land at no exact tick, so the read is a window from `afterTicks` to `afterTicks` plus 3 seconds rather
 * than one instant; a circuit that never reaches the value still fails.
 */
async function readOutputUntil(model, port, o, expected, afterTicks) {
  await sleep(afterTicks * 100 + 500);
  const deadline = Date.now() + 3000;
  let actual = await readOutput(model, port, o);
  while (actual !== expected && Date.now() < deadline) {
    await sleep(250);
    actual = await readOutput(model, port, o);
  }
  return actual;
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
          const actual = await readOutputUntil(
            model,
            model.ports.outputs.find((p) => p.name === name),
            o,
            expected,
            t.afterTicks,
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
        const cellsInRegion = (to[0] - from[0] + 1) * (to[1] - from[1] + 1) * (to[2] - from[2] + 1);
        const expected = cellsInRegion - filledCells(model).size;
        const kept = await countGlass(from, to);
        const lost = expected - kept;
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

/** IDs that count as the same block for a placement check: every lit/unlit, powered/unpowered variant. */
function idFamily(b) {
  const ids = new Set([toEditionBlocks(b, "bedrock")[0].id]);
  for (const [k, d] of Object.entries(registryEntry(b.type).states)) {
    if (typeof d.default === "boolean")
      for (const v of d.values)
        ids.add(toEditionBlocks({ ...b, states: { ...b.states, [k]: v } }, "bedrock")[0].id);
  }
  return ids;
}

/** Directions turned 90 degrees clockwise, seen from above. */
const CW = {
  north: "east",
  east: "south",
  south: "west",
  west: "north",
  up: "up",
  down: "down",
  floor: "floor",
  ceiling: "ceiling",
};

/** A block's abstract states after a quarter turn clockwise: horizontal facing and wall mounts turn. */
function rotateBlock(b) {
  const states = { ...b.states };
  for (const key of ["facing", "mount"]) if (typeof states[key] === "string") states[key] = CW[states[key]];
  return { ...b, states };
}

/** Checks that every block of `model` stands at `place(pos)` as `expect(block)` (IDs and, when `exact`, states). */
async function checkPlaced(model, placeAt, expectBlock, exact) {
  const wrong = [];
  for (const [key, b] of model.blocks) {
    const pos = key.split(",").map(Number);
    const want = expectBlock(b);
    const p = placeAt(pos);
    let ok = false;
    if (exact) {
      const e = toEditionBlocks(want, "bedrock")[0];
      // Dynamic states (power, lit, open, pressed) are left out: the circuit may already have changed them.
      // A floor or ceiling lever's axis is left out too: designs do not model it, and a rotation turns it.
      const axisFree =
        want.type === "lever" && (want.states.mount === "floor" || want.states.mount === "ceiling");
      const fixed = Object.fromEntries(
        Object.entries(e.states).filter(
          ([k]) =>
            !/signal|powered|lit|open_bit|pressed|toggle|triggered|output_lit/.test(k) &&
            !(axisFree && k === "lever_direction"),
        ),
      );
      for (const id of idFamily(want))
        if (!ok && (await isBlock(p, `${id}${formatStates(fixed)}`))) ok = true;
    } else {
      for (const id of idFamily(want)) if (!ok && (await isBlock(p, id))) ok = true;
    }
    if (!ok) wrong.push(`${b.type} at [${pos}]`);
  }
  return wrong;
}

/**
 * The model turned a quarter clockwise (seen from above), as `/structure load ... 90_degrees` places it: cell
 * (x, y, z) moves to (sizeZ - 1 - z, y, x), and horizontal facings and wall mounts turn with it.
 */
function rotatedModel(model) {
  const [sx, sy, sz] = model.size;
  const turn = ([x, y, z]) => [sz - 1 - z, y, x];
  const blocks = new Map();
  for (const [key, b] of model.blocks) blocks.set(turn(key.split(",").map(Number)).join(","), rotateBlock(b));
  const ports = {
    inputs: model.ports.inputs.map((p) => ({ ...p, pos: turn(p.pos) })),
    outputs: model.ports.outputs.map((p) => ({ ...p, pos: turn(p.pos) })),
  };
  return { ...model, size: [sz, sy, sx], blocks, ports };
}

async function structures() {
  const files = readdirSync(`${root}/examples`)
    .filter((f) => f.endsWith(".rsd.json"))
    .sort();
  // Each design gets its own band: unturned at x 2, turned at x 52, one 8-block layer band per design from y 70.
  for (const [k, file] of files.entries()) {
    const original = parseText(readFileSync(`${root}/examples/${file}`, "utf8")).model;
    const slug = original.meta.slug;
    for (const turned of [false, true]) {
      const model = turned ? rotatedModel(original) : original;
      const rotation = turned ? "90_degrees" : "0_degrees";
      const area = `structure ${slug}${turned ? " (90 degrees)" : ""}`;
      const o = [turned ? 52 : 2, 70 + 8 * k, 2];
      if (turned && slug === "orientation-test") continue; // checked separately below, at full size
      const box = (base) => [
        base,
        [base[0] + model.size[0] - 1, base[1] + model.size[1] - 1, base[2] + model.size[2] - 1],
      ];
      const load = async (base) => {
        const [a, b] = box(base);
        await cmd(`fill ${at(a)} ${at(b)} minecraft:air`);
        await cmd("kill @e[type=item]");
        const reply = await query(
          `structure load rsd:${slug} ${at(base)} ${rotation}`,
          /Loaded a structure|can.t be found|Unable|[Ss]yntax|invalid/,
        );
        if (!/Loaded a structure/.test(reply)) throw new Error(reply);
        await sleep(2500);
      };
      if (MOVES_AT_REST.has(slug)) {
        skip(
          area,
          "loads with every block in place, by ID and state",
          "moves at rest: its pistons push blocks as soon as it loads; its tests below check it",
        );
      } else {
        await check(area, "loads with every block in place, by ID and state", async () => {
          await load(o);
          const wrong = await checkPlaced(
            model,
            (p) => [o[0] + p[0], o[1] + p[1], o[2] + p[2]],
            (b) => b,
            true,
          );
          return [
            wrong.length === 0,
            wrong.length
              ? `wrong or missing: ${wrong.slice(0, 8).join("; ")}${wrong.length > 8 ? " ..." : ""}`
              : `${model.blocks.size} blocks`,
          ];
        });
      }
      await check(area, "loads without dropping items", async () => {
        await load(o);
        return [!(await itemsExist()), ""];
      });
      if (!turned) {
        const designGlass = [...model.blocks.values()].filter((b) => b.type === "glass").length;
        const air = model.size[0] * model.size[1] * model.size[2] - filledCells(model).size;
        if (air === 0) {
          skip(area, "air cells leave existing blocks alone", "the design has no air cells");
        } else {
          await check(area, "air cells leave existing blocks alone", async () => {
            // Four layers up, inside this design's 8-layer band (every design is at most 4 tall).
            const g = [o[0], o[1] + 4, o[2]];
            const [a, b] = box(g);
            await cmd(`fill ${at(a)} ${at(b)} minecraft:glass`);
            const reply = await query(
              `structure load rsd:${slug} ${at(g)}`,
              /Loaded a structure|can.t be found|Unable/,
            );
            if (!/Loaded a structure/.test(reply)) throw new Error(reply);
            await sleep(1500);
            const kept = (await countGlass(a, b)) - designGlass;
            return [kept === air, `${kept} of ${air} air cells still glass`];
          });
        }
      }
      for (const [i, t] of model.tests.entries()) {
        for (const [name, expected] of Object.entries(t.expect)) {
          await check(
            area,
            `test ${i}: set ${JSON.stringify(t.set)} expect ${name}=${expected}`,
            async () => {
              await load(o);
              const base = [o[0] - 1, o[1], o[2]];
              for (const [input, value] of Object.entries(t.set))
                await cmd(
                  inputCommand(
                    model,
                    model.ports.inputs.find((p) => p.name === input),
                    value,
                    base,
                  ),
                );
              const actual = await readOutputUntil(
                model,
                model.ports.outputs.find((p) => p.name === name),
                base,
                expected,
                t.afterTicks,
              );
              return [actual === expected, `actual ${actual}`];
            },
          );
        }
      }
    }
  }
  // The orientation test turned: every block at its turned position with its turned facing and mount.
  const model = parseText(readFileSync(`${root}/examples/orientation-test.rsd.json`, "utf8")).model;
  const r = [2, 130, 2];
  await check(
    "structure orientation-test (90 degrees)",
    "loads with every block turned, by ID and state",
    async () => {
      const turned = rotatedModel(model);
      await cmd(
        `fill ${at(r)} ${at([r[0] + turned.size[0] - 1, r[1] + turned.size[1] - 1, r[2] + turned.size[2] - 1])} minecraft:air`,
      );
      const reply = await query(
        `structure load rsd:orientation-test ${at(r)} 90_degrees`,
        /Loaded a structure|can.t be found|Unable/,
      );
      if (!/Loaded a structure/.test(reply)) throw new Error(reply);
      await sleep(3000);
      const wrong = await checkPlaced(
        turned,
        (p) => [r[0] + p[0], r[1] + p[1], r[2] + p[2]],
        (b) => b,
        true,
      );
      return [
        wrong.length === 0,
        wrong.length
          ? `wrong or missing: ${wrong.slice(0, 8).join("; ")}${wrong.length > 8 ? " ..." : ""}`
          : `${turned.blocks.size} blocks`,
      ];
    },
  );
}

await cmd("reload", 3000);
await cmd("tickingarea add 0 0 0 79 0 63 dustwright-check");

if (!(await worldTicks(true))) stalled("before the first check");
if (!only || only === "probes") {
  await probes();
  if (!(await worldTicks(false))) stalled("after probes");
}
if (!only || only === "examples") {
  await examples();
  if (!(await worldTicks(false))) stalled("after examples");
}
if (!only || only === "orientation") {
  await orientation();
  if (!(await worldTicks(false))) stalled("after orientation");
}
if (!only || only === "structures") {
  await structures();
  if (!(await worldTicks(false))) stalled("after structures");
}
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count("pass")} passed, ${count("fail")} failed, ${count("skipped")} skipped`);
console.log(JSON.stringify({ when: new Date().toISOString(), container, results }));
process.exitCode = count("fail") > 0 ? 1 : 0;
