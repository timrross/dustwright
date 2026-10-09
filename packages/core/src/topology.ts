import { holdsOnFace, registryEntry } from "./registry.js";
import type { Face, SimClass } from "./registry-types.js";
import type { Block, Edition, Pos } from "./types.js";

/**
 * Pure redstone topology shared by the stage 2 rules and the simulator: directions, which way mounted blocks and
 * diodes face, which blocks conduct, and how dust connects. Every helper reads blocks through a lookup, so it works
 * on a parsed model and on the simulator's changing world alike.
 *
 * VERIFY-IN-GAME: how dust connects (to dust on its level, a step up or down unless a conducting block cuts the
 * step, to sources and to a diode's front or back) and that dust with one connection, two in a line, or none powers
 * the blocks it points at are not read from pinned data; the simulator's game cross-check (M6) exercises them.
 */

/** Reads the block at a position, or undefined for air. */
export type BlockLookup = (p: Pos) => Block | undefined;

/** Unit offsets of the six faces. */
export const DIRS: Readonly<Record<Face, Pos>> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};
/** The four horizontal faces. */
export const HORIZONTAL: readonly Face[] = ["north", "south", "east", "west"];
/** All six faces, in a fixed order. */
export const ALL_FACES: readonly Face[] = ["north", "south", "east", "west", "up", "down"];
/** The opposite of each face. */
export const OPPOSITE: Readonly<Record<Face, Face>> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
};

/** The position `k` steps from `p` toward face `f`. */
export const stepPos = (p: Pos, f: Face, k = 1): Pos => [
  p[0] + DIRS[f][0] * k,
  p[1] + DIRS[f][1] * k,
  p[2] + DIRS[f][2] * k,
];

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * A block's simulator behaviour class from the registry (`sim.class`), so the topology follows the registry rather
 * than type names; undefined for air and for anything not in the registry (a piston head).
 */
export const simClass = (b: Block | undefined): SimClass | undefined =>
  b ? registryEntry(b.type)?.sim.class : undefined;
const isDust = (b: Block | undefined) => simClass(b) === "dust";
const isDiode = (b: Block | undefined) => simClass(b) === "repeater" || simClass(b) === "comparator";

/**
 * True when a full block conducts power (stone, wool, lamps, droppers...) in `edition`. The Java mapping may
 * override the entry's value where Java differs (measured: slime conducts on Java).
 */
export const conducts = (b: Block | undefined, edition: Edition = "bedrock"): boolean => {
  const e = b ? registryEntry(b.type) : undefined;
  if (!e) return false;
  return (edition === "java" ? e.java?.conductsPower : undefined) ?? e.conductsPower;
};

/**
 * Blocks that can give power by themselves: torches, levers, buttons, plates, daylight sensors, redstone blocks.
 * A torch counts whatever its `lit` state says: `lit` is only the initial state, which the game recomputes.
 */
export function isPowerSource(b: Block | undefined): boolean {
  if (!b) return false;
  return simClass(b) === "torch" || simClass(b) === "source";
}

/** The face a mounted block (torch, lever, button, dust...) needs its support on, as a direction from it. */
export function attachedFace(b: Block): Face | undefined {
  const rule = registryEntry(b.type)?.needsSupport;
  if (!rule) return undefined;
  if ("face" in rule) return rule.face;
  const v = str(b.states[rule.byState]);
  return v === undefined ? undefined : rule.map[v];
}

/** The direction a diode (repeater or comparator) outputs toward, or an observer's back (its output side). */
export function outputFace(b: Block): Face | undefined {
  if (isDiode(b)) return str(b.states.facing) as Face | undefined;
  if (simClass(b) === "observer") {
    const f = str(b.states.facing) as Face | undefined;
    return f ? OPPOSITE[f] : undefined;
  }
  return undefined;
}

/** The kind of face ("top", "side" or "bottom") a mounted block uses on its support, from the direction to it. */
export const faceKind = (dir: Face): "top" | "side" | "bottom" =>
  dir === "down" ? "top" : dir === "up" ? "bottom" : "side";

/**
 * Whether a mounted block has the support it needs: the measured faces, or on Bedrock for a lever any block that
 * stands by itself (the game would not place components as supports in the measurement, so they do not count).
 * Java levers need a sturdy face like buttons (measured: they break on honey, hoppers, bottom slabs and stairs).
 */
export function isSupported(at: BlockLookup, p: Pos, b: Block, edition: Edition = "bedrock"): boolean {
  const rule = registryEntry(b.type)?.needsSupport;
  const dir = attachedFace(b);
  if (!rule || !dir) return true;
  const support = at(stepPos(p, dir));
  if (!support) return false;
  if ("byState" in rule && rule.anyBlock === true && edition === "bedrock")
    return !registryEntry(support.type)?.needsSupport;
  return holdsOnFace(support, faceKind(dir), edition, b.type);
}

/** Dust cells connected to dust at `p`: same level, or one step up or down a staircase. */
export function dustNeighbours(at: BlockLookup, p: Pos, edition: Edition = "bedrock"): Pos[] {
  const out: Pos[] = [];
  const above = at(stepPos(p, "up"));
  for (const f of HORIZONTAL) {
    const side = stepPos(p, f);
    const s = at(side);
    if (isDust(s)) out.push(side);
    const up = stepPos(side, "up");
    if (isDust(at(up)) && !conducts(above, edition)) out.push(up);
    const down = stepPos(side, "down");
    if (isDust(at(down)) && !conducts(s, edition)) out.push(down);
  }
  return out;
}

/**
 * The horizontal directions dust at `p` connects in: to other dust (on its level or a step up or down), to a
 * source, or to a diode's front or back.
 */
export function dustConnections(at: BlockLookup, p: Pos, edition: Edition = "bedrock"): Set<Face> {
  const dirs = new Set<Face>();
  for (const q of dustNeighbours(at, p, edition)) {
    for (const f of HORIZONTAL) if (q[0] - p[0] === DIRS[f][0] && q[2] - p[2] === DIRS[f][2]) dirs.add(f);
  }
  for (const f of HORIZONTAL) {
    const n = at(stepPos(p, f));
    if (!n || isDust(n)) continue;
    if (isPowerSource(n)) dirs.add(f);
    const facing = isDiode(n) ? str(n.states.facing) : undefined;
    if (facing === f || facing === OPPOSITE[f]) dirs.add(f);
  }
  return dirs;
}

/**
 * Whether dust at `p` powers the block next to it in direction `f` (horizontal): dust whose connections all lie
 * on that axis (pointing at it, or a line through it), or a lone dot.
 */
export function dustPointsInto(at: BlockLookup, p: Pos, f: Face, edition: Edition = "bedrock"): boolean {
  for (const d of dustConnections(at, p, edition)) if (d !== f && d !== OPPOSITE[f]) return false;
  return true;
}
