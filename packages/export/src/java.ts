import {
  conducts,
  diag,
  holdsOnFace,
  isValidSlug,
  keyPos,
  LIMITS,
  PINS,
  registryEntry,
  toEditionBlocks,
} from "@dustwright/core";
import type { Block, ExportOptions, ExportResult, Exporter, Model, StateValue } from "@dustwright/core";

/** One Java block in a built design, at its absolute cell (a door's upper half is its own cell). */
export interface JavaCell {
  pos: readonly [number, number, number];
  id: string;
  states: Record<string, StateValue>;
}

const HORIZONTAL = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] } as const;
type Horizontal = keyof typeof HORIZONTAL;
const add = (p: readonly number[], d: readonly number[]): [number, number, number] => [
  (p[0] ?? 0) + (d[0] ?? 0),
  (p[1] ?? 0) + (d[1] ?? 0),
  (p[2] ?? 0) + (d[2] ?? 0),
];
const OPPOSITE: Record<Horizontal, Horizontal> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

/** Types whose Java blocks are signal sources: dust beside them connects (a side). */
const SOURCE_CLASSES = new Set(["source", "torch", "comparator"]);

/**
 * The connections a Java redstone wire shows, from its neighbours: Java stores them in the block state (north,
 * south, east, west: up, side or none) where Bedrock works them out itself, and a structure tool such as Litematica
 * places the stored state as it is. VERIFY-IN-GAME: the rules below are the game's wire shape logic as understood;
 * deploy/test-world-java/ingame-check.mjs builds every pattern and compares each wire with the shape the game gives
 * it after an update.
 * - A side is `up` when nothing conductive is above the wire, the neighbour can hold dust on top (or is a trapdoor)
 *   and dust lies on it; it is `side` when the neighbour connects (dust, a signal source, a repeater along its axis,
 *   an observer's output) or dust lies one below a non-conductive neighbour; otherwise `none`.
 * - A wire with no connection is a cross (all four `side`); with connections on one axis only, the line runs through
 *   (a single connection also lights the opposite side).
 */
export function dustShape(at: (p: readonly number[]) => Block | undefined, pos: readonly number[]) {
  const isDust = (p: readonly number[]) => at(p)?.type === "dust";
  const conductsAt = (p: readonly number[]) => conducts(at(p), "java");
  const connectsTo = (b: Block | undefined, dir: Horizontal) => {
    if (!b) return false;
    const e = registryEntry(b.type);
    if (b.type === "dust") return true;
    if (b.type === "repeater") return b.states.facing === dir || b.states.facing === OPPOSITE[dir];
    // An observer's output is its back: dust behind it connects (the observer lies `facing` from the dust).
    if (b.type === "observer") return b.states.facing === dir;
    return (e !== undefined && SOURCE_CLASSES.has(e.sim.class)) || b.type === "target";
  };
  const nonConductorAbove = !conductsAt(add(pos, [0, 1, 0]));
  const side = (dir: Horizontal): "up" | "side" | "none" => {
    const np = add(pos, HORIZONTAL[dir]);
    const nb = at(np);
    if (nonConductorAbove && nb && (nb.type === "trapdoor" || holdsOnFace(nb, "top", "java", "dust"))) {
      if (isDust(add(np, [0, 1, 0]))) return holdsOnFace(nb, "side", "java") ? "up" : "side";
    }
    if (connectsTo(nb, dir)) return "side";
    if (!conductsAt(np) && isDust(add(np, [0, -1, 0]))) return "side";
    return "none";
  };
  const s = { north: side("north"), south: side("south"), east: side("east"), west: side("west") };
  const n = s.north !== "none";
  const so = s.south !== "none";
  const e = s.east !== "none";
  const w = s.west !== "none";
  const noNS = !n && !so;
  const noEW = !e && !w;
  if (!w && noNS) s.west = "side";
  if (!e && noNS) s.east = "side";
  if (!n && noEW) s.north = "side";
  if (!so && noEW) s.south = "side";
  return s;
}

