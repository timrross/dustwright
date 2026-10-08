import {
  ALL_FACES,
  attachedFace,
  conducts,
  dustNeighbours as coreDustNeighbours,
  dustPointsInto as coreDustPointsInto,
  faceKind,
  holdsOnFace,
  HORIZONTAL,
  isPowerSource,
  keyPos,
  OPPOSITE,
  outputFace,
  posKey,
  registryEntry,
  stepPos,
} from "@dustwright/core";
import type { Block, BlockLookup, Face, Model, Pos } from "@dustwright/core";

/**
 * A static, conservative picture of where power can come from in a design: enough for stage 2 warnings, not a
 * simulation (that is stage 3). Every helper reads the model only; the topology itself (directions, dust
 * connections, diode faces) lives in core, shared with the simulator.
 *
 * VERIFY-IN-GAME: the mechanics assumed here (dust loses one level per block from 15; a torch strongly powers the
 * block above it; a lever or button strongly powers the block it is attached to; a diode strongly powers the block
 * it faces) are not read from pinned data. They only shape warnings; the simulator's game cross-check (M6) is what
 * exercises them.
 */

export { ALL_FACES as ALL, attachedFace, conducts, faceKind, holdsOnFace, HORIZONTAL, OPPOSITE, outputFace };
export const step = stepPos;
export const isSource = isPowerSource;
export const blockAt = (model: Model, p: Pos): Block | undefined => model.blocks.get(posKey(p));
const lookup =
  (model: Model): BlockLookup =>
  (p) =>
    model.blocks.get(posKey(p));
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/**
 * A conducting block is strongly powered when a diode or observer outputs into it, a torch stands below it, or a
 * lever or button is attached to it.
 */
export function stronglyPowered(model: Model, p: Pos): boolean {
  if (!conducts(blockAt(model, p))) return false;
  for (const f of ALL_FACES) {
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
  for (const f of ALL_FACES) {
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
export const dustNeighbours = (model: Model, p: Pos): Pos[] => coreDustNeighbours(lookup(model), p);

/** Whether dust at `p` powers the block next to it in direction `f`: dust pointing that way, or a lone dot. */
export const dustPointsInto = (model: Model, p: Pos, f: Face): boolean =>
  coreDustPointsInto(lookup(model), p, f);

/** Dust networks: connected groups of dust cells. */
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
  for (const f of ALL_FACES) {
    if (f === "up") continue;
    const q = step(p, f);
    const n = blockAt(model, q);
    if (!n || n.type === "dust") continue;
    if (registryEntry(n.type)?.category === "consumer") return true;
    if ((n.type === "repeater" || n.type === "comparator") && str(n.states.facing) === f) return true;
    if (!conducts(n) || (f !== "down" && !dustPointsInto(model, p, f))) continue;
    if (ALL_FACES.some((g) => g !== OPPOSITE[f] && takesFromBlock(model, step(q, g), g))) return true;
  }
  return false;
}
