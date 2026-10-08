import { diag, isValidSlug, keyPos, LIMITS, PINS, toEditionBlocks } from "@dustwright/core";
import type { ExportOptions, ExportResult, Exporter, Model, StateValue } from "@dustwright/core";

/** Where structure files go inside the pack; `/structure load rsd:<slug>` finds them there. */
export const STRUCTURE_DIR = "structures/rsd";

/**
 * The block `version` stamped on every palette entry: the pinned block-state version (`PINS.blockStateVersion`,
 * measured from a structure the game saved) packed as `major << 24 | minor << 16 | patch << 8 | revision`.
 */
export function blockVersion(gameVersion: string = PINS.blockStateVersion): number {
  const [major = 0, minor = 0, patch = 0, revision = 0] = gameVersion.split(".").map(Number);
  return ((major << 24) | (minor << 16) | (patch << 8) | revision) >>> 0;
}

/**
 * The flat index of a cell in `block_indices`: z varies fastest, then y, then x. Proven in game (M4): an
 * asymmetric design loads with every block in place, and a structure the game saved matches ours cell for cell.
 */
export function cellIndex(x: number, y: number, z: number, size: readonly [number, number, number]): number {
  return (x * size[1] + y) * size[2] + z;
}

/** One palette entry: a Bedrock block with its states. */
export interface PaletteEntry {
  name: string;
  states: Record<string, StateValue>;
}

/** The structure's content before encoding: size, the palette and one palette index per cell (-1 for air). */
export interface StructureLayout {
  size: readonly [number, number, number];
  palette: PaletteEntry[];
  indices: number[];
}

/**
 * Lays out a model as a structure. Air cells are -1 (structure void), so loading the structure, like running the
 * build function, never removes a block that is already there. The palette is built in position order (x, then y,
 * then z), so equal designs give equal bytes.
 */
export function structureLayout(model: Model): StructureLayout {
  const size = model.size as readonly [number, number, number];
  const indices = new Array<number>(size[0] * size[1] * size[2]).fill(-1);
  const palette: PaletteEntry[] = [];
  const seen = new Map<string, number>();
  const keys = [...model.blocks.keys()].sort((a, b) => {
    const pa = keyPos(a);
    const pb = keyPos(b);
    return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
  });
  for (const key of keys) {
    const pos = keyPos(key);
    const block = model.blocks.get(key);
    if (!block) continue;
    for (const b of toEditionBlocks(block, "bedrock")) {
      const id = `${b.id}${JSON.stringify(b.states)}`;
      let i = seen.get(id);
      if (i === undefined) {
        i = palette.length;
        palette.push({ name: b.id, states: b.states });
        seen.set(id, i);
      }
      indices[cellIndex(pos[0] + b.offset[0], pos[1] + b.offset[1], pos[2] + b.offset[2], size)] = i;
    }
  }
  return { size, palette, indices };
}

/** Encodes a layout as little-endian, uncompressed `.mcstructure` NBT (root name empty). */
export async function encodeStructure(
  layout: StructureLayout,
  version: number = blockVersion(),
): Promise<Uint8Array> {
  // Loaded on first use, so pages that never write a structure (the playground until a download) do not load it.
  const { Int32, Int8, write } = await import("nbtify");
  const stateTag = (v: StateValue) =>
    typeof v === "boolean" ? new Int8(v ? 1 : 0) : typeof v === "number" ? new Int32(v) : v;
  const ints = (xs: readonly number[]) => xs.map((n) => new Int32(n));
  const root = {
    format_version: new Int32(1),
    size: ints(layout.size),
    structure: {
      // Layer 0 holds the blocks; layer 1 (waterlogging) is empty in v1.
      block_indices: [ints(layout.indices), ints(layout.indices.map(() => -1))],
      entities: [],
      palette: {
        default: {
          block_palette: layout.palette.map((p) => ({
            name: p.name,
            states: Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, stateTag(v)])),
            version: new Int32(version),
          })),
          block_position_data: {},
        },
      },
    },
    structure_world_origin: ints([0, 0, 0]),
  };
  return write(root, { rootName: "", endian: "little", compression: null, bedrockLevel: false });
}

/** The `.mcstructure` exporter (M4). Refuses designs over the structure size limit with E007. */
export const mcstructureExporter = {
  id: "mcstructure" as const,
  target: "bedrock" as const,
  async export(model: Model, _opts: ExportOptions): Promise<ExportResult> {
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
          diag(
            "E007",
            `Bounding box ${sx} × ${sy} × ${sz} exceeds the structure limit ${mx} × ${my} × ${mz}`,
            {
              hint: "Make the design smaller; splitting across structures is M10 work.",
            },
          ),
        ],
      };
    }
    const bytes = await encodeStructure(structureLayout(model));
    return { files: [{ path: `${STRUCTURE_DIR}/${model.meta.slug}.mcstructure`, bytes }], diagnostics: [] };
  },
} satisfies Exporter;
