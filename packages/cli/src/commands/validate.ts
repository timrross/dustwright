import { diag } from "@dustwright/core";
import type { Diagnostic } from "@dustwright/core";
import { validateText } from "@dustwright/validator";
import { readDesignFile } from "../io.js";
import type { RunIO, RunResult } from "../run.js";

/** Formats one diagnostic as a human-readable line. */
export function formatDiagnostic(file: string, d: Diagnostic): string {
  const where = d.pos ? `[${d.pos.join(",")}]` : d.path !== undefined ? d.path || "/" : "";
  const hint = d.hint ? `\n    hint: ${d.hint}` : "";
  return `${file}${where ? ` ${where}` : ""}: ${d.code} ${d.severity}: ${d.message}${hint}`;
}

/** `rsd validate <file> [--json] [--strict]` */
export async function validateCommand(
  file: string,
  opts: { json: boolean; strict: boolean },
  io: RunIO,
): Promise<RunResult> {
  const read = await readDesignFile(file);
  if (!read.ok && read.kind === "io") {
    io.stderr(`rsd: ${read.message}\n`);
    // With --json, stdout always carries exactly one JSON document, even when the file cannot be read.
    if (opts.json) io.stdout(`${JSON.stringify({ ok: false, diagnostics: [], error: read.message })}\n`);
    return { exitCode: 2 };
  }
  const result = read.ok
    ? validateText(read.text, { strict: opts.strict })
    : { ok: false, diagnostics: [diag("E013", read.message, { hint: "Split or simplify the design." })] };
  if (opts.json) {
    io.stdout(`${JSON.stringify({ ok: result.ok, diagnostics: result.diagnostics })}\n`);
  } else {
    for (const d of result.diagnostics) io.stdout(`${formatDiagnostic(file, d)}\n`);
    const errors = result.diagnostics.filter((d) => d.severity === "error").length;
    const warnings = result.diagnostics.filter((d) => d.severity === "warning").length;
    io.stderr(`${result.ok ? "ok" : "failed"}: ${errors} error(s), ${warnings} warning(s)\n`);
  }
  return { exitCode: result.ok ? 0 : 1 };
}
