import type { Pos } from "./types.js";

/** The map key for a position: `"x,y,z"`. */
export function posKey(p: Pos): string {
  return `${p[0]},${p[1]},${p[2]}`;
}

/** Parses a `"x,y,z"` key back into a position. */
export function keyPos(key: string): Pos {
  const [x, y, z] = key.split(",").map(Number) as [number, number, number];
  return [x, y, z];
}

/** True when `p` lies inside a bounding box of `size`. */
export function inBounds(p: Pos, size: Pos): boolean {
  return p[0] >= 0 && p[1] >= 0 && p[2] >= 0 && p[0] < size[0] && p[1] < size[1] && p[2] < size[2];
}

/** Adds an offset to a position. */
export function offsetPos(p: Pos, o: readonly [number, number, number]): Pos {
  return [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
}
