// Measures in the Java test world which blocks can hold which components, as deploy/test-world/measure-supports.mjs
// does for Bedrock: floor components on top, wall components on a side, ceiling components underneath. The
// registry's `faces.java` comes from this table, never from memory.
//   node deploy/test-world-java/measure-supports.mjs [container] > supports-java.json
// A component counts as held when it survives its support being placed beside it and breaks when the support is
// removed. /setblock places most components without checking they can stay (a wall torch stays in mid-air, and on
// the side of a bottom slab), and Java re-checks one only when an update comes from its support's side, so the
// component goes in first and the support second. Dust is the exception: it checks as it is placed (in mid-air it
// pops at once), so its support goes in first (all measured by hand on 26.3 before this script was fixed).
//   --only <label,label>  measure only those components (labels as in COMPONENTS)
import { REGISTRY } from "../../packages/core/dist/index.js";
import {
  add,
  at,
  blocks,
  cmd,
  forceloadCheckArea,
  isBlock,
  OFF,
  sleep,
  spec,
  useContainer,
} from "./rcon.mjs";

const container = process.argv[2]?.startsWith("--")
  ? "dustwright-test-java"
  : (process.argv[2] ?? "dustwright-test-java");
useContainer(container);

const SUPPORTS = [
  ...REGISTRY.filter((e) => e.type !== "door").map((e) => ({ label: e.type, type: e.type, states: {} })),
  { label: "slab half=top", type: "slab", states: { half: "top" } },
  { label: "stairs half=top", type: "stairs", states: { half: "top" } },
  { label: "trapdoor half=top", type: "trapdoor", states: { half: "top" } },
  { label: "trapdoor open=true", type: "trapdoor", states: { open: true } },
  { label: "piston facing=north", type: "piston", states: { facing: "north" } },
  { label: "sticky_piston facing=north", type: "sticky_piston", states: { facing: "north" } },
  { label: "observer facing=up", type: "observer", states: { facing: "up" } },
];
const COMPONENTS = [
  { label: "dust", face: "down", type: "dust", states: {} },
  { label: "repeater", face: "down", type: "repeater", states: { facing: "north" } },
  { label: "comparator", face: "down", type: "comparator", states: { facing: "north" } },
  { label: "torch floor", face: "down", type: "torch", states: { mount: "floor" } },
  { label: "lever floor", face: "down", type: "lever", states: { mount: "floor" } },
  { label: "button floor", face: "down", type: "button", states: { mount: "floor" } },
  { label: "pressure_plate", face: "down", type: "pressure_plate", states: {} },
  { label: "door", face: "down", type: "door", states: { facing: "north" } },
  { label: "torch wall", face: "west", type: "torch", states: { mount: "west" } },
  { label: "lever wall", face: "west", type: "lever", states: { mount: "west" } },
  { label: "button wall", face: "west", type: "button", states: { mount: "west" } },
  { label: "lever ceiling", face: "up", type: "lever", states: { mount: "ceiling" } },
  { label: "button ceiling", face: "up", type: "button", states: { mount: "ceiling" } },
];

const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > 0 ? process.argv[onlyArg + 1].split(",") : null;
const site = [40, -40, 30];
await forceloadCheckArea();
const table = {};
for (const s of SUPPORTS) {
  table[s.label] = {};
  for (const c of COMPONENTS.filter((x) => !ONLY || ONLY.includes(x.label))) {
    await cmd(`fill ${at(add(site, [-2, -2, -2]))} ${at(add(site, [2, 3, 2]))} minecraft:air`);
    await cmd("kill @e[type=item]");
    const supportPos = add(site, OFF[c.face]);
    const placeSupport = () => cmd(`setblock ${at(supportPos)} ${spec(blocks(s.type, s.states)[0])}`, 300);
    if (c.type === "dust") await placeSupport();
    for (const b of blocks(c.type, c.states)) await cmd(`setblock ${at(add(site, b.offset))} ${spec(b)}`);
    await sleep(100);
    if (c.type !== "dust") await placeSupport();
    const placed = !(await isBlock(supportPos, "minecraft:air"));
    const survived = !(await isBlock(site, "minecraft:air"));
    await cmd(`setblock ${at(supportPos)} minecraft:air`, 300);
    const broke = await isBlock(site, "minecraft:air");
    table[s.label][c.label] = placed
      ? survived && broke
        ? "holds"
        : survived
          ? "floats"
          : "breaks"
      : "support did not place";
    process.stderr.write(`${s.label.padEnd(28)} ${c.label.padEnd(15)} ${table[s.label][c.label]}\n`);
  }
}
console.log(
  JSON.stringify(
    { when: new Date().toISOString(), container, tool: "deploy/test-world-java/measure-supports.mjs", table },
    null,
    1,
  ),
);
