import { holdsOnFace, keyPos, posKey, registryEntry } from "@dustwright/core";
import type { Block, Edition, Face, Model, Pos } from "@dustwright/core";

/**
 * A static, conservative picture of where power can come from in a design: enough for stage 2 warnings, not a
 * simulation (that is stage 3). Every helper reads the model only.
 *
 * VERIFY-IN-GAME: the mechanics assumed here (dust loses one level per block from 15; dust steps up and down a
 * block unless a conducting block cuts the step; a torch strongly powers the block above it; a lever or button
 * strongly powers the block it is attached to; a diode strongly powers the block it faces) are not read from
 * pinned data. They only shape warnings; the simulator's game cross-check (M6) is what proves them.
 */

export const DIRS: Readonly<Record<Face, Pos>> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};
export const HORIZONTAL: readonly Face[] = ["north", "south", "east", "west"];
export const ALL: readonly Face[] = ["north", "south", "east", "west", "up", "down"];
export const OPPOSITE: Readonly<Record<Face, Face>> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
};

export const step = (p: Pos, f: Face, k = 1): Pos => [
  p[0] + DIRS[f][0] * k,
  p[1] + DIRS[f][1] * k,
  p[2] + DIRS[f][2] * k,
];
export const blockAt = (model: Model, p: Pos): Block | undefined => model.blocks.get(posKey(p));
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * Blocks that can give power by themselves: torches, levers, buttons, plates, daylight sensors, redstone blocks.
 * A torch counts whatever its `lit` state says: `lit` is only the initial state, which the game recomputes.
 */
export function isSource(b: Block | undefined): boolean {
  if (!b) return false;
  return b.type === "torch" || registryEntry(b.type)?.category === "power_source";
}

/** True when a full block conducts power (stone, wool, lamps, droppers...). */
export const conducts = (b: Block | undefined) => !!b && (registryEntry(b.type)?.conductsPower ?? false);

/** The face a mounted block (torch, lever, button) is attached to, as a direction from it. */
export function attachedFace(b: Block): Face | undefined {
  const rule = registryEntry(b.type)?.needsSupport;
  if (!rule) return undefined;
  if ("face" in rule) return rule.face;
  const v = str(b.states[rule.byState]);
  return v === undefined ? undefined : rule.map[v];
}

/** The direction a diode (repeater or comparator) outputs toward, or an observer's back (its output side). */
export function outputFace(b: Block): Face | undefined {
  if (b.type === "repeater" || b.type === "comparator") return str(b.states.facing) as Face | undefined;
  if (b.type === "observer") {
    const f = str(b.states.facing) as Face | undefined;
    return f ? OPPOSITE[f] : undefined;
  }
  return undefined;
}

/**
 * A conducting block is strongly powered when a diode or observer outputs into it, a torch stands below it, or a
 * lever or button is attached to it.
 */
export function stronglyPowered(model: Model, p: Pos): boolean {
  if (!conducts(blockAt(model, p))) return false;
  for (const f of ALL) {
    const n = blockAt(model, step(p, f));
    if (!n) continue;
    const out = outputFace(n);
    if (out && out === OPPOSITE[f]) return true;
    if (n.type === "torch" && f === "down") return true;
    if ((n.type === "lever" || n.type === "button") && attachedFace(n) === OPPOSITE[f]) return true;
  }
  return false;
}

/** Dust that a source, diode, observer or strongly powered block feeds directly. */
export function feedsDust(model: Model, p: Pos): boolean {
  for (const f of ALL) {
    const q = step(p, f);
    const n = blockAt(model, q);
    if (!n) continue;
    if (isSource(n)) return true;
    const out = outputFace(n);
    if (out && out === OPPOSITE[f]) return true;
    if (stronglyPowered(model, q)) return true;
  }
  return false;
}

/** Dust cells connected to `p`: same level, or one step up or down a staircase. */
export function dustNeighbours(model: Model, p: Pos): Pos[] {
  const out: Pos[] = [];
  const above = blockAt(model, step(p, "up"));
  for (const f of HORIZONTAL) {
    const side = step(p, f);
    const s = blockAt(model, side);
    if (s?.type === "dust") out.push(side);
    const up = step(side, "up");
    if (blockAt(model, up)?.type === "dust" && !conducts(above)) out.push(up);
    const down = step(side, "down");
    if (blockAt(model, down)?.type === "dust" && !conducts(s)) out.push(down);
  }
  return out;
}

