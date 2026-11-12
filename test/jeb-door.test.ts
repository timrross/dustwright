import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseText } from "@dustwright/core";
import type { Model, Pos } from "@dustwright/core";
import { settle } from "@dustwright/sim";

// The Jeb door opens in two stages and closes in reverse (examples/jeb-door.rsd.json). Its tests cannot say "in
// this order", so this steps the simulator and records where the door blocks are, game tick by game tick.
const root = fileURLToPath(new URL("..", import.meta.url));
const model = parseText(readFileSync(`${root}/examples/jeb-door.rsd.json`, "utf8")).model as Model;
/** The stone button on the frame outside (one press is a pulse) and a pressure plate inside (held). */
const BUTTON: Pos = [4, 3, 0];
const PLATE: Pos = [5, 3, 7];
const DOOR = [5, 6].flatMap((x) => [3, 4].map((y) => [x, y] as const));

function door() {
  const sim = settle(model);
  const type = (x: number, y: number, z: number) => sim.snapshot().blocks.get(`${x},${y},${z}`)?.type;
  const stone = (x: number, z: number) => type(x, 3, z) === "stone";
  return {
    sim,
    /** Where the lower west door block is: flush in the skin, pulled back to the middle of the cavity, or aside. */
    where: () => (stone(5, 1) ? "skin" : stone(5, 2) ? "middle" : stone(4, 2) ? "aside" : "moving"),
    /** Whether each of the four door blocks is in the skin. */
    inSkin: () => DOOR.map(([x, y]) => type(x, y, 1) === "stone"),
    /** Whether the way through is clear: the doorway cells of the skin, cavity and front-piston rows are air. */
    clear: () => [1, 2, 3].every((z) => DOOR.every(([x, y]) => type(x, y, z) === undefined)),
  };
}

describe("Jeb door", () => {
  it("a press of the button opens it in two stages, holds the way clear, and closes it in reverse", () => {
    const d = door();
    expect(d.where()).toBe("skin");
    d.sim.setInput(BUTTON, 1);
    const seen: string[] = [];
    let clearTicks = 0;
    for (let t = 0; t < 200; t++) {
      const w = d.where();
      if (w !== "moving" && seen.at(-1) !== w) seen.push(w);
      if (d.clear()) clearTicks++;
      d.sim.step();
    }
    expect(seen).toEqual(["skin", "middle", "aside", "middle", "skin"]);
    // A stone button's pulse is 1 s; the pulse extender under the floor keeps the way clear for 1.5 s or more.
    expect(clearTicks).toBeGreaterThanOrEqual(30);
  });

  it("a plate inside holds it open while stood on, and leaving closes it", () => {
    const d = door();
    const stages = (value: number) => {
      d.sim.setInput(PLATE, value);
      const seen: string[] = [];
      for (let t = 0; t < 80; t++) {
        const w = d.where();
        if (w !== "moving" && seen.at(-1) !== w) seen.push(w);
        d.sim.step();
      }
      return seen;
    };
    expect(stages(1)).toEqual(["skin", "middle", "aside"]);
    expect(d.clear()).toBe(true);
    expect(stages(0)).toEqual(["aside", "middle", "skin"]);
  });

  // The upper front pistons get their signal through a tower of three torches, the lower ones through one torch;
  // the repeaters before each are set so that both rows move on the same game tick.
  it("moves the upper and lower door blocks on the same tick, opening and closing, from the button and the plate", () => {
    for (const [name, input] of [
      ["button", BUTTON],
      ["plate", PLATE],
    ] as const) {
      const d = door();
      /** The game ticks, counted from the press, at which each door block leaves the skin and is back in it. */
      const left = DOOR.map(() => -1);
      const back = DOOR.map(() => -1);
      d.sim.setInput(input, 1);
      for (let t = 1; t <= 240; t++) {
        // The button releases itself; the plate is left after 3 s.
        if (name === "plate" && t === 60) d.sim.setInput(input, 0);
        d.sim.step();
        d.inSkin().forEach((skin, i) => {
          if (left[i] === -1 && !skin) left[i] = t;
          if (left[i] !== -1 && back[i] === -1 && skin) back[i] = t;
        });
      }
      for (const [what, at] of [
        ["opening", left],
        ["closing", back],
      ] as const) {
        expect(at[0], `${name}, ${what}`).toBeGreaterThan(0);
        expect(new Set(at).size, `${name}, ${what}: ${at.join(", ")}`).toBe(1);
      }
    }
  });
});
