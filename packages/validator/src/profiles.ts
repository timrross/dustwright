import type { Edition, EditionProfile } from "@dustwright/core";
import { BEDROCK_MECHANICS, JAVA_MECHANICS_STUB } from "@dustwright/sim";
import { RULES } from "./rules/index.js";

const rulesFor = (edition: Edition) => RULES.filter((r) => r.editions.includes(edition));

/** The Bedrock profile: the one edition v1 implements. Exporters join it in M3 and M4. */
export const BEDROCK_PROFILE: EditionProfile = {
  id: "bedrock",
  rules: rulesFor("bedrock"),
  mechanics: BEDROCK_MECHANICS,
  mapping: "bedrock",
  exporters: [],
  docs: "Bedrock Edition: no quasi-connectivity; see AUTHORING.md.",
};

/** The Java profile stub: its only rule reports E015, so Java designs parse and render but go no further. */
export const JAVA_PROFILE: EditionProfile = {
  id: "java",
  rules: rulesFor("java"),
  mechanics: JAVA_MECHANICS_STUB,
  mapping: "java",
  exporters: [],
  docs: "Java Edition is not supported yet (M9).",
};

/** Every edition profile by id. */
export const PROFILES: Readonly<Record<Edition, EditionProfile>> = {
  bedrock: BEDROCK_PROFILE,
  java: JAVA_PROFILE,
};

/** The profile for an edition. */
export function profileFor(edition: Edition): EditionProfile {
  return PROFILES[edition];
}
