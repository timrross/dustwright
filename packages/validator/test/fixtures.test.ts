import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_CODES } from "@dustwright/core";
import { mcfunctionExporter } from "@dustwright/export";
import { validateText } from "../src/index.js";

// Every diagnostic code has a passing and a failing fixture in packages/validator/fixtures/<code>/.
const dir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const read = (code: string, kind: "pass" | "fail") => readFileSync(`${dir}${code}/${kind}.rsd.json`, "utf8");

/** The codes a fixture run produces: validation, plus the function exporter for E014. */
async function codesFor(code: string, text: string): Promise<string[]> {
  const result = validateText(text);
  const codes = result.diagnostics.map((d) => d.code);
  if (code === "E014" && result.model)
    codes.push(...(await mcfunctionExporter.export(result.model, {})).diagnostics.map((d) => d.code));
  return codes;
}

const stageOneTwo = DIAGNOSTIC_CODES.filter((d) => d.stage !== 3).map((d) => d.code);

describe("diagnostic fixtures", () => {
  it("cover every stage 1 and 2 code and the exporter's", () => {
    expect(readdirSync(dir).sort()).toEqual([...stageOneTwo].sort());
  });

  it.each(stageOneTwo)("%s: the failing fixture reports it, the passing one does not", async (code) => {
    expect(await codesFor(code, read(code, "fail")), "fail fixture").toContain(code);
    expect(await codesFor(code, read(code, "pass")), "pass fixture").not.toContain(code);
  });

  it.each(stageOneTwo)("%s: the passing fixture has no errors at all", async (code) => {
    const result = validateText(read(code, "pass"));
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});
