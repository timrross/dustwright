import { diag, hasErrors } from "./diagnostics.js";
import { validate as generatedValidate } from "./generated/validate-rsd.js";
import { scanJsonDepth, utf8Length, walkValue } from "./guard.js";
import { LIMITS } from "./limits.js";
import { PINS } from "./pins.js";
import { inBounds, keyPos, offsetPos, posKey } from "./pos.js";
import { registryEntry } from "./registry.js";
import { deriveSlug, isValidSlug } from "./slug.js";
import { parseSpec, printable } from "./spec.js";
import type {
  Annotation,
  Block,
  Diagnostic,
  Edition,
  Meta,
  Model,
  ParseResult,
  Port,
  Pos,
  Step,
  TestCase,
} from "./types.js";

interface AjvError {
  instancePath: string;
  keyword: string;
  message?: string;
  params: Record<string, unknown>;
  /** Set on errors raised while checking a property name. */
  propertyName?: string;
}

/** The precompiled rsd/1 schema validator (ajv standalone; no eval at runtime). */
const validateSchema = generatedValidate as unknown as {
  (data: unknown): boolean;
  errors?: AjvError[] | null;
};

/** The format versions this parser accepts. */
export const SUPPORTED_FORMATS = ["rsd/1"] as const;

/** The design shape after the schema has passed. */
interface Design {
  format: "rsd/1";
  meta: { name: string; slug?: string; description?: string; edition?: Edition; gameVersion?: string };
  legend: Record<string, string>;
  layers: string[][];
  blocks?: { pos: [number, number, number]; block: string }[];
  ports?: {
    inputs?: { name: string; pos: [number, number, number] }[];
    outputs?: { name: string; pos: [number, number, number] }[];
  };
  tests?: { set: Record<string, number>; afterTicks: number; expect: Record<string, number> }[];
  annotations?: { pos: [number, number, number]; text: string }[];
  steps?: ({ title: string; layers: number[] } | { title: string; positions: [number, number, number][] })[];
  ext?: Record<string, unknown>;
}

/** Escapes one JSON Pointer token. */
function pointerToken(t: string | number): string {
  return String(t).replace(/~/g, "~0").replace(/\//g, "~1");
}

const charCount = (s: string) => [...s].length;

/**
 * Parses JSON text into a model. Rejects oversized and over-deep input before calling JSON.parse, so it stays fast
 * and bounded on hostile files. Never throws.
 */
export function parseText(text: string): ParseResult {
  try {
    if (text.length > LIMITS.fileBytes || utf8Length(text) > LIMITS.fileBytes) {
      return fail(
        diag("E013", `Design is larger than the file size limit of ${LIMITS.fileBytes} bytes (2 MB)`, {
          hint: "Split or simplify the design.",
        }),
      );
    }
    // A UTF-8 byte order mark is not JSON, but editors add it; drop it rather than fail.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const depth = scanJsonDepth(text);
    if (!depth.ok)
      return fail(diag("E013", depth.detail, { hint: "Flatten the JSON; designs never need deep nesting." }));
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      return fail(
        diag("E001", `Not valid JSON: ${printable((err as Error).message, 120)}`, {
          path: "",
          hint: "Fix the JSON syntax.",
        }),
      );
    }
    return parse(json);
  } catch (err) {
    return fail(internalError(err));
  }
}

/**
 * Parses an already-decoded design into the normalised model. Runs every stage 1 structural check (E001 to E013
 * and W106). Never throws and never mutates its argument; returns a model only when there are no errors.
 */
export function parse(json: unknown): ParseResult {
  try {
    return parseUnsafe(json);
  } catch (err) {
    return fail(internalError(err));
  }
}

function fail(...diagnostics: Diagnostic[]): ParseResult {
  return { diagnostics };
}

function internalError(err: unknown): Diagnostic {
  return diag(
    "E001",
    `The design could not be read: ${printable(String((err as Error)?.message ?? err), 120)}`,
    {
      path: "",
      hint: "Pass plain JSON data.",
    },
  );
}

class Collector {
  readonly list: Diagnostic[] = [];
  private omitted = false;
  add(d: Diagnostic): void {
    if (this.list.length < LIMITS.diagnostics - 1) {
      this.list.push(d);
    } else if (!this.omitted) {
      this.omitted = true;
      this.list.push(
        diag("E013", `More than ${LIMITS.diagnostics - 1} diagnostics; the rest are omitted`, {
          hint: "Fix the problems listed and validate again.",
        }),
      );
    }
  }
  get errors(): boolean {
    return hasErrors(this.list);
  }
}

