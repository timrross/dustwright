/**
 * @packageDocumentation
 * Read-only Three.js viewer, shipped as a web component. M1 provides the list of geometry builders the registry
 * may name; the builders themselves arrive in M2.
 */

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/viewer";

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
