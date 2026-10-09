/**
 * @packageDocumentation
 * Exporters: the single-file viewer bundle (M2), `.mcfunction` (M3), `.mcstructure` (M4), `.mcpack` and layer
 * sheets (M7). Exporters return files; only the CLI (or the site, as a download) writes them.
 */

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/export";

import type { Exporter } from "@dustwright/core";
import { mcfunctionExporter } from "./mcfunction.js";
import { litematicExporter, schemExporter } from "./java.js";
import { mcstructureExporter } from "./mcstructure.js";

export { buildBundleHtml, escapeJsonForScript, UnsafeScriptError } from "./bundle-html.js";
export {
  buildLines,
  clearLines,
  DEFAULT_ORIGIN,
  EXPORTER_ASSUMPTIONS,
  FUNCTION_DIR,
  formatStates,
  isAllowedLine,
  PRODUCIBLE_IDS,
  UnsafeLineError,
  LINE_ALLOWLIST,
  mcfunctionExporter,
  placementGroup,
  placementOrder,
} from "./mcfunction.js";

/** Every exporter, in the order `rsd export --list` shows them. Edition profiles pick theirs from here. */
export const EXPORTERS: readonly Exporter[] = [
  mcfunctionExporter,
  mcstructureExporter,
  schemExporter,
  litematicExporter,
];
export {
  dustShape,
  encodeLitematic,
  encodeSchem,
  javaCells,
  javaStateString,
  litematicExporter,
  schemExporter,
} from "./java.js";
export type { JavaCell } from "./java.js";

export {
  blockVersion,
  cellIndex,
  encodeStructure,
  mcstructureExporter,
  STRUCTURE_DIR,
  structureLayout,
} from "./mcstructure.js";
export type { PaletteEntry, StructureLayout } from "./mcstructure.js";
export {
  buildManifest,
  designManifest,
  PACK_NAMESPACE,
  PACK_VERSION,
  TEST_PACK_MANIFEST,
  uuidV5,
} from "./manifest.js";
export type { ManifestInput } from "./manifest.js";
export { buildMcpack } from "./mcpack.js";
export type { McpackResult } from "./mcpack.js";
export { escapeXml, renderLayerSheets } from "./sheets.js";
export type { LayerSheet } from "./sheets.js";
export { zipDeterministic } from "./zip.js";