/**
 * The horizontal directions a dust cell connects in: to other dust (on its level or a step up or down), to a
 * source, or to a diode's front or back. Dust with one connection, or two in a line, points along that line.
 */
export function dustConnections(model: Model, p: Pos): Set<Face> {
  const dirs = new Set<Face>();
  for (const q of dustNeighbours(model, p)) {
    for (const f of HORIZONTAL) if (q[0] - p[0] === DIRS[f][0] && q[2] - p[2] === DIRS[f][2]) dirs.add(f);
  }
  for (const f of HORIZONTAL) {
    const n = blockAt(model, step(p, f));
    if (!n || n.type === "dust") continue;
    if (isSource(n)) dirs.add(f);
    const facing = n.type === "repeater" || n.type === "comparator" ? str(n.states.facing) : undefined;
    if (facing === f || facing === OPPOSITE[f]) dirs.add(f);
  }
  return dirs;
}

/** Whether dust at `p` powers the block next to it in direction `f`: dust pointing that way, or a lone dot. */
export function dustPointsInto(model: Model, p: Pos, f: Face): boolean {
  const dirs = dustConnections(model, p);
  return [...dirs].every((d) => d === f || d === OPPOSITE[f]);
}

/** Dust networks: connected groups of dust cells, with an index from each dust cell to its network. */
export function dustNetworks(model: Model): Pos[][] {
  return dustNetworkIndex(model).networks;
}

/** Dust networks and, for each dust key, the index of its network. Linear in the number of dust cells. */
export function dustNetworkIndex(model: Model): { networks: Pos[][]; of: Map<string, number> } {
  const of = new Map<string, number>();
  const networks: Pos[][] = [];
  for (const [key, b] of model.blocks) {
    if (b.type !== "dust" || of.has(key)) continue;
    const id = networks.length;
    const net: Pos[] = [keyPos(key)];
    of.set(key, id);
    for (let i = 0; i < net.length; i++) {
      for (const q of dustNeighbours(model, net[i] as Pos)) {
        const k = posKey(q);
        if (!of.has(k)) {
          of.set(k, id);
          net.push(q);
        }
      }
    }
    networks.push(net);
  }
  return { networks, of };
}

/** Whether something at `q` takes power from the conducting block next to it, in direction `f` from that block. */
function takesFromBlock(model: Model, q: Pos, f: Face): boolean {
  const n = blockAt(model, q);
  if (!n) return false;
  if (registryEntry(n.type)?.category === "consumer") return true;
  // A diode facing away from the block reads it as input; a torch on the block inverts it.
  if ((n.type === "repeater" || n.type === "comparator") && str(n.states.facing) === f) return true;
  if (n.type === "torch" && attachedFace(n) === OPPOSITE[f]) return true;
  return false;
}

/**
 * Whether a dust cell can deliver power somewhere: next to a consumer or a diode's input, or into a conducting
 * block (the one under it, or one it points into) that passes the power on to a consumer, a diode or a torch.
 */
export function dustReachesConsumer(model: Model, p: Pos): boolean {
  for (const f of ALL) {
    if (f === "up") continue;
    const q = step(p, f);
    const n = blockAt(model, q);
    if (!n || n.type === "dust") continue;
    if (registryEntry(n.type)?.category === "consumer") return true;
    if ((n.type === "repeater" || n.type === "comparator") && str(n.states.facing) === f) return true;
    if (!conducts(n) || (f !== "down" && !dustPointsInto(model, p, f))) continue;
    if (ALL.some((g) => g !== OPPOSITE[f] && takesFromBlock(model, step(q, g), g))) return true;
  }
  return false;
}

/** The face of the neighbour a mounted block needs ("top", "side" or "bottom"), from the direction to it. */
export const faceKind = (dir: Face) => (dir === "down" ? "top" : dir === "up" ? "bottom" : "side");

export { holdsOnFace };
export type { Edition };
