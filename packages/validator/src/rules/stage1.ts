import { diag, PINS, registryEntry, keyPos } from "@dustwright/core";
import type { Diagnostic, Model, Pos, Rule } from "@dustwright/core";

/** True when a design's game version (which may end in `.x`) matches the pinned one. */
export function gameVersionMatches(design: string, pinned: string): boolean {
  const a = design.split(".");
  const b = pinned.split(".");
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "x") return true;
    if (a[i] !== b[i]) return false;
  }
  return a.length === b.length;
}

/** W107: `meta.gameVersion` differs from the registry's pinned game version. */
export const W107: Rule = {
  code: "W107",
  stage: 1,
  severity: "warning",
  editions: ["bedrock"],
  run(model) {
    const v = model.meta.gameVersion;
    if (v === undefined || gameVersionMatches(v, PINS.gameVersion)) return [];
    return [
      diag(
        "W107",
        `meta.gameVersion ${v} differs from the registry's pinned game version ${PINS.gameVersion}`,
        {
          path: "/meta/gameVersion",
          hint: `Re-verify the design in ${PINS.gameVersion} and set meta.gameVersion to it.`,
        },
      ),
    ];
  },
};

/** W108: a block type whose mapping has no in-game verification yet. One warning per type, at its first block. */
export const W108: Rule = {
  code: "W108",
  stage: 1,
  severity: "warning",
  editions: ["bedrock"],
  run(model: Model): Diagnostic[] {
    const first = new Map<string, Pos>();
    for (const [key, block] of model.blocks) if (!first.has(block.type)) first.set(block.type, keyPos(key));
    const out: Diagnostic[] = [];
    for (const [type, pos] of [...first].sort((a, b) => a[0].localeCompare(b[0]))) {
      const entry = registryEntry(type);
      if (entry?.verified) continue;
      const directional = Object.values(entry?.states ?? {}).some((d) => d.directional);
      out.push(
        diag("W108", `The ${type} mapping has not been verified in game yet (VERIFY-IN-GAME)`, {
          pos,
          hint: directional
            ? `Check ${type} in a test world before relying on its orientation.`
            : `Check ${type} in a test world before relying on its mapping.`,
        }),
      );
    }
    return out;
  },
};

/** E015: the Java profile is a stub until M9, so a Java design parses and renders but cannot go further. */
export const E015: Rule = {
  code: "E015",
  stage: 1,
  severity: "error",
  editions: ["java"],
  run(model) {
    return [
      diag("E015", `Edition "${model.meta.edition}" is not supported yet`, {
        path: "/meta/edition",
        hint: 'Set meta.edition to "bedrock"; the Java profile arrives in M9.',
      }),
    ];
  },
};
