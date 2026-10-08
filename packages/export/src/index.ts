/**
 * @packageDocumentation
 * Exporters: the single-file viewer bundle (M2), `.mcfunction` (M3), `.mcstructure` (M4), `.mcpack` and layer
 * sheets (M7). Exporters return files; only the CLI writes them to disk.
 */

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/export";

export { buildBundleHtml, escapeJsonForScript, UnsafeScriptError } from "./bundle-html.js";
