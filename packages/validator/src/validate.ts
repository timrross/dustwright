import { hasErrors, parse, parseText } from "@dustwright/core";
import type { Diagnostic, Model, ParseResult } from "@dustwright/core";
import { runTests } from "@dustwright/sim";
import type { CaseResult } from "@dustwright/sim";
import { profileFor } from "./profiles.js";

/** Options for a validation run. */
export interface ValidateOptions {
  /** Warnings also make `ok` false. */
  strict?: boolean;
}

/** The validator's output: the shape `rsd validate --json` prints, plus the model when parsing succeeded. */
export interface ValidationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  model?: Model;
  /** Each test case's simulated result, when stage 3 ran (null: the design's budget ran out before the case). */
  cases?: (CaseResult | null)[];
}

/** Validates a decoded design. Stages run in order; a stage runs only if earlier ones found no errors. */
export function validate(design: unknown, opts: ValidateOptions = {}): ValidationResult {
  return run(parse(design), opts);
}

/** Validates design JSON text (with the size and depth guards applied before decoding). */
export function validateText(text: string, opts: ValidateOptions = {}): ValidationResult {
  return run(parseText(text), opts);
}

function run(parsed: ParseResult, opts: ValidateOptions): ValidationResult {
  const diagnostics = [...parsed.diagnostics];
  const model = parsed.model;
  let cases: (CaseResult | null)[] | undefined;
  if (model) {
    const profile = profileFor(model.meta.edition);
    for (const stage of [1, 2, 3] as const) {
      if (hasErrors(diagnostics)) break;
      for (const rule of profile.rules) {
        if (rule.stage === stage) diagnostics.push(...rule.run(model, { edition: profile.id }));
      }
      // Stage 3 is the simulator running the design's tests under the profile's mechanics.
      if (stage === 3 && model.tests.length > 0) {
        const tests = runTests(model, profile.mechanics);
        diagnostics.push(...tests.diagnostics);
        cases = tests.cases;
      }
    }
  }
  const ok = !hasErrors(diagnostics) && !(opts.strict && diagnostics.some((d) => d.severity === "warning"));
  const result: ValidationResult = { ok, diagnostics };
  if (model) result.model = model;
  if (cases) result.cases = cases;
  return result;
}
