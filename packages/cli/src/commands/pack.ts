import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildMcpack, renderLayerSheets } from "@dustwright/export";
import { validateText } from "@dustwright/validator";
import type { Model } from "@dustwright/core";
import { readDesignFile } from "../io.js";
import type { RunIO, RunResult } from "../run.js";
import { formatDiagnostic } from "./validate.js";

/** Reads and validates a design; prints its errors and returns null when it has any. */
async function loadValid(file: string, io: RunIO): Promise<{ model: Model } | RunResult> {
  const read = await readDesignFile(file);
  if (!read.ok) {
    io.stderr(`rsd: ${read.message}\n`);
    return { exitCode: read.kind === "io" ? 2 : 1 };
  }
  const result = validateText(read.text);
  for (const d of result.diagnostics) {
    if (d.severity === "error" || d.code === "W108") io.stderr(`${formatDiagnostic(file, d)}\n`);
  }
  if (!result.model || result.diagnostics.some((d) => d.severity === "error")) return { exitCode: 1 };
  return { model: result.model };
}

/** `rsd pack <file> -o <mcpack>`: zips a behavior pack holding only this design. */
export async function packCommand(file: string, out: string | undefined, io: RunIO): Promise<RunResult> {
  if (out === undefined) {
    io.stderr("rsd: pack needs -o <file.mcpack>\n");
    return { exitCode: 2 };
  }
  const loaded = await loadValid(file, io);
  if ("exitCode" in loaded) return loaded;
  const result = await buildMcpack(loaded.model);
  for (const d of result.diagnostics) io.stderr(`${formatDiagnostic(file, d)}\n`);
  if (!result.bytes) return { exitCode: 1 };
  try {
    await writeFile(out, result.bytes);
  } catch (err) {
    io.stderr(`rsd: cannot write ${out}: ${(err as Error).message}\n`);
    return { exitCode: 2 };
  }
  io.stdout(`${out}\n`);
  return { exitCode: 0 };
}

/** `rsd sheets <file> -o <dir>`: writes one A4 SVG layer sheet per layer, named from the slug. */
export async function sheetsCommand(file: string, out: string | undefined, io: RunIO): Promise<RunResult> {
  if (out === undefined) {
    io.stderr("rsd: sheets needs -o <dir>\n");
    return { exitCode: 2 };
  }
  const read = await readDesignFile(file);
  if (!read.ok) {
    io.stderr(`rsd: ${read.message}\n`);
    return { exitCode: read.kind === "io" ? 2 : 1 };
  }
  // Like the viewer, sheets draw anything stage 1 accepts: they are for looking at a design, not building it.
  const result = validateText(read.text);
  if (!result.model) {
    for (const d of result.diagnostics.filter((x) => x.severity === "error"))
      io.stderr(`${formatDiagnostic(file, d)}\n`);
    return { exitCode: 1 };
  }
  try {
    await mkdir(out, { recursive: true });
    for (const sheet of renderLayerSheets(result.model)) {
      const path = join(out, sheet.path);
      await writeFile(path, sheet.svg);
      io.stdout(`${path}\n`);
    }
  } catch (err) {
    io.stderr(`rsd: cannot write into ${out}: ${(err as Error).message}\n`);
    return { exitCode: 2 };
  }
  return { exitCode: 0 };
}
