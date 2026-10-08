import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { holdsOnFace, parseSpec, REGISTRY } from "../src/index.js";
import type { FaceKind } from "../src/index.js";

// The registry's support faces must match the in-game measurement (deploy/test-world/measure-supports.mjs), never
// memory. A component is held on a face when it survives a neighbour update and breaks when the support goes.
const evidence = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../docs/ingame/2026-10-08-supports.json", import.meta.url)),
    "utf8",
  ),
) as { table: Record<string, Record<string, "holds" | "breaks" | "support did not place">> };

/** The components measured against each face. Levers attach to anything (`anyBlock`), so they say nothing here. */
const FACE_COMPONENTS: Record<FaceKind, readonly string[]> = {
  top: ["dust", "repeater", "comparator", "torch floor", "button floor", "pressure_plate", "door"],
  side: ["torch wall", "button wall"],
  bottom: ["button ceiling"],
};
const KINDS = Object.keys(FACE_COMPONENTS) as FaceKind[];

const rows = Object.entries(evidence.table).filter(([, row]) =>
  Object.values(row).some((r) => r !== "support did not place"),
);

describe("support faces against the in-game measurement", () => {
  it("measured every registry type", () => {
    expect(
      REGISTRY.filter((e) => e.type !== "door" && !(e.type in evidence.table)).map((e) => e.type),
    ).toEqual([]);
  });

  it.each(rows)("%s", (label, row) => {
    const block = parseSpec(label, "bedrock").block;
    expect(block, label).toBeDefined();
    if (!block) return;
    for (const kind of KINDS) {
      const results = new Set(FACE_COMPONENTS[kind].map((c) => row[c]));
      // Every component on one face agrees, so the face is one fact.
      expect(results.size, `${label} ${kind}: ${[...results].join(", ")}`).toBe(1);
      const held = results.has("holds");
      expect(holdsOnFace(block, kind), `${label} ${kind}`).toBe(held);
    }
  });

  it("levers held on every measured face of every block that placed", () => {
    for (const [label, row] of rows) {
      for (const c of ["lever floor", "lever wall", "lever ceiling"]) {
        if (row[c] !== "support did not place") expect(row[c], `${label} ${c}`).toBe("holds");
      }
    }
  });
});
