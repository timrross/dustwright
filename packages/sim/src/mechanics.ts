import type { SimMechanics } from "@dustwright/core";

/** Bedrock redstone mechanics: no quasi-connectivity, push limit 12 (per the architecture spec). */
export const BEDROCK_MECHANICS: SimMechanics = { id: "bedrock", quasiConnectivity: false, pushLimit: 12 };

/** Placeholder for the Java mechanics, which arrive with the Java profile in M9. Never simulated before then. */
export const JAVA_MECHANICS_STUB: SimMechanics = { id: "java", quasiConnectivity: true, pushLimit: 12 };
