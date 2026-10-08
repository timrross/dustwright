/**
 * @packageDocumentation
 * Approximate tick-based Bedrock redstone simulator. The behaviour classes arrive in M6; M1 provides the edition
 * mechanics objects and the list of behaviour classes the registry may name.
 */

import type { SimClass } from "@dustwright/core";

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/sim";

export { BEDROCK_MECHANICS, JAVA_MECHANICS_STUB } from "./mechanics.js";

/**
 * The behaviour classes the simulator implements, one per registry `sim.class`. The registry test asserts every
 * block names one of these.
 */
export const SIM_CLASSES: readonly SimClass[] = [
  "solid",
  "dust",
  "repeater",
  "comparator",
  "torch",
  "source",
  "consumer",
  "piston",
  "observer",
];
