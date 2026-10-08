import { REGISTRY_ENTRIES } from "./generated/registry.js";
import type { EditionMapping, RegistryEntry, StateMapping } from "./registry-types.js";
import type { Block, Edition, StateValue } from "./types.js";

const BY_TYPE: ReadonlyMap<string, RegistryEntry> = new Map(REGISTRY_ENTRIES.map((e) => [e.type, e]));

/** Every registry entry, sorted by type. */
export const REGISTRY: readonly RegistryEntry[] = REGISTRY_ENTRIES;

/** Looks up a registry entry by abstract type. */
export function registryEntry(type: string): RegistryEntry | undefined {
  return BY_TYPE.get(type);
}

/** The registry types closest to `name` by edit distance, best first (at most `limit`). */
export function closestTypes(name: string, limit = 3): string[] {
  return REGISTRY_ENTRIES.map((e) => ({ type: e.type, d: editDistance(name, e.type) }))
    .filter(
      (x) =>
        x.d <= Math.max(2, Math.floor(name.length / 2)) || x.type.includes(name) || name.includes(x.type),
    )
    .sort((a, b) => a.d - b.d || a.type.localeCompare(b.type))
    .slice(0, limit)
    .map((x) => x.type);
}

function editDistance(a: string, b: string): number {
  if (a.length > 64 || b.length > 64) return Math.abs(a.length - b.length) + 64;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[b.length] ?? 0;
}

/** Renders a state value the way the block spec grammar writes it. */
export function valueText(v: StateValue): string {
  return String(v);
}

/** One target-edition block: its ID and states, at an offset from the abstract block's cell. */
export interface EditionBlock {
  offset: readonly [number, number, number];
  id: string;
  states: Record<string, StateValue>;
}

/** The mapping an edition uses for a registry entry, or undefined when the edition has none yet. */
export function editionMapping(entry: RegistryEntry, edition: Edition): EditionMapping | undefined {
  return (edition === "bedrock" ? entry.bedrock : entry.java) ?? undefined;
}

function mapStates(
  mappings: Readonly<Record<string, StateMapping>>,
  states: Readonly<Record<string, StateValue>>,
): Record<string, StateValue> {
  const out: Record<string, StateValue> = {};
  for (const [name, m] of Object.entries(mappings)) {
    if ("value" in m) {
      out[name] = m.value;
    } else {
      const abstract = states[m.from];
      const mapped = abstract === undefined ? undefined : m.map[valueText(abstract)];
      if (mapped === undefined) throw new Error(`no ${name} mapping for ${m.from}=${String(abstract)}`);
      out[name] = mapped;
    }
  }
  return out;
}

/**
 * Converts a normalised abstract block into the target edition's block(s): usually one, two for a door (its upper
 * half). Throws only if the registry is inconsistent, which the registry tests rule out.
 */
export function toEditionBlocks(block: Block, edition: Edition): EditionBlock[] {
  const entry = BY_TYPE.get(block.type);
  if (!entry) throw new Error(`unknown block type ${block.type}`);
  const mapping = editionMapping(entry, edition);
  if (!mapping) throw new Error(`${block.type} has no ${edition} mapping`);
  let id: string | undefined;
  if (typeof mapping.id === "string") {
    id = mapping.id;
  } else {
    const v = block.states[mapping.id.from];
    id = v === undefined ? undefined : mapping.id.map[valueText(v)];
  }
  if (id === undefined) throw new Error(`no ${edition} id for ${block.type}`);
  const states = mapStates(mapping.states, block.states);
  const result: EditionBlock[] = [{ offset: [0, 0, 0], id, states }];
  if (mapping.upper) {
    result.push({
      offset: mapping.upper.offset,
      id,
      states: { ...states, ...mapStates(mapping.upper.states, block.states) },
    });
  }
  return result;
}

/** The three kinds of face a component can attach to. */
export type FaceKind = "top" | "side" | "bottom";

/**
 * Whether `block` can hold a component on its `kind` face in `edition`, from the faces measured in game. Unknown
 * types and editions without measurements hold nothing.
 */
export function holdsOnFace(block: Block, kind: FaceKind, edition: Edition = "bedrock"): boolean {
  const entry = BY_TYPE.get(block.type);
  const faces = edition === "bedrock" ? entry?.faces.bedrock : entry?.faces.java;
  if (!faces) return false;
  const match = faces.when?.find((w) => Object.entries(w.states).every(([k, v]) => block.states[k] === v));
  return (match ?? faces)[kind];
}
