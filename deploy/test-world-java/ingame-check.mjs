// In-game checks against the Java test world (deploy/test-world-java), over RCON (no client needed).
//   node deploy/test-world-java/ingame-check.mjs [container] [--only probes|patterns|orientation]
// Needs `pnpm build`. Works inside the force-loaded 80 x 64 area at the world origin, above the flat floor.
//
// Every check fails when the server does not answer: a query that gets neither "Test passed" nor "Test failed" is a
// failure, never a "no". Checks that do not apply are recorded as skipped, not passed.
//
// Probes test what the Java orientation mappings mean, each by its effect in game and with a negative control: the
// opposite mapping must fail the same probe, so a probe that passes either way cannot hide a wrong mapping.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { attachedFace, DIRS, parse, registryEntry } from "../../packages/core/dist/index.js";
import { dustShape, javaCells, javaStateString } from "../../packages/export/dist/index.js";
import {
  add,
  at,
  block,
  cmd,
  FLOOR,
  forceloadCheckArea,
  isBlock,
  OFF,
  run,
  sleep,
  spec,
  useContainer,
} from "./rcon.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

const args = process.argv.slice(2);
const container =
  args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--only") ?? "dustwright-test-java";
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
useContainer(container);

const results = [];
function record(area, name, pass, detail = "") {
  results.push({ area, name, status: pass ? "pass" : "fail", detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${area}  ${name}${detail ? `  (${detail})` : ""}`);
}
async function check(area, name, fn) {
  try {
    const [pass, detail] = await fn();
    record(area, name, pass, detail);
  } catch (err) {
    record(area, name, false, `error: ${err.message}`);
  }
}

const CARDINAL = ["north", "south", "east", "west"];
const OPPOSITE = { north: "south", south: "north", east: "west", west: "east", up: "down", down: "up" };

/** Clears a 7 x 6 x 7 box around `p` and lays a stone floor under it. */
async function clearSite(p) {
  await cmd(`fill ${at(add(p, [-3, -1, -3]))} ${at(add(p, [3, 4, 3]))} minecraft:air`);
  await cmd(`fill ${at(add(p, [-3, -2, -3]))} ${at(add(p, [3, -2, 3]))} minecraft:stone`);
  await cmd("kill @e[type=item]");
}
const put = (p, b) => cmd(`setblock ${at(p)} ${spec(b)}`);
/**
 * Swaps a block for another conducting full block and back, so its neighbours get an update: /setblock of a powered
 * lever or button does not update the neighbours of the block it hangs on, and a lamp set by /setblock checks its
 * power only when a neighbour changes (both measured).
 */
async function swap(p, b = block("stone")) {
  await cmd(`setblock ${at(p)} ${spec(b.id === "minecraft:stone" ? block("concrete") : block("stone"))}`, 0);
  await cmd(`setblock ${at(p)} ${spec(b)}`, 150);
}

/**
 * One probe per orientation meaning. Each `run(mapping)` builds at `p` with the block the registry gives
 * (`flip: false`) or the opposite orientation (`flip: true`, the negative control) and returns whether the effect the
 * meaning predicts happened.
 */
const PROBES = [];
for (const d of CARDINAL) {
  PROBES.push({
    label: `torch mount=${d}: powering its support turns it off`,
    async run(p, flip) {
      // The torch first and its support second: Java checks a torch's support only on an update from that side.
      const support = add(p, OFF[d]);
      await put(p, block("torch", { mount: flip ? OPPOSITE[d] : d, lit: true }));
      await put(support, block("stone"));
      if (await isBlock(p, "minecraft:air")) return false;
      // A lever on top of the support powers it; the torch on it must go out.
      await put(add(support, OFF.up), block("lever", { mount: "floor", on: true }));
      await swap(support);
      await sleep(300);
      return isBlock(p, "minecraft:redstone_wall_torch[lit=false]");
    },
  });
  for (const type of ["lever", "button"]) {
    PROBES.push({
      label: `${type} mount=${d}: on, it powers its support (a lamp beyond it lights)`,
      async run(p, flip) {
        const support = add(p, OFF[d]);
        const lamp = add(support, OFF[d]);
        await put(lamp, block("lamp"));
        const states = type === "lever" ? { on: true } : { pressed: true };
        await put(p, block(type, { mount: flip ? OPPOSITE[d] : d, ...states }));
        await put(support, block("stone"));
        if (await isBlock(p, "minecraft:air")) return false;
        await swap(support);
        await sleep(200);
        return isBlock(lamp, "minecraft:redstone_lamp[lit=true]");
      },
    });
  }
  for (const type of ["repeater", "comparator"]) {
    PROBES.push({
      label: `${type} facing=${d}: the signal exits on the facing side`,
      async run(p, flip) {
        // Lamp, then the diode, then its power last, so every change reaches the next block as an update.
        const lamp = add(p, OFF[d]);
        await put(lamp, block("lamp"));
        // A diode needs a block under it: Java removes an unsupported one on its first neighbour update.
        await put(add(p, OFF.down), block("stone"));
        await put(p, block(type, { facing: flip ? OPPOSITE[d] : d }));
        await put(add(p, OFF[OPPOSITE[d]]), block("redstone_block"));
        await sleep(400);
        return isBlock(lamp, "minecraft:redstone_lamp[lit=true]");
      },
    });
  }
  PROBES.push({
    label: `stairs facing=${d}: the tall back (facing side) holds a wall torch`,
    async run(p, flip) {
      // The torch hangs on the stairs (on its OPPOSITE[d] side): torch first, stairs second, so the game checks it.
      const torchAt = add(p, OFF[d]);
      await put(torchAt, block("torch", { mount: OPPOSITE[d] }));
      await put(p, block("stairs", { facing: flip ? OPPOSITE[d] : d }));
      await sleep(100);
      return !(await isBlock(torchAt, "minecraft:air"));
    },
  });
}
for (const [mount, d] of [
  ["floor", "down"],
  ["ceiling", "up"],
]) {
  for (const type of ["lever", "button"]) {
    PROBES.push({
      label: `${type} mount=${mount}: on, it powers the block it stands on or hangs from (a lamp beyond it lights)`,
      async run(p, flip) {
        const support = add(p, OFF[d]);
        const lamp = add(support, OFF[d]);
        await put(lamp, block("lamp"));
        const states = type === "lever" ? { on: true } : { pressed: true };
        await put(
          p,
          block(type, { mount: flip ? (mount === "floor" ? "ceiling" : "floor") : mount, ...states }),
        );
        await put(support, block("stone"));
        if (await isBlock(p, "minecraft:air")) return false;
        await swap(support);
        await sleep(200);
        return isBlock(lamp, "minecraft:redstone_lamp[lit=true]");
      },
    });
  }
}
for (const d of ["north", "south", "east", "west", "up", "down"]) {
  for (const type of ["piston", "sticky_piston"]) {
    PROBES.push({
      label: `${type} facing=${d}: the head pushes to the facing side`,
      async run(p, flip) {
        await put(p, block(type, { facing: flip ? OPPOSITE[d] : d }));
        const side = d === "up" || d === "down" ? "east" : "up";
        await put(add(p, OFF[side]), block("redstone_block"));
        await sleep(400);
        return isBlock(add(p, OFF[d]), "minecraft:piston_head");
      },
    });
  }
  PROBES.push({
    label: `observer facing=${d}: a change on the facing side pulses the opposite side (a copper bulb toggles)`,
    async run(p, flip) {
      const out = add(p, OFF[OPPOSITE[d]]);
      await put(out, { id: "minecraft:copper_bulb", states: { lit: false, powered: false } });
      await put(p, block("observer", { facing: flip ? OPPOSITE[d] : d }));
      await sleep(400);
      // Placing the observer may itself pulse; reset the bulb, then change the watched block.
      await cmd(`setblock ${at(out)} minecraft:copper_bulb[lit=false,powered=false]`, 300);
      await put(add(p, OFF[d]), block("glass"));
      await sleep(400);
      return isBlock(out, "minecraft:copper_bulb[lit=true]");
    },
  });
  PROBES.push({
    label: `dropper facing=${d}: a powered dropper moves its item into the chest on the facing side`,
    async run(p, flip) {
      const chest = add(p, OFF[d]);
      await cmd(`setblock ${at(chest)} minecraft:chest`);
      await put(p, block("dropper", { facing: flip ? OPPOSITE[d] : d }));
      await cmd(`item replace block ${at(p)} container.0 with minecraft:stick`);
      const side = d === "up" || d === "down" ? "east" : "up";
      await put(add(p, OFF[side]), block("redstone_block"));
      await sleep(400);
      return /^Test passed/.test(run(`execute if items block ${at(chest)} container.* minecraft:stick`));
    },
  });
}
for (const d of ["north", "south", "east", "west", "up", "down"]) {
  PROBES.push({
    label: `dispenser facing=${d}: a powered dispenser drops its item on the facing side`,
    async run(p, flip) {
      await put(p, block("dispenser", { facing: flip ? OPPOSITE[d] : d }));
      await cmd(`item replace block ${at(p)} container.0 with minecraft:stick`);
      const side = d === "up" || d === "down" ? "east" : "up";
      await put(add(p, OFF[side]), block("redstone_block"));
      await sleep(150);
      // Where the dropped item is, relative to the dispenser's centre: it must lie on the facing side.
      const out = run(`data get entity @e[type=item,limit=1,sort=nearest,x=${p[0]},y=${p[1]},z=${p[2]}] Pos`);
      const pos = (out.match(/\[(-?[\d.]+)d, (-?[\d.]+)d, (-?[\d.]+)d\]/) ?? []).slice(1).map(Number);
      if (pos.length !== 3) return false;
      const delta = pos.map((v, i) => v - (p[i] + 0.5));
      const axis = OFF[d].findIndex((v) => v !== 0);
      return delta[axis] * OFF[d][axis] > 0.4;
    },
  });
}
for (const d of ["down", "north", "south", "east", "west"]) {
  PROBES.push({
    label: `hopper facing=${d}: items leave into the chest on the facing side`,
    async run(p, flip) {
      if (flip && d === "down") return false; // a hopper cannot face up: no opposite to test
      const chest = add(p, OFF[d]);
      await cmd(`setblock ${at(chest)} minecraft:chest`);
      await put(p, block("hopper", { facing: flip ? OPPOSITE[d] : d }));
      await cmd(`item replace block ${at(p)} container.0 with minecraft:stick`);
      await sleep(1000);
      return /^Test passed/.test(run(`execute if items block ${at(chest)} container.* minecraft:stick`));
    },
  });
}

async function probes() {
  const p = [40, FLOOR + 20, 30];
  for (const probe of PROBES) {
    await check("probe", probe.label, async () => {
      await clearSite(p);
      const right = await probe.run(p, false);
      await clearSite(p);
      const wrong = await probe.run(p, true);
      return [
        right && !wrong,
        `mapping ${right ? "works" : "fails"}, opposite ${wrong ? "also works" : "fails"}`,
      ];
    });
  }
}

// ---- Patterns -------------------------------------------------------------------------------------------------

/** Every pattern as a Java design: the format is edition-neutral, so only `meta.edition` changes. */
function javaPatterns() {
  return readdirSync(`${root}/patterns`)
    .filter((f) => f.endsWith(".rsd.json"))
    .sort()
    .map((f) => {
      const raw = JSON.parse(readFileSync(`${root}/patterns/${f}`, "utf8"));
      raw.meta.edition = "java";
      delete raw.meta.gameVersion;
      return parse(raw).model;
    });
}

/** Input sequences for designs with memory: each step sets inputs and the outputs that must follow, in order. */
const SEQUENCES = {
  "rs-latch": [
    [{ S: 1 }, { Q: 1 }],
    [{ S: 0 }, { Q: 1 }],
    [{ R: 1 }, { Q: 0 }],
    [{ R: 0 }, { Q: 0 }],
  ],
  "t-flip-flop": [
    [{ T: 1 }, { Q: 1 }],
    [{ T: 0 }, { Q: 1 }],
    [{ T: 1 }, { Q: 0 }],
    [{ T: 0 }, { Q: 0 }],
  ],
};
/** Clocks, with the inputs that start them: after those, the output must keep changing. */
const CLOCK_START = { "observer-clock": {}, "repeater-clock": { start: 1 } };
/** Outputs that are a pulse: read from just before afterTicks (a button press is a pulse too). */
const TRANSIENT = new Set(["pulse-limiter", "pulse-extender"]);

const cellAt = (o, p) => [o[0] + p[0], o[1] + p[1], o[2] + p[2]];

/**
 * Builds a design at `o` with /setblock from the Java mapping: first everything that needs no support, then the
 * rest, each layer from the bottom. Java's /setblock updates neighbours, so the game works dust shapes out itself.
 */
async function buildJava(model, o) {
  const [sx, sy, sz] = model.size;
  await cmd(`fill ${at(add(o, [-1, -1, -1]))} ${at(add(o, [sx, sy + 1, sz]))} minecraft:air`);
  await cmd("kill @e[type=item]");
  const cells = javaCells(model);
  const supported = (c) => {
    const b = model.blocks.get(c.pos.join(","));
    return b ? registryEntry(b.type)?.needsSupport != null : true;
  };
  for (const c of [...cells.filter((c) => !supported(c)), ...cells.filter(supported)]) {
    await cmd(`setblock ${at(cellAt(o, c.pos))} ${javaStateString(c.id, c.states)}`, 0);
  }
  await sleep(600);
}

/**
 * Drives an input. A lever or plate is set to the value; a button value of 1 is a press, released after its pulse
 * length. As on Bedrock, /setblock of a powered lever or button does not update the neighbours of the block it
 * hangs on, so that block is swapped for another conducting full block and back (Java needs no gap between them).
 */
async function driveInput(model, port, value, o) {
  const b = model.blocks.get(port.pos.join(","));
  const where = cellAt(o, port.pos);
  const face = attachedFace(b);
  const supportRel = face ? port.pos.map((v, i) => v + DIRS[face][i]) : null;
  const support = supportRel ? model.blocks.get(supportRel.join(",")) : undefined;
  const standIn = support?.type === "stone" ? block("concrete") : block("stone");
  const set = async (states) => {
    await cmd(`setblock ${at(where)} ${spec(block(b.type, { ...b.states, ...states }))}`, 0);
    if (support && registryEntry(support.type)?.conductsPower) {
      const s = cellAt(o, supportRel);
      await cmd(`setblock ${at(s)} ${spec(standIn)}`, 0);
      await cmd(`setblock ${at(s)} ${spec(block(support.type, support.states))}`, 0);
    }
  };
  if (b.type !== "button") return set(b.type === "lever" ? { on: value === 1 } : { on: value === 1 });
  if (value !== 1) return;
  const ticks = registryEntry("button").sim.params.pulseTicks[b.states.material] ?? 10;
  const pressedAt = Date.now();
  await set({ pressed: true });
  setTimeout(() => void set({ pressed: false }), Math.max(0, pressedAt + ticks * 100 - Date.now()));
}

/** Reads an output port: lamps by their lit state, pistons by the head on their facing side, dust by its level. */
async function readOutput(model, port, o, expected) {
  const b = model.blocks.get(port.pos.join(","));
  const p = cellAt(o, port.pos);
  if (b.type === "lamp") return (await isBlock(p, "minecraft:redstone_lamp[lit=true]")) ? 1 : 0;
  if (b.type === "piston" || b.type === "sticky_piston")
    return (await isBlock(add(p, OFF[b.states.facing]), "minecraft:piston_head")) ? 1 : 0;
  if (b.type === "dust") {
    const order = [...new Set([expected, 0, 15, ...Array.from({ length: 16 }, (_, k) => k)])].filter(
      (k) => k !== undefined,
    );
    for (const level of order) if (await isBlock(p, `minecraft:redstone_wire[power=${level}]`)) return level;
    throw new Error(`no dust at ${at(p)}`);
  }
  if (b.type === "door")
    return (await isBlock(p, `minecraft:${b.states.material === "iron" ? "iron" : "oak"}_door[open=true]`))
      ? 1
      : 0;
  throw new Error(`cannot read ${b.type}`);
}

/** Reads until the output shows `expected` or 3 s pass, from afterTicks (or just before it, for a pulse). */
async function readUntil(model, port, o, expected, afterTicks, early) {
  await sleep(early ? Math.max(50, afterTicks * 50 * 2 - 300) : afterTicks * 100 + 300);
  const deadline = Date.now() + 3000;
  if (model.blocks.get(port.pos.join(","))?.type === "dust") {
    // Dust is polled for the expected level alone until the deadline (an observer clock's dust is lit for 2 game
    // ticks at a time), then read in full for the report.
    const id = `minecraft:redstone_wire[power=${expected}]`;
    while (Date.now() < deadline) if (await isBlock(cellAt(o, port.pos), id)) return expected;
    return readOutput(model, port, o, expected);
  }
  let actual = await readOutput(model, port, o, expected);
  while (actual !== expected && Date.now() < deadline) {
    await sleep(100);
    actual = await readOutput(model, port, o, expected);
  }
  return actual;
}

const pressesButton = (model, set) =>
  Object.entries(set).some(([name, v]) => {
    const pos = model.ports.inputs.find((p) => p.name === name)?.pos;
    return v === 1 && pos && model.blocks.get(pos.join(","))?.type === "button";
  });

async function patterns() {
  for (const [index, model] of javaPatterns().entries()) {
    const slug = model.meta.slug;
    const area = `pattern ${slug}`;
    const o = [2 + (index % 2) * 38, FLOOR + 10, 2 + Math.floor(index / 2) * 9];
    const build = () => buildJava(model, o);
    await check(area, "dust shapes: ours equal the game's after an update", async () => {
      await build();
      const wrong = [];
      let checked = 0;
      for (const [key, b] of model.blocks) {
        if (b.type !== "dust") continue;
        const pos = key.split(",").map(Number);
        const above = cellAt(o, add(pos, OFF.up));
        if (!(await isBlock(above, "minecraft:air"))) continue;
        // An update from above makes the game work the wire's shape out again from its neighbours.
        await cmd(`setblock ${at(above)} minecraft:glass`, 0);
        await cmd(`setblock ${at(above)} minecraft:air`, 0);
        const ours = dustShape((q) => model.blocks.get(q.join(",")), pos);
        const want = Object.entries(ours)
          .map(([k, v]) => `${k}=${v}`)
          .join(",");
        checked++;
        if (!(await isBlock(cellAt(o, pos), `minecraft:redstone_wire[${want}]`)))
          wrong.push(`${key} ${want}`);
      }
      return [
        wrong.length === 0,
        wrong.length ? `differs: ${wrong.slice(0, 4).join("; ")}` : `${checked} wires`,
      ];
    });
    for (const [i, t] of model.tests.entries()) {
      for (const [name, expected] of Object.entries(t.expect)) {
        await check(area, `test ${i}: set ${JSON.stringify(t.set)} expect ${name}=${expected}`, async () => {
          await build();
          for (const [input, value] of Object.entries(t.set)) {
            await driveInput(
              model,
              model.ports.inputs.find((p) => p.name === input),
              value,
              o,
            );
          }
          const port = model.ports.outputs.find((p) => p.name === name);
          const early = TRANSIENT.has(slug) || pressesButton(model, t.set);
          const actual = await readUntil(model, port, o, expected, t.afterTicks, early);
          return [actual === expected, `actual ${actual}`];
        });
      }
    }
    const sequence = SEQUENCES[slug];
    if (sequence) {
      await check(
        area,
        `sequence ${sequence.map(([s, e]) => `${JSON.stringify(s)}->${JSON.stringify(e)}`).join(" ")}`,
        async () => {
          await build();
          const seen = [];
          for (const [set, expect] of sequence) {
            for (const [name, value] of Object.entries(set))
              await driveInput(
                model,
                model.ports.inputs.find((p) => p.name === name),
                value,
                o,
              );
            await sleep(pressesButton(model, set) ? 2500 : 1000);
            for (const [name, value] of Object.entries(expect))
              seen.push(
                (await readOutput(
                  model,
                  model.ports.outputs.find((p) => p.name === name),
                  o,
                  value,
                )) === value,
              );
          }
          return [seen.every(Boolean), `steps ok: ${seen.join(",")}`];
        },
      );
    }
    const start = CLOCK_START[slug];
    if (start) {
      await check(area, "output changes over time (clock)", async () => {
        await build();
        for (const [name, value] of Object.entries(start))
          await driveInput(
            model,
            model.ports.inputs.find((p) => p.name === name),
            value,
            o,
          );
        await sleep(1500);
        const port = model.ports.outputs[0];
        const out = model.blocks.get(port.pos.join(","));
        const p = cellAt(o, port.pos);
        const sample =
          out.type === "dust"
            ? async () => ((await isBlock(p, "minecraft:redstone_wire[power=0]")) ? 0 : 1)
            : () => readOutput(model, port, o);
        const samples = [];
        const until = Date.now() + 8000;
        const changed = () => samples.includes(0) && samples.some((v) => v > 0);
        while (!changed() && Date.now() < until) samples.push(await sample());
        return [changed(), `samples ${samples.join(",")}`];
      });
    }
    if (slug === "hopper-sorter") {
      await check(area, "sorts iron ingots out of the stream and lets cobblestone pass", async () => {
        await build();
        const filter = cellAt(o, [2, 2, 0]);
        const stream = cellAt(o, [1, 3, 0]);
        const lamp = model.ports.outputs.find((p) => p.name === "sorted");
        await cmd(`item replace block ${at(filter)} container.0 with minecraft:iron_ingot 18`);
        for (let slot = 1; slot <= 4; slot++)
          await cmd(`item replace block ${at(filter)} container.${slot} with minecraft:stick 1`);
        await sleep(1500);
        const idle = await readOutput(model, lamp, o);
        await cmd(`item replace block ${at(stream)} container.0 with minecraft:cobblestone 1`, 4000);
        const afterCobble = await readOutput(model, lamp, o);
        await cmd(`item replace block ${at(stream)} container.0 with minecraft:iron_ingot 1`, 3000);
        await cmd(`item replace block ${at(stream)} container.0 with minecraft:iron_ingot 1`, 4000);
        const afterIron = await readOutput(model, lamp, o);
        return [
          idle === 0 && afterCobble === 0 && afterIron === 1,
          `collector lamp: loaded ${idle}, after cobblestone ${afterCobble}, after two iron ingots ${afterIron}`,
        ];
      });
    }
  }
}

await forceloadCheckArea();
if (!only || only === "probes") await probes();
if (!only || only === "patterns") await patterns();

const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count("pass")} passed, ${count("fail")} failed, ${count("skipped")} skipped`);
console.log(JSON.stringify({ when: new Date().toISOString(), container, results }));
process.exitCode = count("fail") > 0 ? 1 : 0;
