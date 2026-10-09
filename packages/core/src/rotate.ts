import { registryEntry } from "./registry.js";
import type { Block, Pos } from "./types.js";

/** The four horizontal directions in clockwise order, seen from above. */
const CLOCKWISE = ["north", "east", "south", "west"] as const;

/**
 * Turns a block `turns` quarter turns clockwise (seen from above): every orientation state (`facing`, `mount`)
 * holding a horizontal direction moves with it; vertical values (`up`, `down`, `floor`, `ceiling`) and other states
 * (`hinge`, `half`, ...) stay.
 */
export function rotateBlock(block: Block, turns: number): Block {
  const n = ((turns % 4) + 4) % 4;
  if (n === 0) return block;
  const defs = registryEntry(block.type)?.states ?? {};
  const states = { ...block.states };
  for (const [key, value] of Object.entries(states)) {
    if (!defs[key]?.directional) continue;
    const i = CLOCKWISE.indexOf(value as (typeof CLOCKWISE)[number]);
    if (i >= 0) states[key] = CLOCKWISE[(i + n) % 4] as string;
  }
  return { ...block, states };
}

/**
 * Turns a position in a box of `size` by `turns` quarter turns clockwise (seen from above), into the turned box:
 * north (-z) becomes east (+x). Returns the position in the turned box, whose size swaps x and z on odd turns.
 */
export function rotatePos(pos: Pos, size: readonly [number, number, number], turns: number): Pos {
  const y = pos[1];
  let [x, , z] = pos;
  let [w, , l] = size;
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    [x, z] = [l - 1 - z, x];
    [w, l] = [l, w];
  }
  return [x, y, z];
}
