/**
 * @packageDocumentation
 * Approximate tick-based Bedrock redstone simulator: runs a design's truth-table tests (stage 3) and drives the
 * viewer's power view. The game is the ground truth; where they disagree, the game wins.
 */

import type { SimClass } from "@dustwright/core";

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/sim";

export { BEDROCK_MECHANICS, JAVA_MECHANICS_STUB } from "./mechanics.js";
export { PISTON_HEAD, Simulation } from "./simulation.js";
export type { SimSnapshot } from "./simulation.js";
export {
  applySet,
  GAME_TICKS_PER_REDSTONE_TICK,
  runCase,
  settle,
  SETTLE_TICKS,
  simulateTests,
  WORK_BUDGET,
} from "./run.js";
export type { CaseResult, RunOptions } from "./run.js";

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
