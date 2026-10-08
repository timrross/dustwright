import {
  diag,
  isValidSlug,
  keyPos,
  LIMITS,
  REGISTRY,
  registryEntry,
  toEditionBlocks,
} from "@dustwright/core";
import type {
  Diagnostic,
  ExportOptions,
  ExportResult,
  Exporter,
  Model,
  Pos,
  StateValue,
} from "@dustwright/core";

/** Where function files go inside the pack. */
export const FUNCTION_DIR = "functions/rsd";

/** The default offset of the build from the executor: one block east, so it never lands on the player. */
export const DEFAULT_ORIGIN: readonly [number, number, number] = [1, 0, 0];

/** Placement groups, in order: building blocks, then components bottom to top, then power sources. */
export function placementGroup(type: string): 0 | 1 | 2 {
  const category = registryEntry(type)?.category;
  if (category === "power_source") return 2;
  if (category === "solid" || category === "transparent") return 0;
  return 1;
}

/**
 * The fixed placement order: solids and building blocks first, then supported components bottom to top, then power
 * sources last. Within a group: y, then z, then x. This stops torches and dust popping off and circuits firing
 * half-built (ADR 0006).
 */
export function placementOrder(model: Model): { key: string; pos: Pos }[] {
  return [...model.blocks.keys()]
    .map((key) => ({ key, pos: keyPos(key), group: placementGroup(model.blocks.get(key)?.type ?? "") }))
    .sort((a, b) => a.group - b.group || a.pos[1] - b.pos[1] || a.pos[2] - b.pos[2] || a.pos[0] - b.pos[0])
    .map(({ key, pos }) => ({ key, pos }));
}

/** A relative coordinate: `~` for zero, `~n` otherwise. */
const rel = (n: number) => (n === 0 ? "~" : `~${n}`);

