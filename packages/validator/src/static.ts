import { hasErrors } from "@dustwright/core";
import type { Diagnostic, Model } from "@dustwright/core";
import { RULES } from "./rules/index.js";

/**
 * Runs the static rules (stages 1 and 2) of the model's edition on a parsed model. A stage runs only if the ones
 * before it found no errors. This entry point (`@dustwright/validator/static`) imports nothing but core, so the
 * viewer can show markers without bundling the simulator or the exporters.
 */
export function checkStatic(model: Model): Diagnostic[] {
  const edition = model.meta.edition;
  const diagnostics: Diagnostic[] = [];
  for (const stage of [1, 2] as const) {
    if (hasErrors(diagnostics)) break;
    for (const rule of RULES) {
      if (rule.stage === stage && rule.editions.includes(edition))
        diagnostics.push(...rule.run(model, { edition }));
    }
  }
  return diagnostics;
}
