import { hasErrors, parse, parseText } from "@dustwright/core";
import type { Diagnostic, Model, ParseResult } from "@dustwright/core";
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
  if (model) {
    const profile = profileFor(model.meta.edition);
    for (const stage of [1, 2, 3] as const) {
      if (hasErrors(diagnostics)) break;
      for (const rule of profile.rules) {
        if (rule.stage === stage) diagnostics.push(...rule.run(model, { edition: profile.id }));
      }
    }
  }
  const ok = !hasErrors(diagnostics) && !(opts.strict && diagnostics.some((d) => d.severity === "warning"));
  const result: ValidationResult = { ok, diagnostics };
  if (model) result.model = model;
  return result;
}
