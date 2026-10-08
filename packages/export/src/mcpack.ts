import { hasErrors } from "@dustwright/core";
import type { Diagnostic, Model } from "@dustwright/core";
import { designManifest } from "./manifest.js";
import { mcfunctionExporter } from "./mcfunction.js";
import { mcstructureExporter } from "./mcstructure.js";
import { zipDeterministic } from "./zip.js";

/** The result of packing one design: the `.mcpack` bytes (absent on errors), its file name, and diagnostics. */
export interface McpackResult {
  fileName: string;
  bytes?: Uint8Array;
  diagnostics: Diagnostic[];
}

/**
 * `rsd pack` and the site's Download pack: a behavior pack holding only this design, zipped as `<slug>.mcpack`:
 * `manifest.json`, `functions/rsd/<slug>.mcfunction` and `structures/rsd/<slug>.mcstructure`. Byte-identical for
 * identical input. Importing it is a double-click on any Bedrock device.
 */
export async function buildMcpack(model: Model): Promise<McpackResult> {
  const slug = model.meta.slug;
  const fileName = `${slug}.mcpack`;
  const fn = await mcfunctionExporter.export(model, {});
  const st = await mcstructureExporter.export(model, {});
  const diagnostics = [...fn.diagnostics, ...st.diagnostics];
  if (hasErrors(diagnostics)) return { fileName, diagnostics };
  const files: Record<string, Uint8Array> = {
    "manifest.json": new TextEncoder().encode(await designManifest(slug)),
  };
  for (const f of [...fn.files, ...st.files]) files[f.path] = f.bytes;
  const bytes = zipDeterministic(files);
  return { fileName, bytes, diagnostics };
}
