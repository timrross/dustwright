import { diag, LIMITS, parseText } from "@dustwright/core";
import type { Diagnostic } from "@dustwright/core";
import { buildBundleHtml, buildMcpack, renderLayerSheets } from "@dustwright/export";
import { profileFor, validateText } from "@dustwright/validator";
import type { ValidationResult } from "@dustwright/validator";

/**
 * What the tools need from the machine they run on. The CLI provides it (`rsd mcp`), so this package itself never
 * touches the file system and the same tools can be tested in memory.
 */
export interface McpHost {
  /** The authoring guide, AUTHORING.md. */
  authoringGuide(): Promise<string>;
  /** The pattern library: every pattern's slug and design text. */
  patterns(): Promise<{ slug: string; text: string }[]>;
  /** The single-file viewer script `bundle` inlines. */
  viewerBundle(): Promise<string>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  /** Creates a directory (and its parents) and returns the path of `name` inside it. */
  directory(dir: string, name: string): Promise<string>;
  /** The pack writer `rsd export` uses: only functions/rsd and structures/rsd, no symlinks. Returns the paths written. */
  writeIntoPack(packRoot: string, files: readonly { path: string; bytes: Uint8Array }[]): Promise<string[]>;
}

/** A tool's JSON result, and whether it is an error the agent should read as one. */
export interface ToolResult {
  result: unknown;
  isError?: boolean;
}

/** One tool: its name, its description (an agent's only instructions), its input schema, and what it does. */
export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>, host: McpHost): Promise<ToolResult>;
}

const DESIGN = {
  type: "string",
  description: "The whole design as rsd/1 JSON text (the content of a .rsd.json file).",
};

/** Thrown for arguments of the wrong shape; reported to the agent as a tool error. */
export class ArgumentError extends Error {}

const str = (args: Record<string, unknown>, name: string, optional = false): string | undefined => {
  const v = args[name];
  if (v === undefined && optional) return undefined;
  if (typeof v !== "string" || v.length === 0)
    throw new ArgumentError(`"${name}" must be a non-empty string`);
  return v;
};

/** Validates design text with the same guards as the CLI (the 2 MB limit first). */
function check(design: string, strict = false): ValidationResult {
  if (new TextEncoder().encode(design).length > LIMITS.fileBytes) {
    return {
      ok: false,
      diagnostics: [
        diag("E013", `Design is larger than the file size limit of ${LIMITS.fileBytes} bytes (2 MB)`),
      ],
    };
  }
  return validateText(design, { strict });
}

/**
 * An output path the model chose must end in the file type the tool writes, so a design or a confused model cannot
 * point a write at an unrelated file (a script, a config) by name.
 */
const outputPath = (args: Record<string, unknown>, extension: string): string => {
  const path = str(args, "output") as string;
  if (!path.toLowerCase().endsWith(extension)) throw new ArgumentError(`"output" must end in ${extension}`);
  return path;
};

const hasErrors = (ds: readonly Diagnostic[]) => ds.some((d) => d.severity === "error");

