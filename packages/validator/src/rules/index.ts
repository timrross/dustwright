import type { Rule } from "@dustwright/core";
import { W107, W108 } from "./stage1.js";
import { E006, W101, W102, W103, W104, W105 } from "./stage2.js";

/**
 * Every validator rule, in one array. Each rule declares its stage and the editions it applies to; the runner
 * takes the subset for the design's edition from its profile. Codes are unique (tested), and
 * `docs/diagnostics.md` is generated from this array and the parser's codes in core.
 */
export const RULES: readonly Rule[] = [W107, W108, E006, W101, W102, W103, W104, W105];
