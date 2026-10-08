/**
 * @packageDocumentation
 * Exporters: the single-file viewer bundle (M2), `.mcfunction` (M3), `.mcstructure` (M4), `.mcpack` and layer
 * sheets (M7). Exporters return files; only the CLI writes them to disk.
 */

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/export";

import type { Exporter } from "@dustwright/core";
import { mcfunctionExporter } from "./mcfunction.js";
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
export const EXPORTERS: readonly Exporter[] = [mcfunctionExporter, mcstructureExporter];

export {
  blockVersion,
  cellIndex,
  encodeStructure,
  mcstructureExporter,
  STRUCTURE_DIR,
  structureLayout,
} from "./mcstructure.js";
export type { PaletteEntry, StructureLayout } from "./mcstructure.js";
