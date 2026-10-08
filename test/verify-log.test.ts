import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderVerifyLog } from "@dustwright/core";
import { EXPORTER_ASSUMPTIONS } from "@dustwright/export";

describe("docs/verify-in-game.md", () => {
  it("is generated from the registry and the exporter assumptions, with no drift", () => {
    const text = readFileSync(fileURLToPath(new URL("../docs/verify-in-game.md", import.meta.url)), "utf8");
    expect(text).toBe(renderVerifyLog("bedrock", EXPORTER_ASSUMPTIONS));
  });
});

describe("VIG IDs", () => {
  it("never change once published: every row logged at M3 keeps its number", () => {
    const text = readFileSync(fileURLToPath(new URL("../docs/verify-in-game.md", import.meta.url)), "utf8");
    const rows = new Map(
      text
        .split("\n")
        .filter((l) => l.startsWith("| VIG-"))
        .map((l) => {
          const cells = l.split("|").map((c) => c.trim());
          return [cells[1], `${cells[2]}|${cells[3]}`] as const;
        }),
    );
    const published = readFileSync(
      fileURLToPath(new URL("./fixtures/vig-ids-m3.txt", import.meta.url)),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((l) => l.split("|"));
    for (const [id, area, item] of published) expect(rows.get(id as string), id).toBe(`${area}|${item}`);
  });
});
