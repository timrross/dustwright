import { diag, PINS, registryEntry, keyPos } from "@dustwright/core";
import type { Diagnostic, Edition, Model, Pos, Rule } from "@dustwright/core";

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

/** The game version the registry targets for an edition. */
const pinnedVersion = (edition: Edition) => (edition === "java" ? PINS.javaVersion : PINS.gameVersion);

/** W107: `meta.gameVersion` differs from the registry's pinned game version for the design's edition. */
export const W107: Rule = {
  code: "W107",
  stage: 1,
  severity: "warning",
  editions: ["bedrock", "java"],
  run(model, ctx) {
    const v = model.meta.gameVersion;
    const pinned = pinnedVersion(ctx.edition);
    if (v === undefined || gameVersionMatches(v, pinned)) return [];
    return [
      diag("W107", `meta.gameVersion ${v} differs from the registry's pinned game version ${pinned}`, {
        path: "/meta/gameVersion",
        hint: `Re-verify the design in ${pinned} and set meta.gameVersion to it.`,
      }),
    ];
  },
};

/** W108: a block type whose mapping has no in-game verification yet. One warning per type, at its first block. */
export const W108: Rule = {
  code: "W108",
  stage: 1,
  severity: "warning",
  editions: ["bedrock", "java"],
  run(model: Model, ctx): Diagnostic[] {
    const first = new Map<string, Pos>();
    for (const [key, block] of model.blocks) if (!first.has(block.type)) first.set(block.type, keyPos(key));
    const out: Diagnostic[] = [];
    for (const [type, pos] of [...first].sort((a, b) => a[0].localeCompare(b[0]))) {
      const entry = registryEntry(type);
      if (ctx.edition === "java" ? entry?.java?.verified : entry?.verified) continue;
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
