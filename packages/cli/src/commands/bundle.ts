import { readFile, writeFile } from "node:fs/promises";
import { buildBundleHtml } from "@dustwright/export";
import { validateText } from "@dustwright/validator";
import { readDesignFile } from "../io.js";
import type { RunIO, RunResult } from "../run.js";
import { formatDiagnostic } from "./validate.js";

/** Where the build puts the viewer bundle (see scripts/copy-viewer.mjs). */
export const VIEWER_ASSET = new URL("../../assets/redstone-viewer.js", import.meta.url);

/** `rsd bundle <file> -o <html>`: writes one self-contained HTML viewer for a design. */
export async function bundleCommand(file: string, out: string | undefined, io: RunIO): Promise<RunResult> {
  if (out === undefined) {
    io.stderr("rsd: bundle needs -o <html>\n");
    return { exitCode: 2 };
  }
  const read = await readDesignFile(file);
  if (!read.ok) {
    io.stderr(`rsd: ${read.message}\n`);
    return { exitCode: read.kind === "io" ? 2 : 1 };
  }
  const result = validateText(read.text);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  // The viewer renders anything stage 1 accepts (a Java design included), so bundle whenever there is a model.
  if (!result.model) {
    for (const d of errors) io.stderr(`${formatDiagnostic(file, d)}\n`);
    return { exitCode: 1 };
  }
  let viewer: string;
  try {
    viewer = await readFile(VIEWER_ASSET, "utf8");
  } catch {
    io.stderr("rsd: the viewer bundle is missing from this install (run pnpm build)\n");
    return { exitCode: 2 };
  }
  const html = buildBundleHtml(viewer, read.text.replace(/^\uFEFF/, ""));
  try {
    await writeFile(out, html);
  } catch (err) {
    io.stderr(`rsd: cannot write ${out}: ${(err as Error).message}\n`);
    return { exitCode: 2 };
  }
  io.stderr(`wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)\n`);
  return { exitCode: 0 };
}
