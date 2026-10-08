/**
 * @packageDocumentation
 * Validator: runs the stage 1 to 3 rules of a design's edition profile and returns diagnostics an LLM can act on.
 */

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/validator";

export { validate, validateText } from "./validate.js";
export type { ValidateOptions, ValidationResult } from "./validate.js";
export { BEDROCK_PROFILE, JAVA_PROFILE, PROFILES, profileFor } from "./profiles.js";
export { RULES } from "./rules/index.js";
export { gameVersionMatches } from "./rules/stage1.js";
export { renderDiagnosticsDoc } from "./docs.js";
