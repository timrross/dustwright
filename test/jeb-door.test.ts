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
});
