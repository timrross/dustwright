import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PINS, renderMappingDoc } from "../src/index.js";
import { ROOT } from "./helpers.js";

describe("docs/bedrock-mapping.md", () => {
  it("is generated from the registry and has no drift", () => {
    expect(readFileSync(`${ROOT}/docs/bedrock-mapping.md`, "utf8")).toBe(renderMappingDoc("bedrock"));
  });

  it("lists the pinned vanilla-data version", () => {
    expect(renderMappingDoc()).toContain(`\`@minecraft/vanilla-data\`: ${PINS.vanillaData}`);
  });
});
