import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseText } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import { buildLines, clearLines } from "../src/index.js";

/**
 * A command-level model of a world: runs setblock and fill lines relative to an executor at the origin. It proves
 * the M3 rules about what the functions do (not how the game reacts; that is the in-game check).
 */
function runLines(world: Map<string, string>, lines: readonly string[]): void {
  const num = (t: string) => Number(t.slice(1) || 0);
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    const parts = line.split(" ");
    if (parts[0] === "setblock") {
      world.set(`${num(parts[1]!)},${num(parts[2]!)},${num(parts[3]!)}`, parts.slice(4).join(" "));
    } else if (parts[0] === "fill") {
      const [x1, y1, z1, x2, y2, z2] = parts.slice(1, 7).map(num) as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) world.set(`${x},${y},${z}`, parts[7]!);
    } else throw new Error(`unexpected line ${line}`);
  }
}

const root = fileURLToPath(new URL("../../../", import.meta.url));
const models = readdirSync(`${root}/examples`)
  .filter((f) => f.endsWith(".rsd.json"))
  .map((f) => [f, parseText(readFileSync(`${root}/examples/${f}`, "utf8")).model as Model] as const);

describe("functions in a modelled world", () => {
  it.each(models)("%s: clear then build twice equals clear then build once", (_f, model) => {
    const once = new Map<string, string>();
    runLines(once, clearLines(model));
    runLines(once, buildLines(model));
    const twice = new Map(once);
    runLines(twice, buildLines(model));
    expect(twice).toEqual(once);
  });

  it.each(models)("%s: the build alone never removes a block", (_f, model) => {
    const world = new Map<string, string>();
    // Fill the area around the build with something, then run only the build.
    for (let x = -2; x < model.size[0] + 3; x++)
      for (let y = -1; y < model.size[1] + 2; y++)
        for (let z = -2; z < model.size[2] + 2; z++) world.set(`${x},${y},${z}`, "minecraft:dirt");
    runLines(world, buildLines(model));
    expect([...world.values()].filter((v) => v.includes("minecraft:air"))).toEqual([]);
  });

  it.each(models)("%s: clear covers exactly the bounding box at the origin", (_f, model) => {
    const world = new Map<string, string>();
    runLines(world, clearLines(model));
    expect(world.size).toBe(model.size[0] * model.size[1] * model.size[2]);
    const built = new Map<string, string>();
    runLines(built, buildLines(model));
    for (const key of built.keys()) expect(world.has(key), key).toBe(true);
  });
});
