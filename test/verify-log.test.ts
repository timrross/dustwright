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
