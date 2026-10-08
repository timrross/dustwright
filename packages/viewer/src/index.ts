/**
 * @packageDocumentation
 * Read-only Three.js viewer for Dustwright designs, shipped as the `<redstone-viewer>` web component, a single-file
 * bundle and the site's /view page. It renders the normalised model from `@dustwright/core`, never the raw JSON.
 */

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/viewer";

export { BUILDERS, buildBlock, colorFor } from "./geometry.js";
export type { Box, NeighbourLookup, Part, PartRole } from "./geometry.js";
export { hasColor, sceneColor, THEMES } from "./palette.js";
export type { ThemeName } from "./palette.js";
export { blockInfo } from "./scene.js";
export { parseAllowedOrigins, parseCommand } from "./messages.js";
export type { ViewerCommand } from "./messages.js";
export type { BlockInfo, SnapView, ViewerMode } from "./scene.js";

/**
 * The procedural geometry builders, one per registry `geometry.builder`. The registry test asserts every block
 * names one of these.
 */
export const GEOMETRY_BUILDERS: readonly string[] = [
  "cube",
  "cube_faced",
  "slab",
  "stairs",
  "dust",
  "repeater",
  "comparator",
  "torch",
  "lever",
  "button",
  "plate",
  "daylight_sensor",
  "piston",
  "door",
  "trapdoor",
  "observer",
  "hopper",
];