function parseUnsafe(json: unknown): ParseResult {
  const guard = walkValue(json);
  if (!guard.ok) return fail(diag("E013", guard.detail, { hint: "Flatten or shrink the design." }));
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return fail(
      diag("E001", "A design must be a JSON object", {
        path: "",
        hint: 'Start from {"format": "rsd/1", ...}.',
      }),
    );
  }
  const obj = json as Record<string, unknown>;
  if (Object.hasOwn(obj, "format") && obj.format !== "rsd/1") {
    return fail(
      diag("E010", `Unsupported format ${printable(JSON.stringify(obj.format) ?? "", 40)}`, {
        path: "/format",
        hint: `Accepted versions: ${SUPPORTED_FORMATS.join(", ")}.`,
      }),
    );
  }
  const out = new Collector();
  checkLimits(obj, out);
  if (out.errors) return { diagnostics: out.list };
  if (!validateSchema(obj)) {
    // ajv reports a bad property name twice: the specific pattern error (with the name) and a summary
    // "propertyNames" error. Keep the specific one, and drop exact duplicates.
    const seen = new Set<string>();
    for (const e of validateSchema.errors ?? []) {
      if (e.keyword === "propertyNames") continue;
      const d = schemaDiagnostic(e);
      const key = `${d.path}|${d.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.add(d);
    }
    return { diagnostics: out.list };
  }
  return buildModel(obj as unknown as Design, out);
}

function schemaDiagnostic(e: AjvError): Diagnostic {
  const path = e.instancePath;
  const where = path === "" ? "The design" : path;
  if (e.keyword === "additionalProperties") {
    const key = String(e.params.additionalProperty);
    return diag("E001", `${where} has an unknown key "${printable(key, 40)}"`, {
      path: `${path}/${pointerToken(key)}`,
      hint:
        path === ""
          ? 'Remove it; tool-specific data belongs under "ext".'
          : "Remove it; see the schema for allowed keys.",
    });
  }
  if (e.keyword === "required") {
    return diag("E001", `${where} is missing "${String(e.params.missingProperty)}"`, {
      path,
      hint: "Add the required key.",
    });
  }
  if (e.propertyName !== undefined) {
    const name = e.propertyName;
    if (path === "/legend") {
      return diag(
        "E001",
        `Legend key "${printable(name, 10)}" must be one printable ASCII character other than "." and space`,
        {
          path: `/legend/${pointerToken(name)}`,
          hint: "Use letters, digits or symbols such as # - * as keys.",
        },
      );
    }
    return diag("E001", `${where} has an invalid port name "${printable(name, 40)}"`, {
      path: `${path}/${pointerToken(name)}`,
      hint: "Port names are 1 to 32 characters of A-Z, a-z, 0-9, _ and -.",
    });
  }
  if (e.keyword === "enum") {
    const allowed = (e.params.allowedValues as unknown[] | undefined)
      ?.map((v) => JSON.stringify(v))
      .join(", ");
    return diag("E001", `${where} must be one of ${allowed}`, { path, hint: `Use one of ${allowed}.` });
  }
  return diag("E001", `${where} ${e.message ?? "is invalid"}`, {
    path,
    hint: "See the rsd/1 schema for this field.",
  });
}

/** Counts every item with a hard limit, defensively (the schema has not run yet). */
function checkLimits(obj: Record<string, unknown>, out: Collector): void {
  const over = (what: string, limit: number, path: string) =>
    out.add(
      diag("E013", `${what} exceeds the limit of ${limit}`, { path, hint: `Reduce it to at most ${limit}.` }),
    );
  const arr = (v: unknown): unknown[] | undefined => (Array.isArray(v) ? v : undefined);
  const rec = (v: unknown): Record<string, unknown> | undefined =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

  const meta = rec(obj.meta);
  if (typeof meta?.name === "string" && charCount(meta.name) > LIMITS.nameChars)
    over("meta.name length", LIMITS.nameChars, "/meta/name");
  if (typeof meta?.description === "string" && charCount(meta.description) > LIMITS.descriptionChars) {
    over("meta.description length", LIMITS.descriptionChars, "/meta/description");
  }
  const legend = rec(obj.legend);
  if (legend) {
    const keys = Object.keys(legend);
    if (keys.length > LIMITS.legendEntries) over("Legend entries", LIMITS.legendEntries, "/legend");
    for (const k of keys) {
      const v = legend[k];
      if (typeof v === "string" && charCount(v) > LIMITS.specChars)
        over(`Legend spec for "${printable(k, 10)}" length`, LIMITS.specChars, `/legend/${pointerToken(k)}`);
    }
  }
  const blocks = arr(obj.blocks);
  if (blocks && blocks.length > LIMITS.blockOverrides)
    over("blocks overrides", LIMITS.blockOverrides, "/blocks");
  blocks?.slice(0, LIMITS.blockOverrides).forEach((b, i) => {
    const spec = rec(b)?.block;
    if (typeof spec === "string" && charCount(spec) > LIMITS.specChars)
      over(`blocks[${i}] spec length`, LIMITS.specChars, `/blocks/${i}/block`);
  });
  const ports = rec(obj.ports);
  if ((arr(ports?.inputs)?.length ?? 0) > LIMITS.inputPorts)
    over("Input ports", LIMITS.inputPorts, "/ports/inputs");
  if ((arr(ports?.outputs)?.length ?? 0) > LIMITS.outputPorts)
    over("Output ports", LIMITS.outputPorts, "/ports/outputs");
  if ((arr(obj.tests)?.length ?? 0) > LIMITS.tests) over("Test cases", LIMITS.tests, "/tests");
  const annotations = arr(obj.annotations);
  if (annotations && annotations.length > LIMITS.annotations)
    over("Annotations", LIMITS.annotations, "/annotations");
  annotations?.slice(0, LIMITS.annotations).forEach((a, i) => {
    const text = rec(a)?.text;
    if (typeof text === "string" && charCount(text) > LIMITS.annotationChars)
      over(`annotations[${i}] text length`, LIMITS.annotationChars, `/annotations/${i}/text`);
  });
  if ((arr(obj.steps)?.length ?? 0) > LIMITS.steps) over("Steps", LIMITS.steps, "/steps");
}

function buildModel(d: Design, out: Collector): ParseResult {
  const edition: Edition = d.meta.edition ?? "bedrock";
  const meta = buildMeta(d, edition, out);

  // Grid shape: E007 first (cheap, bounds all later work), then E002.
  const sizeY = d.layers.length;
  const sizeZ = d.layers[0]?.length ?? 0;
  const sizeX = charCount(d.layers[0]?.[0] ?? "");
  const [maxX, maxY, maxZ] = LIMITS.boundingBox;
  if (sizeX > maxX || sizeY > maxY || sizeZ > maxZ) {
    out.add(
      diag("E007", `Bounding box ${sizeX} × ${sizeY} × ${sizeZ} exceeds ${maxX} × ${maxY} × ${maxZ}`, {
        path: "/layers",
        hint: "Bedrock structures are at most 64 wide, 384 high and 64 deep; make the design smaller.",
      }),
    );
    return { diagnostics: out.list };
  }
  const rows: string[][][] = [];
  d.layers.forEach((layer, y) => {
    if (layer.length !== sizeZ) {
      out.add(
        diag("E002", `Layer ${y} has ${layer.length} rows; layer 0 has ${sizeZ}`, {
          pos: [0, y, 0],
          path: `/layers/${y}`,
          hint: `Give every layer ${sizeZ} rows.`,
        }),
      );
    }
    rows.push(
      layer.map((row, z) => {
        const chars = [...row];
        if (chars.length !== sizeX) {
          out.add(
            diag("E002", `Row ${z} of layer ${y} is ${chars.length} long; rows are ${sizeX} long`, {
              pos: [0, y, z],
              path: `/layers/${y}/${z}`,
              hint: `Make every row exactly ${sizeX} characters; use "." for air.`,
            }),
          );
        }
        return chars;
      }),
    );
  });
  if (out.errors) return { diagnostics: out.list };
  const size: Pos = [sizeX, sizeY, sizeZ];

  // Legend: parse each spec once.
  const legend = new Map<string, Block | null>();
  const firstUse = new Map<string, Pos>();
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      const row = rows[y]?.[z] ?? [];
      for (let x = 0; x < sizeX; x++) {
        const ch = row[x] ?? ".";
        if (!firstUse.has(ch)) firstUse.set(ch, [x, y, z]);
      }
    }
  }
  for (const [key, spec] of Object.entries(d.legend)) {
    const { block, diagnostics } = parseSpec(spec, edition);
    for (const dg of diagnostics)
      out.add({
        ...dg,
        path: `/legend/${pointerToken(key)}`,
        ...(firstUse.has(key) ? { pos: firstUse.get(key) as Pos } : {}),
      });
    legend.set(key, block ?? null);
    if (!firstUse.has(key)) {
      out.add(
        diag("W106", `Legend key "${printable(key, 10)}" is not used by any layer`, {
          path: `/legend/${pointerToken(key)}`,
          hint: "Remove it or use it.",
        }),
      );
    }
  }

  // Grid cells to blocks.
  const blocks = new Map<string, Block>();
  const reportedMissing = new Set<string>();
  const tooMany = () =>
    diag("E013", `More than ${LIMITS.nonAirBlocks} non-air blocks; the limit is ${LIMITS.nonAirBlocks}`, {
      path: "/layers",
      hint: "Split the design.",
    });
  scan: for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      const row = rows[y]?.[z] ?? [];
      for (let x = 0; x < sizeX; x++) {
        const ch = row[x] ?? ".";
        if (ch === "." || ch === " ") continue;
        const block = legend.get(ch);
        if (block === undefined) {
          if (!reportedMissing.has(ch)) {
            reportedMissing.add(ch);
            out.add(
              diag("E003", `Character "${printable(ch, 4)}" at [${x},${y},${z}] is not in the legend`, {
                pos: [x, y, z],
                path: `/layers/${y}/${z}`,
                hint: `Add "${printable(ch, 4)}" to the legend, or use "." for air.`,
              }),
            );
          }
          continue;
        }
        if (block) {
          blocks.set(posKey([x, y, z]), block);
          if (blocks.size > LIMITS.nonAirBlocks) {
            out.add(tooMany());
            break scan;
          }
        }
      }
    }
  }
  if (blocks.size > LIMITS.nonAirBlocks) return { diagnostics: out.list };

  // Overrides, applied after layers.
  const overridden = new Map<string, number>();
  (d.blocks ?? []).forEach((o, i) => {
    const pos: Pos = [o.pos[0], o.pos[1], o.pos[2]];
    const path = `/blocks/${i}`;
    if (!inBounds(pos, size)) {
      out.add(
        diag("E008", `blocks[${i}] at [${pos.join(",")}] is outside the grid`, {
          pos,
          path: `${path}/pos`,
          hint: outsideHint(size),
        }),
      );
      return;
    }
    const key = posKey(pos);
    const prev = overridden.get(key);
    if (prev !== undefined) {
      out.add(
        diag("E009", `blocks[${i}] and blocks[${prev}] both set [${pos.join(",")}]`, {
          pos,
          path,
          related: [pos],
          hint: "Keep one override per position.",
        }),
      );
      return;
    }
    overridden.set(key, i);
    const { block, diagnostics } = parseSpec(o.block, edition);
    for (const dg of diagnostics) out.add({ ...dg, pos, path: `${path}/block` });
    if (block) blocks.set(key, block);
  });

  // Extra cells (a door's upper half) must be inside the grid and air.
  for (const [key, block] of [...blocks]) {
    const entry = registryEntry(block.type);
    for (const offset of entry?.occupies ?? []) {
      const pos = key.split(",").map(Number) as unknown as Pos;
      const extra = offsetPos(pos, offset);
      if (!inBounds(extra, size)) {
        out.add(
          diag(
            "E008",
            `${block.type} at [${pos.join(",")}] also fills [${extra.join(",")}], which is outside the grid`,
            {
              pos,
              hint: "Add a layer above, with air over the door.",
            },
          ),
        );
      } else if (blocks.has(posKey(extra))) {
        out.add(
          diag(
            "E009",
            `${block.type} at [${pos.join(",")}] also fills [${extra.join(",")}], which holds a block`,
            {
              pos,
              related: [extra],
              hint: `Leave [${extra.join(",")}] as air ("."); the upper half is placed automatically.`,
            },
          ),
        );
      }
    }
  }

  if (blocks.size > LIMITS.nonAirBlocks) {
    out.add(tooMany());
    return { diagnostics: out.list };
  }

  const ports = buildPorts(d, size, blocks, out);
  const tests = buildTests(d, ports, blocks, out);
  const annotations = buildAnnotations(d, size, blocks, out);
  const steps = buildSteps(d, size, blocks, out);

  if (out.errors) return { diagnostics: out.list };
  const model: Model = {
    format: "rsd/1",
    meta,
    size,
    blocks,
    ports,
    tests,
    steps,
    annotations,
    registryVersion: PINS.vanillaData,
  };
  if (d.ext !== undefined) model.ext = structuredClone(d.ext);
  return { model, diagnostics: out.list };
}

function outsideHint(size: Pos): string {
  return `Positions run from [0,0,0] to [${size[0] - 1},${size[1] - 1},${size[2] - 1}].`;
}

function buildMeta(d: Design, edition: Edition, out: Collector): Meta {
  let slug: string;
  if (d.meta.slug !== undefined) {
    slug = d.meta.slug;
    if (!isValidSlug(slug)) {
      out.add(
        diag("E012", `meta.slug "${printable(slug, 60)}" is not a valid slug`, {
          path: "/meta/slug",
          hint: "Use runs of a-z and 0-9 joined by single '-', 1 to 48 characters, e.g. not-gate.",
        }),
      );
    }
  } else {
    slug = deriveSlug(d.meta.name);
    if (!isValidSlug(slug)) {
      out.add(
        diag("E012", `meta.name "${printable(d.meta.name, 60)}" yields no usable slug`, {
          path: "/meta/name",
          hint: 'Add meta.slug, e.g. "slug": "my-circuit".',
        }),
      );
    }
  }
  const meta: Meta = { name: d.meta.name, slug, edition };
  if (d.meta.description !== undefined) meta.description = d.meta.description;
  if (d.meta.gameVersion !== undefined) meta.gameVersion = d.meta.gameVersion;
  return meta;
}

/** How a port's block can be driven or read, from its registry sim params. */
function portRole(block: Block | undefined): { input?: string; output?: string } {
  const params = block ? registryEntry(block.type)?.sim.params : undefined;
  const role: { input?: string; output?: string } = {};
  if (typeof params?.input === "string" && params.input !== "none") role.input = params.input;
  if (typeof params?.output === "string" && params.output !== "none") role.output = params.output;
  return role;
}

function buildPorts(d: Design, size: Pos, blocks: Map<string, Block>, out: Collector): Model["ports"] {
  const seen = new Map<string, string>();
  const build = (
    list: { name: string; pos: [number, number, number] }[] | undefined,
    kind: "inputs" | "outputs",
  ): Port[] =>
    (list ?? []).map((p, i) => {
      const pos: Pos = [p.pos[0], p.pos[1], p.pos[2]];
      const path = `/ports/${kind}/${i}`;
      if (seen.has(p.name)) {
        out.add(
          diag("E011", `Port name "${p.name}" is used twice`, {
            pos,
            path: `${path}/name`,
            hint: "Give every port a unique name.",
          }),
        );
      }
      seen.set(p.name, kind);
      if (!inBounds(pos, size)) {
        out.add(
          diag("E008", `Port "${p.name}" at [${pos.join(",")}] is outside the grid`, {
            pos,
            path: `${path}/pos`,
            hint: outsideHint(size),
          }),
        );
      } else {
        const block = blocks.get(posKey(pos));
        if (!block) {
          out.add(
            diag("E008", `Port "${p.name}" at [${pos.join(",")}] is on air`, {
              pos,
              path: `${path}/pos`,
              hint: "Put the port on its lever, button, plate, lamp or other block.",
            }),
          );
        } else {
          const role = portRole(block);
          if (kind === "inputs" && !role.input) {
            out.add(
              diag("E011", `Input port "${p.name}" is on ${block.type}, which cannot be driven`, {
                pos,
                path: `${path}/pos`,
                hint: "Inputs go on a lever, button or pressure_plate.",
              }),
            );
          }
          if (kind === "outputs" && !role.output) {
            out.add(
              diag("E011", `Output port "${p.name}" is on ${block.type}, which cannot be read`, {
                pos,
                path: `${path}/pos`,
                hint: "Outputs go on a lamp, piston, sticky_piston, door, trapdoor, note_block, dust or comparator.",
              }),
            );
          }
        }
      }
      return { name: p.name, pos };
    });
  return { inputs: build(d.ports?.inputs, "inputs"), outputs: build(d.ports?.outputs, "outputs") };
}

function buildTests(
  d: Design,
  ports: Model["ports"],
  blocks: Map<string, Block>,
  out: Collector,
): TestCase[] {
  const inputs = new Map(ports.inputs.map((p) => [p.name, p]));
  const outputs = new Map(ports.outputs.map((p) => [p.name, p]));
  return (d.tests ?? []).map((t, i) => {
    const path = `/tests/${i}`;
    for (const name of Object.keys(t.set)) {
      if (!inputs.has(name)) {
        out.add(
          diag("E011", `Test ${i} sets "${name}", which is not an input port`, {
            path: `${path}/set/${pointerToken(name)}`,
            hint:
              inputs.size > 0
                ? `Input ports: ${[...inputs.keys()].join(", ")}.`
                : "Declare it under ports.inputs.",
          }),
        );
      }
    }
    for (const [name, value] of Object.entries(t.expect)) {
      const port = outputs.get(name);
      if (!port) {
        out.add(
          diag("E011", `Test ${i} expects "${name}", which is not an output port`, {
            path: `${path}/expect/${pointerToken(name)}`,
            hint:
              outputs.size > 0
                ? `Output ports: ${[...outputs.keys()].join(", ")}.`
                : "Declare it under ports.outputs.",
          }),
        );
        continue;
      }
      const block = blocks.get(posKey(port.pos));
      if (portRole(block).output === "binary" && value > 1) {
        out.add(
          diag("E011", `Test ${i} expects ${name}=${value}, but ${block?.type} reports only 0 or 1`, {
            pos: port.pos,
            path: `${path}/expect/${pointerToken(name)}`,
            hint: "Expect 0 or 1 for lamps, pistons, doors, trapdoors and note blocks.",
          }),
        );
      }
    }
    return {
      set: Object.fromEntries(Object.entries(t.set)),
      afterTicks: t.afterTicks,
      expect: Object.fromEntries(Object.entries(t.expect)),
    };
  });
}

function buildAnnotations(d: Design, size: Pos, blocks: Map<string, Block>, out: Collector): Annotation[] {
  return (d.annotations ?? []).map((a, i) => {
    const pos: Pos = [a.pos[0], a.pos[1], a.pos[2]];
    if (!inBounds(pos, size)) {
      out.add(
        diag("E008", `Annotation ${i} at [${pos.join(",")}] is outside the grid`, {
          pos,
          path: `/annotations/${i}/pos`,
          hint: outsideHint(size),
        }),
      );
    } else if (!blocks.has(posKey(pos))) {
      out.add(
        diag("E008", `Annotation ${i} at [${pos.join(",")}] is on air`, {
          pos,
          path: `/annotations/${i}/pos`,
          hint: "Pin annotations to a block.",
        }),
      );
    }
    return { pos, text: a.text };
  });
}

function buildSteps(d: Design, size: Pos, blocks: Map<string, Block>, out: Collector): Step[] {
  // Positions per layer, computed once; a step naming a layer reuses the list instead of rescanning.
  const byLayer: Pos[][] = Array.from({ length: size[1] }, () => []);
  for (const key of blocks.keys()) {
    const pos = keyPos(key);
    byLayer[pos[1]]?.push(pos);
  }
  for (const list of byLayer) list.sort((a, b) => a[2] - b[2] || a[0] - b[0]);
  if (!d.steps) return byLayer.map((positions, y) => ({ title: `Layer ${y}`, positions }));

  // Budget the expansion before building anything: a short file must not name the same full layers thousands of
  // times. Each block belongs to at most one step, so all steps together hold at most stepPositions positions.
  let total = 0;
  for (const s of d.steps) {
    if ("layers" in s) for (const y of s.layers) total += byLayer[y]?.length ?? 0;
    else total += s.positions.length;
  }
  if (total > LIMITS.stepPositions) {
    out.add(
      diag("E013", `Steps add ${total} positions in total, more than the limit of ${LIMITS.stepPositions}`, {
        path: "/steps",
        hint: "Name each layer or position in at most one step.",
      }),
    );
    return [];
  }
  return d.steps.map((s, i) => {
    if ("layers" in s) {
      const positions: Pos[] = [];
      s.layers.forEach((y, j) => {
        const layer = byLayer[y];
        if (layer === undefined) {
          out.add(
            diag("E008", `Step ${i} names layer ${y}, but the design has ${size[1]} layers`, {
              path: `/steps/${i}/layers/${j}`,
              hint: `Layers run from 0 to ${size[1] - 1}.`,
            }),
          );
        } else positions.push(...layer);
      });
      return { title: s.title, positions };
    }
    const positions: Pos[] = [];
    s.positions.forEach((p, j) => {
      const pos: Pos = [p[0], p[1], p[2]];
      if (!inBounds(pos, size)) {
        out.add(
          diag("E008", `Step ${i} position [${pos.join(",")}] is outside the grid`, {
            pos,
            path: `/steps/${i}/positions/${j}`,
            hint: outsideHint(size),
          }),
        );
      } else positions.push(pos);
    });
    return { title: s.title, positions };
  });
}