/** Formats one state value for a command: strings quoted, numbers and booleans bare. Values come from the registry. */
function stateValue(v: StateValue): string {
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

/**
 * Bedrock block-state syntax for commands: `["name"=value,...]`, or nothing when the block has no states.
 * VERIFY-IN-GAME: the `=` separator and quoted names (Bedrock 1.19.70 and later); proven by the M3 build.
 */
export function formatStates(states: Readonly<Record<string, StateValue>>): string {
  const entries = Object.entries(states);
  if (entries.length === 0) return "";
  return ` [${entries.map(([k, v]) => `${JSON.stringify(k)}=${stateValue(v)}`).join(",")}]`;
}

/**
 * What the exporters assume about Bedrock commands and packs that no pinned data can prove. Listed in
 * `docs/verify-in-game.md` beside the mapping assumptions; the M3 build in the test world proves them.
 */
/** The in-game run that proved the exporter assumptions marked below. */
const M3_RUN = {
  gameVersion: "1.26.52",
  date: "2026-10-08",
  by: "automated in-game check (deploy/test-world/ingame-check.mjs, docs/ingame/2026-10-08-m3.json)",
};

export const EXPORTER_ASSUMPTIONS: readonly {
  area: string;
  item: string;
  assumption: string;
  proven?: { gameVersion: string; date: string; by: string };
}[] = [
  {
    area: "mcfunction",
    item: "`setblock` states",
    assumption:
      'Block states are written `["name"=value,...]`: names quoted, strings quoted, numbers and booleans bare (Bedrock 1.19.70 and later)',
    proven: M3_RUN,
  },
  {
    area: "mcfunction",
    item: "`fill ... minecraft:air`",
    assumption: "`fill` with air clears at most 32,768 blocks per command",
  },
  {
    area: "mcfunction",
    item: "`/function rsd/<slug>`",
    assumption:
      "A file at `functions/rsd/<slug>.mcfunction` in a behavior pack runs as `/function rsd/<slug>`; `#` lines are comments",
    proven: M3_RUN,
  },
  {
    area: "mcfunction",
    item: "door halves",
    assumption:
      "Setting the lower half and then the upper half (upper_block_bit true) with two setblocks gives a working door",
  },
  {
    area: "pack",
    item: "`manifest.json`",
    assumption:
      "A data-only pack (format_version 2, one data module, min_engine_version 1.26.50) loads without content-log errors",
    proven: M3_RUN,
  },
];

/** Only these shapes may appear in a function file; a golden test checks every line of every example. */
export const LINE_ALLOWLIST = [
  /^setblock ~(-?\d+)? ~(-?\d+)? ~(-?\d+)? minecraft:[a-z0-9_]+( \[("[a-z0-9_:]+"=("[a-z0-9_]+"|-?\d+|true|false))(,"[a-z0-9_:]+"=("[a-z0-9_]+"|-?\d+|true|false))*\])?$/,
  /^fill ~(-?\d+)? ~(-?\d+)? ~(-?\d+)? ~(-?\d+)? ~(-?\d+)? ~(-?\d+)? minecraft:air$/,
  /^# dustwright [a-z0-9]+(-[a-z0-9]+)* registry \d+\.\d+\.\d+$/,
];

/**
 * Every Bedrock block ID the registry can produce (all mappings, every state combination). A function file may name
 * only these, so nothing like a command block can ever appear, whatever a design says.
 */
export const PRODUCIBLE_IDS: ReadonlySet<string> = new Set(
  REGISTRY.flatMap((entry) => {
    const m = entry.bedrock;
    return typeof m.id === "string" ? [m.id] : Object.values(m.id.map);
  }),
);

/** True when a line is on the allowlist and every block it names is one the registry produces. */
export function isAllowedLine(line: string): boolean {
  if (!LINE_ALLOWLIST.some((re) => re.test(line))) return false;
  const id = /^setblock \S+ \S+ \S+ (minecraft:[a-z0-9_]+)/.exec(line)?.[1];
  return id === undefined || PRODUCIBLE_IDS.has(id);
}

/** Thrown if a generated line ever falls outside the allowlist (a bug, never a design problem). */
export class UnsafeLineError extends Error {}

function checked(lines: string[]): string[] {
  for (const line of lines)
    if (!isAllowedLine(line)) throw new UnsafeLineError(`refusing to emit ${JSON.stringify(line)}`);
  return lines;
}

function header(model: Model): string {
  return `# dustwright ${model.meta.slug} registry ${model.registryVersion}`;
}

/** The build function's lines. Every non-comment line is a setblock built from registry data and integers. */
export function buildLines(
  model: Model,
  origin: readonly [number, number, number] = DEFAULT_ORIGIN,
): string[] {
  const lines = [header(model)];
  for (const { key, pos } of placementOrder(model)) {
    const block = model.blocks.get(key);
    if (!block) continue;
    for (const b of toEditionBlocks(block, "bedrock")) {
      const x = origin[0] + pos[0] + b.offset[0];
      const y = origin[1] + pos[1] + b.offset[1];
      const z = origin[2] + pos[2] + b.offset[2];
      lines.push(`setblock ${rel(x)} ${rel(y)} ${rel(z)} ${b.id}${formatStates(b.states)}`);
    }
  }
  return lines;
}

/**
 * The clear function: fills the bounding box with air, top layers first, in slabs of at most 32,768 blocks (the
 * `fill` limit). It is a separate function, so running the build can never delete anything.
 */
export function clearLines(
  model: Model,
  origin: readonly [number, number, number] = DEFAULT_ORIGIN,
): string[] {
  const [sx, sy, sz] = model.size;
  // A door's upper half can stand one above the grid's top only if the grid allowed it; the parser keeps it inside.
  const perLayer = sx * sz;
  const slab = Math.max(1, Math.floor(LIMITS.fillBlocks / perLayer));
  const lines = [header(model)];
  for (let top = sy - 1; top >= 0; top -= slab) {
    const bottom = Math.max(0, top - slab + 1);
    const a = [origin[0], origin[1] + bottom, origin[2]];
    const b = [origin[0] + sx - 1, origin[1] + top, origin[2] + sz - 1];
    lines.push(`fill ${a.map(rel).join(" ")} ${b.map(rel).join(" ")} minecraft:air`);
  }
  return lines;
}

const encoder = new TextEncoder();

/** The `.mcfunction` exporter (M3). */
export const mcfunctionExporter: Exporter = {
  id: "mcfunction",
  target: "bedrock",
  export(model: Model, opts: ExportOptions): ExportResult {
    const diagnostics: Diagnostic[] = [];
    if (!isValidSlug(model.meta.slug)) {
      return {
        files: [],
        diagnostics: [diag("E012", `Slug "${model.meta.slug}" is not valid`, { path: "/meta/slug" })],
      };
    }
    const origin = opts.origin ?? DEFAULT_ORIGIN;
    const limit = opts.commandLimit ?? LIMITS.functionCommands;
    const lines = checked(buildLines(model, origin));
    const commands = lines.length - 1;
    if (commands > limit) {
      return {
        files: [],
        diagnostics: [
          diag("E014", `The build needs ${commands} commands, more than the function limit of ${limit}`, {
            hint: "Export with --to mcstructure, or pass --command-limit if the server raised functioncommandlimit.",
          }),
        ],
      };
    }
    const files = [
      {
        path: `${FUNCTION_DIR}/${model.meta.slug}.mcfunction`,
        bytes: encoder.encode(`${lines.join("\n")}\n`),
      },
    ];
    if (opts.clear) {
      files.push({
        path: `${FUNCTION_DIR}/${model.meta.slug}_clear.mcfunction`,
        bytes: encoder.encode(`${checked(clearLines(model, origin)).join("\n")}\n`),
      });
    }
    return { files, diagnostics };
  },
};
