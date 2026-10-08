import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatSpec, keyPos, parse, parseText } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import { escapeXml, renderLayerSheets } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const goldenDir = fileURLToPath(new URL("./golden/sheets/", import.meta.url));
const example = (name: string) =>
  parseText(readFileSync(`${root}examples/${name}.rsd.json`, "utf8")).model as Model;

// The hostile-name design from the M2 viewer tests: a name and annotation that would run as HTML if not escaped.
const HOSTILE = "</script><img src=x onerror=alert(1)>";
const hostile = parse({
  format: "rsd/1",
  meta: { name: HOSTILE, slug: "hostile" },
  legend: { "#": "stone", L: "lever mount=floor", "*": "lamp" },
  layers: [["###"], ["L.*"]],
  annotations: [{ pos: [0, 1, 0], text: HOSTILE }],
}).model as Model;

function matchGolden(name: string, text: string) {
  const file = `${goldenDir}${name}`;
  if (!existsSync(file) && !process.env.CI) {
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(file, text);
  }
  expect(text).toBe(readFileSync(file, "utf8"));
}

describe("layer sheets", () => {
  it("one A4 sheet per layer, named from the slug only, matching the golden files", () => {
    const sheets = renderLayerSheets(example("not-gate"));
    expect(sheets.map((s) => s.path)).toEqual(["not-gate-layer-000.svg", "not-gate-layer-001.svg"]);
    for (const s of sheets) {
      expect(s.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="210mm" height="297mm"/);
      matchGolden(s.path, s.svg);
    }
  });

  it("is byte-identical for identical input", () => {
    expect(renderLayerSheets(example("t-flip-flop"))).toEqual(renderLayerSheets(example("t-flip-flop")));
  });

  it("puts every block of a layer in its legend, continuing on extra sheets when needed", () => {
    const model = example("orientation-test");
    const sheets = renderLayerSheets(model);
    expect(sheets.some((s) => s.path.includes("-legend-2"))).toBe(true);
    for (let y = 0; y < model.size[1]; y++) {
      const text = sheets
        .filter((s) => s.path.startsWith(`orientation-test-layer-${String(y).padStart(3, "0")}`))
        .map((s) => s.svg)
        .join("\n");
      for (const [key, block] of model.blocks) {
        if (keyPos(key)[1] === y)
          expect(text, formatSpec(block)).toContain(`>${escapeXml(formatSpec(block))}</text>`);
      }
    }
  });

  it("carries the hostile name only as escaped text (golden)", () => {
    const sheets = renderLayerSheets(hostile);
    for (const s of sheets) {
      expect(s.svg).not.toContain("<img");
      expect(s.svg).not.toContain("</script>");
      expect(s.svg).toContain("&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;");
      // Only the elements the renderer writes.
      expect(new Set([...s.svg.matchAll(/<([a-z]+)[\s>]/g)].map((m) => m[1]))).toEqual(
        new Set(["svg", "title", "rect", "text", "polygon", "line"].filter((t) => s.svg.includes(`<${t}`))),
      );
      matchGolden(s.path, s.svg);
    }
  });
});
