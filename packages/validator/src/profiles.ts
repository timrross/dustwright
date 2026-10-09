import type { Edition, EditionProfile } from "@dustwright/core";
import { EXPORTERS } from "@dustwright/export";
import { MECHANICS } from "@dustwright/sim";
import { RULES } from "./rules/index.js";

const rulesFor = (edition: Edition) => RULES.filter((r) => r.editions.includes(edition));

/** The Bedrock profile: the one edition v1 implements. */
export const BEDROCK_PROFILE: EditionProfile = {
  id: "bedrock",
  rules: rulesFor("bedrock"),
  mechanics: MECHANICS.bedrock,
  mapping: "bedrock",
  exporters: EXPORTERS.filter((e) => e.target === "bedrock"),
  docs: "Bedrock Edition: no quasi-connectivity; see AUTHORING.md.",
};

/** The Java profile (M9): quasi-connectivity is a feature, so W105 is not among its rules; exports .schem and .litematic. */
export const JAVA_PROFILE: EditionProfile = {
  id: "java",
  rules: rulesFor("java"),
  mechanics: MECHANICS.java,
  mapping: "java",
  exporters: EXPORTERS.filter((e) => e.target === "java"),
  docs: "Java Edition: quasi-connectivity powers pistons; see the Java section of AUTHORING.md.",
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
