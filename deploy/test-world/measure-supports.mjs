// Measures in game which blocks can hold which components: floor components on top, wall components on a side,
// ceiling components underneath. The registry's support data comes from
// this table (`faces` in packages/core/registry), never from memory.
//   node deploy/test-world/measure-supports.mjs [container] > supports.json
// A component counts as held by a block when it survives a neighbour update while the block is there and breaks
// when the block is removed. Works only inside an 80 x 64 area at the world origin.
import { REGISTRY } from "../../packages/core/dist/index.js";
import {
  add,
  at,
  block,
  cmd,
  isBlock,
  OFF,
  sleep,
  spec,
  stalled,
  useContainer,
  worldTicks,
} from "./console.mjs";

const container = process.argv[2] ?? "dustwright-test";
useContainer(container);

/** Candidate support blocks: every registry type in its default state, plus the variants that change its shape. */
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

/** Components and the side of them the support is on. */
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

const site = [40, 20, 30];
const table = {};
if (!(await worldTicks(true))) stalled("before measuring");
for (const s of SUPPORTS) {
  table[s.label] = {};
  for (const c of COMPONENTS) {
    await cmd(`fill ${at(add(site, [-2, -2, -2]))} ${at(add(site, [2, 3, 2]))} minecraft:air`);
    await cmd("kill @e[type=item]");
    const supportPos = add(site, OFF[c.face]);
    const supportBlock = block(s.type, s.states);
    await cmd(`setblock ${at(supportPos)} ${spec(supportBlock)}`);
    const comp = block(c.type, c.states);
    await cmd(`setblock ${at(site)} ${spec(comp)}`);
    if (c.type === "door")
      await cmd(
        `setblock ${at(add(site, OFF.up))} ${spec({ ...comp, states: { ...comp.states, upper_block_bit: true } })}`,
      );
    await sleep(150);
    // A neighbour update from a side that is neither the support nor (for doors) the upper half.
    const other = add(site, c.face === "west" ? OFF.east : OFF.north);
    await cmd(`setblock ${at(other)} minecraft:glass`);
    await cmd(`setblock ${at(other)} minecraft:air`, 300);
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
if (!(await worldTicks(false))) stalled("after measuring");
console.log(
  JSON.stringify(
    { when: new Date().toISOString(), container, tool: "deploy/test-world/measure-supports.mjs", table },
    null,
    1,
  ),
);