export const TOOLS: readonly Tool[] = [
  {
    name: "authoring_guide",
    description:
      "Returns AUTHORING.md, the guide to writing Dustwright redstone designs (format rsd/1): axes, grid rules, block specs and orientation, the block list, Bedrock rules, the authoring loop and two worked examples. Read it before writing a design.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_args, host) {
      return { result: { guide: await host.authoringGuide() } };
    },
  },
  {
    name: "validate",
    description:
      'Checks a design and runs its truth-table tests in the simulator. Returns {"ok": bool, "diagnostics": [...]}, the same as `rsd validate --json`. Each diagnostic has code, severity, pos [x,y,z] (or a JSON Pointer path), message and a hint naming the edit. ok is false on any error (E... codes, T001 failed test, T002 budget); warnings (W...) and info (T003) leave it true unless strict is set. Fix the design and validate again; never change ports or tests to make a failure go away.',
    inputSchema: {
      type: "object",
      properties: {
        design: DESIGN,
        strict: { type: "boolean", description: "Warnings also make ok false." },
      },
      required: ["design"],
      additionalProperties: false,
    },
    async run(args) {
      const { ok, diagnostics } = check(str(args, "design") as string, args.strict === true);
      return { result: { ok, diagnostics } };
    },
  },
  {
    name: "simulate",
    description:
      "Runs every test case of a design in the approximate Bedrock simulator and returns each case: its set, afterTicks and expect, the status (pass, fail, skipped, budget) and the actual output values, plus the T diagnostics. Use it to see what a failing test actually produced. Ticks are redstone ticks (0.1 s).",
    inputSchema: {
      type: "object",
      properties: { design: DESIGN },
      required: ["design"],
      additionalProperties: false,
    },
    async run(args) {
      // One validation run simulates every case once, against the design's single work budget (as `rsd validate`).
      const checked = check(str(args, "design") as string);
      const model = checked.model;
      if (!model || hasErrors(checked.diagnostics.filter((d) => !d.code.startsWith("T")))) {
        return { result: { ok: false, cases: [], diagnostics: checked.diagnostics } };
      }
      const cases = model.tests.map((test, index) => {
        const r = checked.cases?.[index] ?? null;
        return {
          index,
          ...test,
          status: r ? r.status : "budget",
          actual: r ? r.actual : {},
          ...(r?.reason ? { reason: r.reason } : {}),
          ...(r ? {} : { reason: "the design used up the simulation budget in earlier cases" }),
        };
      });
      return {
        result: {
          ok: cases.every((c) => c.status === "pass"),
          cases,
          diagnostics: checked.diagnostics.filter((d) => d.code.startsWith("T")),
        },
      };
    },
  },
  {
    name: "list_patterns",
    description:
      "Lists the pattern library: known-good designs, each built and tested in game (NOT, OR, AND, XOR gates, repeater line, pulse extender and limiter, clocks, T flip-flop, RS latch, piston door, hopper sorter). Returns each pattern's slug, name, description, ports and test count. Start from a pattern when one fits.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async run(_args, host) {
      const patterns = (await host.patterns()).map(({ slug, text }) => {
        const m = parseText(text).model;
        return {
          slug,
          name: m?.meta.name ?? slug,
          description: m?.meta.description ?? "",
          inputs: m?.ports.inputs.map((p) => p.name) ?? [],
          outputs: m?.ports.outputs.map((p) => p.name) ?? [],
          tests: m?.tests.length ?? 0,
        };
      });
      return { result: { patterns } };
    },
  },
  {
    name: "get_pattern",
    description: "Returns one pattern's design JSON text, by its slug from list_patterns.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "The pattern's slug, e.g. and-gate." } },
      required: ["slug"],
      additionalProperties: false,
    },
    async run(args, host) {
      const slug = str(args, "slug") as string;
      const found = (await host.patterns()).find((p) => p.slug === slug);
      return found
        ? { result: { slug, design: found.text } }
        : { result: { error: `no pattern "${slug}"; see list_patterns` }, isError: true };
    },
  },
  {
    name: "bundle",
    description:
      "Writes a single-file HTML viewer of the design (orbit, layers, build steps, power view; no network) to output, like `rsd bundle`. Returns the file written and its size.",
    inputSchema: {
      type: "object",
      properties: {
        design: DESIGN,
        output: { type: "string", description: "Path of the .html file to write (must end in .html)." },
      },
      required: ["design", "output"],
      additionalProperties: false,
    },
    async run(args, host) {
      const design = str(args, "design") as string;
      const output = outputPath(args, ".html");
      const checked = check(design);
      if (!checked.model) return { result: { ok: false, diagnostics: checked.diagnostics } };
      const html = buildBundleHtml(await host.viewerBundle(), design.replace(/^\uFEFF/, ""));
      await host.writeFile(output, html);
      return { result: { ok: true, file: output, bytes: new TextEncoder().encode(html).length } };
    },
  },
  {
    name: "export",
    description:
      'Exports the design into a behavior pack, like `rsd export --json`: to is "mcfunction" (functions/rsd/<slug>.mcfunction, built in game with /function rsd/<slug>) or "mcstructure" (structures/rsd/<slug>.mcstructure, /structure load rsd:<slug>). pack is the pack root directory, which must exist. clear also writes a function that empties the build area. Returns {ok, files, diagnostics}.',
    inputSchema: {
      type: "object",
      properties: {
        design: DESIGN,
        to: { type: "string", enum: ["mcfunction", "mcstructure"] },
        pack: { type: "string", description: "The behavior pack root directory." },
        clear: { type: "boolean" },
        origin: { type: "array", items: { type: "integer" }, minItems: 3, maxItems: 3 },
      },
      required: ["design", "to", "pack"],
      additionalProperties: false,
    },
    async run(args, host) {
      const checked = check(str(args, "design") as string);
      const model = checked.model;
      if (!model || hasErrors(checked.diagnostics))
        return { result: { ok: false, files: [], diagnostics: checked.diagnostics } };
      const to = str(args, "to") as string;
      const exporter = profileFor(model.meta.edition).exporters.find((e) => e.id === to);
      if (!exporter)
        return { result: { error: `no exporter "${to}" for ${model.meta.edition}` }, isError: true };
      const opts: { clear?: boolean; origin?: readonly [number, number, number] } = {};
      if (args.clear === true) opts.clear = true;
      const origin = args.origin;
      if (origin !== undefined) {
        if (
          !Array.isArray(origin) ||
          origin.length !== 3 ||
          !origin.every((n) => Number.isInteger(n) && Math.abs(n) <= 30_000_000)
        ) {
          throw new ArgumentError('"origin" must be three integers');
        }
        opts.origin = origin as [number, number, number];
      }
      const out = await exporter.export(model, opts);
      if (hasErrors(out.diagnostics))
        return { result: { ok: false, files: [], diagnostics: out.diagnostics } };
      const files = await host.writeIntoPack(str(args, "pack") as string, out.files);
      return { result: { ok: true, files, diagnostics: [...checked.diagnostics, ...out.diagnostics] } };
    },
  },
  {
    name: "pack",
    description:
      "Writes a one-design behavior pack (.mcpack: manifest, function and structure) to output, like `rsd pack`. Opening it on any Bedrock device imports it. Returns {ok, file, diagnostics}.",
    inputSchema: {
      type: "object",
      properties: {
        design: DESIGN,
        output: { type: "string", description: "Path of the .mcpack file to write (must end in .mcpack)." },
      },
      required: ["design", "output"],
      additionalProperties: false,
    },
    async run(args, host) {
      const output = outputPath(args, ".mcpack");
      const checked = check(str(args, "design") as string);
      const model = checked.model;
      if (!model || hasErrors(checked.diagnostics))
        return { result: { ok: false, diagnostics: checked.diagnostics } };
      const pack = await buildMcpack(model);
      if (!pack.bytes) return { result: { ok: false, diagnostics: pack.diagnostics } };
      await host.writeFile(output, pack.bytes);
      return { result: { ok: true, file: output, diagnostics: pack.diagnostics } };
    },
  },
  {
    name: "sheets",
    description:
      "Writes printable A4 layer sheets (one SVG per layer, wiki-schematic style) into the directory output, like `rsd sheets`. Returns the files written.",
    inputSchema: {
      type: "object",
      properties: {
        design: DESIGN,
        output: { type: "string", description: "Directory to write the SVGs into." },
      },
      required: ["design", "output"],
      additionalProperties: false,
    },
    async run(args, host) {
      const checked = check(str(args, "design") as string);
      if (!checked.model) return { result: { ok: false, diagnostics: checked.diagnostics } };
      const output = str(args, "output") as string;
      const files: string[] = [];
      for (const sheet of renderLayerSheets(checked.model)) {
        const path = await host.directory(output, sheet.path);
        await host.writeFile(path, sheet.svg);
        files.push(path);
      }
      return { result: { ok: true, files } };
    },
  },
];
