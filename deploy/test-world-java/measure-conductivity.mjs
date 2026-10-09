// Measures which blocks conduct power on Java: a repeater points into the block, and a lamp on the far side must
// light (a conducting block is strongly powered by the repeater and powers the lamp). The registry's Java
// `conductsPower` comes from this table.
//   node deploy/test-world-java/measure-conductivity.mjs [container] > conductivity-java.json
import { REGISTRY } from "../../packages/core/dist/index.js";
import {
  add,
  at,
  block,
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
await forceloadCheckArea();
const site = [60, FLOOR + 25, 10];
const put = (p, b) => cmd(`setblock ${at(p)} ${spec(b)}`, 0);
const table = {};
/** Builds lamp, block, and a repeater pointing into the block; powers the repeater only when `powered`. */
async function lampLights(type, powered) {
  await cmd(`fill ${at(add(site, [-3, -1, -1]))} ${at(add(site, [2, 1, 1]))} minecraft:air`);
  const lamp = add(site, OFF.east);
  await put(lamp, block("lamp"));
  await put(site, block(type));
  // Lamp first, then the block, then the repeater on a stone block, and its power last.
  const rep = add(site, OFF.west);
  await put(add(rep, OFF.down), block("stone"));
  await put(rep, block("repeater", { facing: "east" }));
  if (powered) await put(add(rep, OFF.west), block("redstone_block"));
  else await put(add(rep, OFF.west), block("stone"));
  await sleep(400);
  return isBlock(lamp, "minecraft:redstone_lamp[lit=true]");
}
for (const e of REGISTRY.filter((x) => x.needsSupport === null && x.type !== "door")) {
  // The control: a block that lights the lamp with the repeater unpowered is a source, and says nothing about
  // conducting (a redstone block; a daylight sensor in daylight).
  const alone = await lampLights(e.type, false);
  const runs = [];
  for (let r = 0; r < 3; r++) runs.push(await lampLights(e.type, true));
  table[e.type] = alone ? { conducts: null, lightsAlone: true } : { conducts: runs.every(Boolean), runs };
  process.stderr.write(`${e.type.padEnd(16)} ${alone ? "lights the lamp alone" : runs.join(",")}\n`);
}
console.log(
  JSON.stringify(
    {
      when: new Date().toISOString(),
      container,
      tool: "deploy/test-world-java/measure-conductivity.mjs",
      table,
    },
    null,
    1,
  ),
);