/** Every Java block of a design, at absolute cells, with dust connections worked out from the neighbours. */
export function javaCells(model: Model): JavaCell[] {
  const at = (p: readonly number[]) => model.blocks.get(`${p[0]},${p[1]},${p[2]}`);
  const cells: JavaCell[] = [];
  for (const [key, b] of model.blocks) {
    const pos = keyPos(key);
    for (const e of toEditionBlocks(b, "java")) {
      const states = { ...e.states };
      if (b.type === "dust" && e.offset.every((o) => o === 0)) Object.assign(states, dustShape(at, pos));
      cells.push({ pos: add(pos, e.offset), id: e.id, states });
    }
  }
  return cells.sort((a, b) => a.pos[1] - b.pos[1] || a.pos[2] - b.pos[2] || a.pos[0] - b.pos[0]);
}

/** A Java block state string, properties sorted by name: `minecraft:repeater[delay=1,facing=west,...]`. */
export function javaStateString(id: string, states: Readonly<Record<string, StateValue>>): string {
  const keys = Object.keys(states).sort();
  return keys.length ? `${id}[${keys.map((k) => `${k}=${String(states[k])}`).join(",")}]` : id;
}

/** The size the Java exporters write: the model's box, grown by any upper half that sticks out of it. */
function javaSize(model: Model, cells: readonly JavaCell[]): [number, number, number] {
  const size: [number, number, number] = [...model.size];
  for (const c of cells) for (let i = 0; i < 3; i++) size[i] = Math.max(size[i] ?? 0, (c.pos[i] ?? 0) + 1);
  return size;
}

function guard(model: Model): ExportResult | null {
  if (!isValidSlug(model.meta.slug)) {
    return {
      files: [],
      diagnostics: [diag("E012", `Slug "${model.meta.slug}" is not valid`, { path: "/meta/slug" })],
    };
  }
  const [mx, my, mz] = LIMITS.boundingBox;
  const [sx, sy, sz] = model.size;
  if (sx > mx || sy > my || sz > mz) {
    return {
      files: [],
      diagnostics: [
        diag("E007", `Bounding box ${sx} × ${sy} × ${sz} exceeds the limit ${mx} × ${my} × ${mz}`),
      ],
    };
  }
  return null;
}

