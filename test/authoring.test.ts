import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REGISTRY } from "@dustwright/core";
import { validateText } from "@dustwright/validator";

const text = readFileSync(fileURLToPath(new URL("../AUTHORING.md", import.meta.url)), "utf8");

describe("AUTHORING.md", () => {
  it("fits comfortably in a prompt (under 3,000 words)", () => {
    expect(text.split(/\s+/).filter(Boolean).length).toBeLessThan(3000);
  });

  it("lists every registry type with every state key", () => {
    for (const entry of REGISTRY) {
      const row = text.split("\n").find((l) => new RegExp(`^\\|\\s*\`${entry.type}\`\\s*\\|`).test(l));
      expect(row, entry.type).toBeDefined();
      for (const key of Object.keys(entry.states))
        expect(row, `${entry.type}.${key}`).toContain(`\`${key}\``);
    }
  });

  it("every JSON example validates with no errors", () => {
    const blocks = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of blocks) {
      const r = validateText(block);
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    }
  });
});
