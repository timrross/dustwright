import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseText } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import { settle } from "@dustwright/sim";

// The Jeb door opens in two stages and closes in reverse (examples/jeb-door.rsd.json). Its tests cannot say "in
// this order", so this steps the simulator and records where the lower west door block is, game tick by tick.
const root = fileURLToPath(new URL("..", import.meta.url));
const model = parseText(readFileSync(`${root}/examples/jeb-door.rsd.json`, "utf8")).model as Model;

describe("Jeb door", () => {
  it("opens: front pistons pull the blocks back, then side pistons pull them aside; closes in reverse", () => {
    const sim = settle(model);
    const stone = (x: number, z: number) => sim.snapshot().blocks.get(`${x},3,${z}`)?.type === "stone";
    // Where the west door block is: flush in the skin, pulled back to the middle of the cavity, or aside.
    const where = () => (stone(5, 1) ? "skin" : stone(5, 2) ? "middle" : stone(4, 2) ? "aside" : "moving");
    const stages = (value: number) => {
      sim.setInput([5, 3, 0], value);
      const seen: string[] = [];
      for (let t = 0; t < 80; t++) {
        const w = where();
        if (w !== "moving" && seen.at(-1) !== w) seen.push(w);
        sim.step();
      }
      return seen;
    };
    expect(where()).toBe("skin");
    expect(stages(1)).toEqual(["skin", "middle", "aside"]);
    expect(stages(0)).toEqual(["aside", "middle", "skin"]);
    // Open, the way through is clear: the doorway cells of the skin, cavity and front-piston rows are air.
    stages(1);
    for (const z of [1, 2, 3])
      for (const y of [3, 4])
        for (const x of [5, 6])
          expect(sim.snapshot().blocks.get(`${x},${y},${z}`), `${x},${y},${z}`).toBeUndefined();
  });

  // The upper front pistons get their signal through a tower of three torches, the lower ones through one torch;
  // the repeaters before each are set so that both rows move on the same game tick.
  it("moves the upper and lower door blocks on the same tick, opening and closing, from either plate", () => {
    for (const plate of [0, 7]) {
      const sim = settle(model);
      const inSkin = (x: number, y: number) => sim.snapshot().blocks.get(`${x},${y},1`)?.type === "stone";
      /** The game tick, counted from the change of the plate, at which each of the four door blocks leaves or reaches the skin. */
      const changes = (value: number) => {
        sim.setInput([5, 3, plate], value);
        const cells = [5, 6].flatMap((x) => [3, 4].map((y) => [x, y] as const));
        const before = cells.map(([x, y]) => inSkin(x, y));
        const at = cells.map(() => -1);
        for (let t = 1; t <= 80; t++) {
          sim.step();
          cells.forEach(([x, y], i) => {
            if (at[i] === -1 && inSkin(x, y) !== before[i]) at[i] = t;
          });
        }
        return at;
      };
      for (const value of [1, 0]) {
        const at = changes(value);
        expect(at[0], `plate z${plate}, ${value ? "opening" : "closing"}`).toBeGreaterThan(0);
        expect(new Set(at).size, `plate z${plate}, ${value ? "opening" : "closing"}: ${at.join(", ")}`).toBe(
          1,
        );
      }
    }
  });
});
