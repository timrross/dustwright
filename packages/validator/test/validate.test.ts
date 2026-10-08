import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_CODES, PINS } from "@dustwright/core";
import {
  BEDROCK_PROFILE,
  gameVersionMatches,
  JAVA_PROFILE,
  renderDiagnosticsDoc,
  RULES,
  validate,
  validateText,
} from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const base = {
  format: "rsd/1",
  meta: { name: "v" },
  legend: { "#": "stone", L: "lever", "*": "lamp" },
  layers: [["##"], ["L*"]],
};

describe("validate", () => {
  it.each(readdirSync(`${root}/examples`).filter((f) => f.endsWith(".rsd.json")))(
    "example %s has no errors",
    (file) => {
      const r = validateText(readFileSync(`${root}/examples/${file}`, "utf8"));
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(r.ok).toBe(true);
    },
  );

  it("a java design parses and renders (model present) but reports E015, and only the Bedrock profile has rules beyond the stub", () => {
    const r = validate({ ...base, meta: { name: "j", edition: "java" } });
    expect(r.model).toBeDefined();
    expect(r.ok).toBe(false);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E015"]);
    expect(JAVA_PROFILE.rules.map((x) => x.code)).toEqual(["E015"]);
    expect(BEDROCK_PROFILE.rules.map((x) => x.code)).not.toContain("E015");
  });

  it("W108 once per unverified type; W107 on a differing game version", () => {
    const r = validate({ ...base, meta: { name: "v", gameVersion: "1.21.0" } });
    expect(r.ok).toBe(true);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["W107", "W108", "W108", "W108"]);
    expect(
      validate({ ...base, meta: { name: "v", gameVersion: PINS.gameVersion } }).diagnostics.some(
        (d) => d.code === "W107",
      ),
    ).toBe(false);
  });

  it("strict makes warnings fail", () => {
    expect(validate(base, { strict: true }).ok).toBe(false);
  });

  it("stops after stage 1 errors", () => {
    const r = validate({ ...base, layers: [["##"], ["L?"]] });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["W106", "E003"]);
    expect(r.model).toBeUndefined();
  });

  it("matches .x game versions", () => {
    expect(gameVersionMatches("1.26.x", "1.26.50")).toBe(true);
    expect(gameVersionMatches("1.26.50", "1.26.50")).toBe(true);
    expect(gameVersionMatches("1.26", "1.26.50")).toBe(false);
    expect(gameVersionMatches("1.21.x", "1.26.50")).toBe(false);
  });
});

describe("diagnostic codes", () => {
  it("are unique", () => {
    const all = DIAGNOSTIC_CODES.map((d) => d.code);
    expect(new Set(all).size).toBe(all.length);
    const rules = RULES.map((r) => r.code);
    expect(new Set(rules).size).toBe(rules.length);
  });

  it("every rule is documented with the same severity and stage", () => {
    for (const rule of RULES) {
      const info = DIAGNOSTIC_CODES.find((d) => d.code === rule.code);
      expect(info, rule.code).toBeDefined();
      expect(info?.severity).toBe(rule.severity);
      expect(info?.stage).toBe(rule.stage);
    }
  });

  it("cover the spec's code list", () => {
    const expected = [
      ...Array.from({ length: 15 }, (_, i) => `E${String(i + 1).padStart(3, "0")}`),
      ...Array.from({ length: 8 }, (_, i) => `W${101 + i}`),
      "T001",
      "T002",
      "T003",
    ];
    expect(DIAGNOSTIC_CODES.map((d) => d.code).sort()).toEqual(expected.sort());
  });

  it("docs/diagnostics.md is generated and has no drift", () => {
    expect(readFileSync(`${root}/docs/diagnostics.md`, "utf8")).toBe(renderDiagnosticsDoc());
  });
});