/** Writes an unsigned LEB128 varint (the Sponge format's block data encoding). */
function varint(out: number[], n: number) {
  let v = n;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

/**
 * Sponge Schematic version 3 (`.schem`): gzipped big-endian NBT, root compound holding `Schematic`, a palette of
 * block state strings and the blocks as varint palette indices in x, then z, then y order. Air fills the gaps.
 * VERIFY-IN-GAME: loaded with WorldEdit in the Java test world and compared block by block.
 */
export async function encodeSchem(model: Model): Promise<Uint8Array> {
  const { Int16, Int32, write } = await import("nbtify");
  const cells = javaCells(model);
  const [w, h, l] = javaSize(model, cells);
  const palette = new Map<string, number>([["minecraft:air", 0]]);
  const index = new Int32Array(w * h * l);
  for (const c of cells) {
    const s = javaStateString(c.id, c.states);
    if (!palette.has(s)) palette.set(s, palette.size);
    index[c.pos[0] + c.pos[2] * w + c.pos[1] * w * l] = palette.get(s) ?? 0;
  }
  const data: number[] = [];
  for (const i of index) varint(data, i);
  const root = {
    Schematic: {
      Version: new Int32(3),
      DataVersion: new Int32(PINS.javaDataVersion),
      Metadata: { Name: model.meta.name, Generator: "dustwright" },
      Width: new Int16(w),
      Height: new Int16(h),
      Length: new Int16(l),
      Offset: new Int32Array([0, 0, 0]),
      Blocks: {
        Palette: Object.fromEntries([...palette].map(([k, v]) => [k, new Int32(v)])),
        Data: new Int8Array(data),
        BlockEntities: [],
      },
    },
  };
  return write(root, { rootName: "", endian: "big", compression: "gzip", bedrockLevel: false });
}

/**
 * Litematica (`.litematic`): gzipped big-endian NBT with one region. Block states are palette indices packed into
 * longs at max(2, bits for the palette) bits each, spanning long boundaries, in x, then z, then y order; palette
 * entry 0 is air. Timestamps are fixed so the file is deterministic. Not loadable by a server (Litematica is a
 * client mod): checked by decoding, VERIFY-IN-GAME in the client.
 */
export async function encodeLitematic(model: Model): Promise<Uint8Array> {
  const { Int32, write } = await import("nbtify");
  const cells = javaCells(model);
  const [w, h, l] = javaSize(model, cells);
  const palette: { Name: string; Properties?: Record<string, string> }[] = [{ Name: "minecraft:air" }];
  const keyOf = new Map<string, number>([["minecraft:air", 0]]);
  const index = new Int32Array(w * h * l);
  for (const c of cells) {
    const s = javaStateString(c.id, c.states);
    if (!keyOf.has(s)) {
      keyOf.set(s, palette.length);
      const props = Object.keys(c.states).sort();
      palette.push(
        props.length
          ? { Name: c.id, Properties: Object.fromEntries(props.map((k) => [k, String(c.states[k])])) }
          : { Name: c.id },
      );
    }
    index[c.pos[0] + c.pos[2] * w + c.pos[1] * w * l] = keyOf.get(s) ?? 0;
  }
  const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
  const longs = new BigInt64Array(Math.ceil((index.length * bits) / 64));
  const mask = (1n << BigInt(bits)) - 1n;
  index.forEach((v, i) => {
    const bit = i * bits;
    const word = Math.floor(bit / 64);
    const offset = BigInt(bit % 64);
    const value = BigInt(v) & mask;
    longs[word] = BigInt.asIntN(64, (longs[word] ?? 0n) | (value << offset));
    if ((bit % 64) + bits > 64) {
      longs[word + 1] = BigInt.asIntN(64, (longs[word + 1] ?? 0n) | (value >> (64n - offset)));
    }
  });
  const vec = (x: number, y: number, z: number) => ({ x: new Int32(x), y: new Int32(y), z: new Int32(z) });
  const root = {
    Version: new Int32(6),
    SubVersion: new Int32(1),
    MinecraftDataVersion: new Int32(PINS.javaDataVersion),
    Metadata: {
      Name: model.meta.name,
      Author: "dustwright",
      Description: model.meta.description ?? "",
      RegionCount: new Int32(1),
      TotalBlocks: new Int32(cells.length),
      TotalVolume: new Int32(w * h * l),
      EnclosingSize: vec(w, h, l),
      TimeCreated: 0n,
      TimeModified: 0n,
    },
    Regions: {
      [model.meta.slug]: {
        Position: vec(0, 0, 0),
        Size: vec(w, h, l),
        BlockStatePalette: palette,
        BlockStates: longs,
        TileEntities: [],
        Entities: [],
        PendingBlockTicks: [],
        PendingFluidTicks: [],
      },
    },
  };
  return write(root, { rootName: "", endian: "big", compression: "gzip", bedrockLevel: false });
}

export const schemExporter = {
  id: "schem" as const,
  target: "java" as const,
  async export(model: Model, _opts: ExportOptions): Promise<ExportResult> {
    const refused = guard(model);
    if (refused) return refused;
    return {
      files: [{ path: `${model.meta.slug}.schem`, bytes: await encodeSchem(model) }],
      diagnostics: [],
    };
  },
} satisfies Exporter;

export const litematicExporter = {
  id: "litematic" as const,
  target: "java" as const,
  async export(model: Model, _opts: ExportOptions): Promise<ExportResult> {
    const refused = guard(model);
    if (refused) return refused;
    return {
      files: [{ path: `${model.meta.slug}.litematic`, bytes: await encodeLitematic(model) }],
      diagnostics: [],
    };
  },
} satisfies Exporter;
