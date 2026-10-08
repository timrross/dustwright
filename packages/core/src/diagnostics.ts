import type { Diagnostic, Pos, Severity } from "./types.js";

/** Where a code is produced: a validator stage, or an exporter. */
export type DiagnosticStage = 1 | 2 | 3 | "export";

/** The documented meaning of a diagnostic code. `docs/diagnostics.md` is generated from this catalogue. */
export interface DiagnosticInfo {
  code: string;
  severity: Severity;
  stage: DiagnosticStage;
  /** What the code means. */
  summary: string;
  /** The general fix; each diagnostic carries a specific hint. */
  hint: string;
}

const info = (
  code: string,
  severity: Severity,
  stage: DiagnosticStage,
  summary: string,
  hint: string,
): DiagnosticInfo => ({ code, severity, stage, summary, hint });

/** Every diagnostic code Dustwright can emit, in code order. */
export const DIAGNOSTIC_CODES: readonly DiagnosticInfo[] = [
  info(
    "E001",
    "error",
    1,
    "The design fails the rsd/1 JSON Schema, or is not valid JSON.",
    "Fix the value at `path` to match the schema.",
  ),
  info(
    "E002",
    "error",
    1,
    "Ragged grid: a layer has a different row count, or a row a different length.",
    "Make every row the same length and every layer the same number of rows; pad with `.` for air.",
  ),
  info(
    "E003",
    "error",
    1,
    "A grid character is not in the legend.",
    "Add the character to `legend`, or use `.` for air.",
  ),
  info(
    "E004",
    "error",
    1,
    "Unknown block type, or a type that does not exist in this edition.",
    "Use a type from the registry; the hint lists the closest names.",
  ),
  info(
    "E005",
    "error",
    1,
    "Malformed block spec, unknown state key, or a value outside the key's domain.",
    "Use `<type> key=value ...` with single spaces; the hint lists the allowed keys or values.",
  ),
  info(
    "E006",
    "error",
    2,
    "A component lacks the block it needs for support.",
    "Place a solid block on the named face, or change the mount.",
  ),
  info(
    "E007",
    "error",
    1,
    "The bounding box exceeds 64 × 384 × 64, the Bedrock structure limit.",
    "Make the design smaller.",
  ),
  info(
    "E008",
    "error",
    1,
    "A port, annotation, override, step or extra cell is outside the grid, or a port or annotation sits on air.",
    "Use a position inside the grid that holds a block.",
  ),
  info(
    "E009",
    "error",
    2,
    "Two blocks claim the same cell (repeated `blocks` overrides, or a block's extra cell such as a door's upper half).",
    "Keep one block per cell; leave the cell above a door as air.",
  ),
  info("E010", "error", 1, "Unsupported `format` version.", "Set `format` to `rsd/1`."),
  info(
    "E011",
    "error",
    1,
    "Port or test reference problem: duplicate port name, unknown port in a test, input not on an input block, output not on a readable block, or an expected value the output cannot report.",
    "Fix the port positions or the test so they name existing ports on suitable blocks.",
  ),
  info(
    "E012",
    "error",
    1,
    "`meta.slug` is invalid, or `meta.name` yields no usable slug.",
    "Set `meta.slug` to runs of a-z and 0-9 joined by `-`, at most 48 characters.",
  ),
  info(
    "E013",
    "error",
    1,
    "A hard limit is exceeded; the message names it.",
    "Reduce the item below the limit.",
  ),
  info(
    "E014",
    "error",
    "export",
    "The .mcfunction export would exceed the function command limit.",
    "Export with `--to mcstructure`, or pass `--command-limit` for a server that raised the gamerule.",
  ),
  info(
    "E015",
    "error",
    1,
    "`meta.edition` names an edition whose profile is not implemented yet.",
    "Use `edition: bedrock`; Java support arrives in M9.",
  ),
  info(
    "W101",
    "warning",
    2,
    "A dust run is longer than 15 from its nearest source with no repeater.",
    "Insert a repeater before the signal fades.",
  ),
  info(
    "W102",
    "warning",
    2,
    "A repeater or comparator outputs into air or a non-conducting block with no consumer.",
    "Point it at a consumer, dust or a conducting block.",
  ),
  info(
    "W103",
    "warning",
    2,
    "Isolated dust with no source or consumer in reach.",
    "Connect the dust or remove it.",
  ),
  info(
    "W104",
    "warning",
    2,
    "A torch sits on a block that is powered every tick in a loop (burnout risk).",
    "Break the loop or add delay.",
  ),
  info(
    "W105",
    "warning",
    2,
    "The design relies on a Java-only mechanic, such as quasi-connectivity.",
    "Power the piston directly; Bedrock has no quasi-connectivity.",
  ),
  info("W106", "warning", 1, "A legend key is not used by any layer.", "Remove the key or use it."),
  info(
    "W107",
    "warning",
    1,
    "`meta.gameVersion` differs from the registry's pinned game version.",
    "Re-verify the design in that version, or update `meta.gameVersion`.",
  ),
  info(
    "W108",
    "warning",
    1,
    "A block's mapping has not been proven in game yet (VERIFY-IN-GAME).",
    "Check the block in a test world before relying on its orientation.",
  ),
  info(
    "T001",
    "error",
    3,
    "A test case failed: an output did not match.",
    "Compare expected and actual per output and fix the circuit, not the test.",
  ),
  info(
    "T002",
    "error",
    3,
    "A test case ran out of its tick budget (afterTicks above 1,000).",
    "Lower `afterTicks` to at most 1,000.",
  ),
  info(
    "T003",
    "info",
    3,
    "A test case needs something the simulator does not model and was skipped.",
    "Verify that case in game.",
  ),
];

const BY_CODE = new Map(DIAGNOSTIC_CODES.map((d) => [d.code, d]));

/** Looks up a code's documented meaning. */
export function diagnosticInfo(code: string): DiagnosticInfo | undefined {
  return BY_CODE.get(code);
}

/** Extra fields for a diagnostic. */
export interface DiagnosticExtras {
  pos?: Pos | undefined;
  path?: string | undefined;
  related?: Pos[] | undefined;
  hint?: string | undefined;
}

/** Builds a diagnostic with the catalogue's severity for `code`. */
export function diag(code: string, message: string, extras: DiagnosticExtras = {}): Diagnostic {
  const severity = BY_CODE.get(code)?.severity ?? "error";
  // Key order follows the spec's example: code, severity, pos or path, related, message, hint.
  const d: Diagnostic = { code, severity } as Diagnostic;
  if (extras.pos) d.pos = [extras.pos[0], extras.pos[1], extras.pos[2]];
  if (extras.path !== undefined) d.path = extras.path;
  if (extras.related && extras.related.length > 0) d.related = extras.related.map((p) => [p[0], p[1], p[2]]);
  d.message = message;
  if (extras.hint !== undefined) d.hint = extras.hint;
  return d;
}

/** True when any diagnostic is an error. */
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}
