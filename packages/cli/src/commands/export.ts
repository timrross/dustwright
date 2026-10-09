import { diag } from "@dustwright/core";
import { BEDROCK_PROFILE, JAVA_PROFILE, profileFor, validateText } from "@dustwright/validator";
import { readDesignFile } from "../io.js";
import { JAVA_PATH, PackWriteError, writeIntoPack } from "../pack-write.js";
import type { RunIO, RunResult } from "../run.js";
import { formatDiagnostic } from "./validate.js";

/** Options for `rsd export`. */
export interface ExportCommandOptions {
  to: string | undefined;
  pack: string | undefined;
  /** The output directory for Java exporters (`-o`). */
  out?: string | undefined;
  clear: boolean;
  origin: readonly [number, number, number] | undefined;
  commandLimit: number | undefined;
  json: boolean;
}

/** `rsd export --list`: every exporter, with the edition it targets. */
export function exportListCommand(io: RunIO): RunResult {
  for (const profile of [BEDROCK_PROFILE, JAVA_PROFILE]) {
    for (const e of profile.exporters) io.stdout(`${e.id}\t${e.target}\n`);
  }
  return { exitCode: 0 };
}

/**
 * `rsd export <file> --to <id> --pack <dir> [--clear] [--origin x y z] [--command-limit n]`. Validates the design,
 * runs the exporter from the design's edition profile, and writes only under `<pack>/functions/rsd/` or
 * `<pack>/structures/rsd/`. The pack root has no default: `--pack` or `RSD_PACK_DIR`. Java designs export with
 * `--to schem|litematic -o <dir>`: one `<slug>.schem` or `<slug>.litematic` in that directory.
 */
export async function exportCommand(file: string, opts: ExportCommandOptions, io: RunIO): Promise<RunResult> {
  const fail = (message: string): RunResult => {
    io.stderr(`rsd: ${message}\n`);
    if (opts.json)
      io.stdout(`${JSON.stringify({ ok: false, files: [], diagnostics: [], error: message })}\n`);
    return { exitCode: 2 };
  };
  if (!opts.to) return fail("export needs --to <exporter> (see rsd export --list)");
  const javaTarget = opts.to === "schem" || opts.to === "litematic";
  const packRoot = javaTarget ? opts.out : (opts.pack ?? io.env?.RSD_PACK_DIR);
  if (!packRoot) {
    return fail(
      javaTarget
        ? `export --to ${opts.to} needs -o <dir>, the directory to write into`
        : "export needs --pack <dir> or RSD_PACK_DIR; there is no default pack location",
    );
  }
  const read = await readDesignFile(file);
  if (!read.ok && read.kind === "io") return fail(read.message);
  const result = read.ok
    ? validateText(read.text)
    : { ok: false, diagnostics: [diag("E013", read.message, { hint: "Split or simplify the design." })] };
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (!("model" in result) || !result.model || errors.length > 0) {
    if (opts.json)
      io.stdout(`${JSON.stringify({ ok: false, files: [], diagnostics: result.diagnostics })}\n`);
    else for (const d of errors) io.stderr(`${formatDiagnostic(file, d)}\n`);
    return { exitCode: 1 };
  }
  // Warnings from validation (W108 for blocks not yet proven in game, W107, ...) travel with the export.
  const warnings = result.diagnostics;
  const model = result.model;
  const exporter = profileFor(model.meta.edition).exporters.find((e) => e.id === opts.to);
  if (!exporter) return fail(`no exporter "${opts.to}" for ${model.meta.edition}; see rsd export --list`);
  const exportOpts: { clear?: boolean; origin?: readonly [number, number, number]; commandLimit?: number } =
    {};
  if (opts.clear) exportOpts.clear = true;
  if (opts.origin) exportOpts.origin = opts.origin;
  if (opts.commandLimit !== undefined) exportOpts.commandLimit = opts.commandLimit;
  // --clear, --origin and --command-limit belong to the function exporter; say so rather than drop them silently.
  if (exporter.id !== "mcfunction" && (opts.clear || opts.origin || opts.commandLimit !== undefined)) {
    io.stderr(
      `rsd: --clear, --origin and --command-limit apply to --to mcfunction only; ignored for ${exporter.id}\n`,
    );
  }
  const out = await exporter.export(model, exportOpts);
  if (out.diagnostics.some((d) => d.severity === "error")) {
    if (opts.json) io.stdout(`${JSON.stringify({ ok: false, files: [], diagnostics: out.diagnostics })}\n`);
    else for (const d of out.diagnostics) io.stderr(`${formatDiagnostic(file, d)}\n`);
    return { exitCode: 1 };
  }
  let written: string[];
  try {
    written = await writeIntoPack(packRoot, out.files, exporter.target === "java" ? JAVA_PATH : undefined);
  } catch (err) {
    if (err instanceof PackWriteError) return fail(err.message);
    return fail(`cannot write into ${packRoot}: ${(err as Error).message}`);
  }
  const diagnostics = [...warnings, ...out.diagnostics];
  if (opts.json) io.stdout(`${JSON.stringify({ ok: true, files: written, diagnostics })}\n`);
  else {
    for (const d of diagnostics) io.stderr(`${formatDiagnostic(file, d)}\n`);
    for (const path of written) io.stdout(`${path}\n`);
  }
  return { exitCode: 0 };
}
