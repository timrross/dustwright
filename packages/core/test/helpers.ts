import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Diagnostic, Model } from "../src/index.js";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** The example designs, by file name. */
export function examples(): { file: string; text: string }[] {
  return readdirSync(`${ROOT}/examples`)
    .filter((f) => f.endsWith(".rsd.json"))
    .sort()
    .map((file) => ({ file, text: readFileSync(`${ROOT}/examples/${file}`, "utf8") }));
}

/** A minimal valid design to mutate in tests. */
export function design(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: "rsd/1",
    meta: { name: "Test" },
    legend: { "#": "stone", L: "lever mount=floor", "-": "dust", "*": "lamp" },
    layers: [["####"], ["L-.*"]],
    ...overrides,
  };
}

export const codes = (ds: readonly Diagnostic[]) => ds.map((d) => d.code);

/** A JSON-friendly view of a model for snapshots: blocks as a sorted list. */
export function snapshotModel(model: Model): unknown {
  return {
    ...model,
    blocks: [...model.blocks]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, b]) => `${k} ${b.type} ${JSON.stringify(b.states)}`),
  };
}
