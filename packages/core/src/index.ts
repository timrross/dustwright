/**
 * @packageDocumentation
 * Design format: schema, parser, normaliser, block registry and edition profile interfaces. Everything downstream
 * (validator, simulator, viewer, exporters) consumes the one {@link Model} that {@link parse} produces.
 */

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/core";

export type {
  Annotation,
  Block,
  Diagnostic,
  Edition,
  Meta,
  Model,
  ParseResult,
  Port,
  Pos,
  Severity,
  StateValue,
  Step,
  TestCase,
} from "./types.js";
export type {
  Category,
  EditionMapping,
  Face,
  RegistryEntry,
  SimClass,
  StateDef,
  StateMapping,
  SturdyFaces,
  SupportRule,
  Verification,
} from "./registry-types.js";
export type {
  EditionProfile,
  ExportOptions,
  ExportResult,
  Exporter,
  Rule,
  RuleContext,
  SimMechanics,
} from "./extension.js";
export { DIAGNOSTIC_CODES, diag, diagnosticInfo, hasErrors, RETIRED_CODES } from "./diagnostics.js";
export type { DiagnosticExtras, DiagnosticInfo, DiagnosticStage } from "./diagnostics.js";
export { LIMITS } from "./limits.js";
export { PINS } from "./pins.js";
export { parse, parseText, SUPPORTED_FORMATS } from "./parse.js";
export { inBounds, keyPos, offsetPos, posKey } from "./pos.js";
export {
  closestTypes,
  editionMapping,
  holdsOnFace,
  REGISTRY,
  registryEntry,
  toEditionBlocks,
  valueText,
} from "./registry.js";
export type { FaceKind } from "./registry.js";
export {
  ALL_FACES,
  attachedFace,
  conducts,
  DIRS,
  dustConnections,
  dustNeighbours,
  dustPointsInto,
  faceKind,
  HORIZONTAL,
  isPowerSource,
  isSupported,
  OPPOSITE,
  outputFace,
  simClass,
  stepPos,
} from "./topology.js";
export type { BlockLookup } from "./topology.js";
export type { EditionBlock } from "./registry.js";
export { deriveSlug, isValidSlug, SLUG_MAX, SLUG_PATTERN } from "./slug.js";
export { formatSpec, parseSpec, printable, splitSpec, typedValue } from "./spec.js";
export type { RawSpec } from "./spec.js";
export { RSD_1_SCHEMA } from "./generated/schema.js";
export { renderMappingDoc, renderVerifyLog } from "./mapping-doc.js";
