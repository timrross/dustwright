// Measures Java redstone delays in game ticks with the game frozen (`/tick freeze`) and stepped one tick at a time
// (`/tick step 1`), so console timing adds no slack: an input is changed while frozen, then the game advances tick by
// tick until the output changes. The simulator's JAVA_MECHANICS timing comes from this table.
//   node deploy/test-world-java/measure-timing.mjs [container] > timing-java.json
import {
  add,
  at,
  block,
  blocks,
  cmd,
  FLOOR,
  forceloadCheckArea,
  isBlock,
  OFF,
  sleep,
  spec,
  useContainer,
} from "./rcon.mjs";

const container = process.argv[2] ?? "dustwright-test-java";
useContainer(container);

const site = [20, FLOOR + 20, 50];
const put = (p, b) => cmd(`setblock ${at(p)} ${spec(b)}`);

async function clear() {
  await cmd(`fill ${at(add(site, [-4, -2, -2]))} ${at(add(site, [6, 3, 2]))} minecraft:air`);
  await cmd(`fill ${at(add(site, [-4, -1, -2]))} ${at(add(site, [6, -1, 2]))} minecraft:stone`);
}

/** Steps the frozen game one tick at a time until `done()` holds; returns the ticks taken, or null after `max`. */
async function ticksUntil(done, max = 40) {
  for (let t = 1; t <= max; t++) {
    await cmd("tick step 1", 120);
    if (await done()) return t;
  }
  return null;
}

/** Each case builds while the game runs, freezes it, changes the input, and counts ticks to each expected change. */
const CASES = [
  {
    label: "torch turns off (its block powered by a lever on top)",
    key: "torch",
    async build() {
      await put(site, block("stone"));
      await put(add(site, OFF.east), block("torch", { mount: "west", lit: true }));
    },
    // A lever set by /setblock does not update the neighbours of its block, so the block is swapped and back (the
    // in-game check does the same); both happen in the frozen tick, before any stepping.
    input: async () => {
      await put(add(site, OFF.up), block("lever", { mount: "floor", on: true }));
      await put(site, block("concrete"));
      await put(site, block("stone"));
    },
    done: () => isBlock(add(site, OFF.east), "minecraft:redstone_wall_torch[lit=false]"),
  },
  ...[1, 2, 3, 4].map((delay) => ({
    label: `repeater delay ${delay} turns on`,
    key: `repeater${delay}`,
    async build() {
      await put(add(site, OFF.east), block("repeater", { facing: "east", delay }));
    },
    input: () => put(site, block("lever", { mount: "floor", on: true })),
    done: () => isBlock(add(site, OFF.east), "minecraft:repeater[powered=true]"),
  })),
  {
    label: "comparator turns on",
    key: "comparator",
    async build() {
      await put(add(site, OFF.east), block("comparator", { facing: "east" }));
    },
    input: () => put(site, block("lever", { mount: "floor", on: true })),
    done: () => isBlock(add(site, OFF.east), "minecraft:comparator[powered=true]"),
  },
  {
    label: "observer fires after the block it watches changes",
    key: "observer",
    async build() {
      await put(site, block("observer", { facing: "east" }));
    },
    input: () => put(add(site, OFF.east), block("glass")),
    done: () => isBlock(site, "minecraft:observer[powered=true]"),
    then: {
      label: "observer pulse length",
      key: "observerPulse",
      done: () => isBlock(site, "minecraft:observer[powered=false]"),
    },
  },
  {
    label: "piston extends (its head appears)",
    key: "piston",
    async build() {
      await put(site, block("piston", { facing: "east" }));
    },
    input: () => put(add(site, OFF.west), block("lever", { mount: "floor", on: true })),
    done: () => isBlock(add(site, OFF.east), "minecraft:piston_head"),
  },
  {
    label: "door opens",
    key: "doorOpen",
    async build() {
      await put(add(site, OFF.down), block("stone"));
      for (const b of blocks("door", { facing: "north" })) await put(add(site, b.offset), b);
    },
    input: () => put(add(site, OFF.west), block("lever", { mount: "floor", on: true })),
    done: () => isBlock(site, "minecraft:oak_door[open=true]"),
  },
  {
    label: "trapdoor opens",
    key: "trapdoorOpen",
    async build() {
      await put(site, block("trapdoor", { facing: "north" }));
    },
    input: () => put(add(site, OFF.west), block("lever", { mount: "floor", on: true })),
    done: () => isBlock(site, "minecraft:oak_trapdoor[open=true]"),
  },
  {
    label: "lamp turns on",
    key: "lampOn",
    async build() {
      await put(site, block("lamp"));
    },
    input: () => put(add(site, OFF.west), block("lever", { mount: "floor", on: true })),
    done: () => isBlock(site, "minecraft:redstone_lamp[lit=true]"),
  },
  {
    label: "lamp turns off",
    key: "lampOff",
    async build() {
      // Lamp first: a lamp set by /setblock checks its power only when a neighbour changes.
      await put(site, block("lamp"));
      await put(add(site, OFF.west), block("lever", { mount: "floor", on: true }));
    },
    input: () => put(add(site, OFF.west), block("lever", { mount: "floor", on: false })),
    done: () => isBlock(site, "minecraft:redstone_lamp[lit=false]"),
  },
];

await forceloadCheckArea();
const table = {};
const REPEATS = 5;
try {
  for (const c of CASES) {
    const runs = [];
    const thenRuns = [];
    for (let r = 0; r < REPEATS; r++) {
      await cmd("tick unfreeze");
      await clear();
      await c.build();
      await sleep(400);
      await cmd("tick freeze", 150);
      await c.input();
      // A change that happened at once (no tick) counts as 0.
      runs.push((await c.done()) ? 0 : await ticksUntil(c.done));
      if (c.then) thenRuns.push(await ticksUntil(c.then.done));
    }
    table[c.key] = { label: c.label, gameTicks: runs };
    if (c.then) table[c.then.key] = { label: c.then.label, gameTicks: thenRuns };
    process.stderr.write(
      `${c.label.padEnd(52)} ${runs.join(",")}${c.then ? `  then ${thenRuns.join(",")}` : ""}\n`,
    );
  }
} finally {
  await cmd("tick unfreeze");
}
console.log(
  JSON.stringify(
    { when: new Date().toISOString(), container, tool: "deploy/test-world-java/measure-timing.mjs", table },
    null,
    1,
  ),
);
