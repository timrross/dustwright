import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse, parseText } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import {
  buildLines,
  clearLines,
  isAllowedLine,
  mcfunctionExporter,
  placementGroup,
  placementOrder,
  PRODUCIBLE_IDS,
} from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const goldenDir = fileURLToPath(new URL("./golden/", import.meta.url));
const decoder = new TextDecoder();
const examples = readdirSync(`${root}/examples`)
  .filter((f) => f.endsWith(".rsd.json"))
  .sort()
  .map((f) => ({ file: f, model: parseText(readFileSync(`${root}/examples/${f}`, "utf8")).model as Model }));

function exportAll(model: Model) {
  const out = mcfunctionExporter.export(model, { clear: true });
  return Object.fromEntries(
    out.files.map((f) => [f.path.replace(/^functions\/rsd\//, ""), decoder.decode(f.bytes)]),
  );
}

describe("golden files", () => {
  // Regenerate with UPDATE_GOLDEN=1 pnpm test packages/export after an intended change, and review the diff.
  it.each(examples.map((e) => [e.file, e.model] as const))("%s matches its golden files", (_f, model) => {
    for (const [name, text] of Object.entries(exportAll(model))) {
      const path = `${goldenDir}${name}`;
      // A missing golden file is written locally (then reviewed) but fails in CI.
      if (!existsSync(path) && process.env.CI) throw new Error(`missing golden file ${name}`);
      if (process.env.UPDATE_GOLDEN || !existsSync(path)) writeFileSync(path, text);
      expect(text, name).toBe(readFileSync(path, "utf8"));
    }
  });

  it("every line of every golden file is on the allowlist", () => {
    const files = readdirSync(goldenDir).filter((f) => f.endsWith(".mcfunction"));
    expect(files.length).toBeGreaterThanOrEqual(examples.length * 2);
    for (const f of files) {
      for (const line of readFileSync(`${goldenDir}${f}`, "utf8").trimEnd().split("\n")) {
        expect(isAllowedLine(line), `${f}: ${line}`).toBe(true);
      }
    }
  });

  it("is deterministic: the same design gives the same bytes", () => {
    for (const { model } of examples) expect(exportAll(model)).toEqual(exportAll(model));
  });
});

describe("placement order", () => {
  it.each(examples.map((e) => [e.file, e.model] as const))(
    "%s: building blocks, then components bottom to top, then power sources",
    (_f, model) => {
      const order = placementOrder(model).map(({ key, pos }) => ({
        group: placementGroup(model.blocks.get(key)!.type),
        y: pos[1],
      }));
      for (let i = 1; i < order.length; i++) {
        const [a, b] = [order[i - 1]!, order[i]!];
        expect(b.group > a.group || (b.group === a.group && b.y >= a.y)).toBe(true);
      }
    },
  );

  it("puts every support before the component it holds", () => {
    const model = examples.find((e) => e.file === "piston-door-2x2.rsd.json")!.model;
    const lines = buildLines(model);
    const torch = lines.findIndex((l) => l.includes("redstone_torch"));
    const support = lines.findIndex((l) => l.startsWith("setblock ~1 ~1 ~2 minecraft:stone"));
    expect(support).toBeGreaterThan(0);
    expect(torch).toBeGreaterThan(support);
  });
});

describe("safety", () => {
  it("never writes design text: a hostile name and annotation do not appear", () => {
    const evil = "x\nsay pwned\n</script>";
    const { model } = parse({
      format: "rsd/1",
      meta: { name: "hostile", slug: "hostile" },
      legend: { "#": "stone" },
      layers: [["#"]],
      annotations: [{ pos: [0, 0, 0], text: evil }],
      ext: { evil },
    });
    const files = Object.values(exportAll(model!));
    for (const text of files) {
      expect(text).not.toContain("pwned");
      expect(text).not.toContain("script");
      for (const line of text.trimEnd().split("\n")) expect(isAllowedLine(line), line).toBe(true);
    }
  });

  it("refuses an invalid slug with E012 even if handed a model directly", () => {
    const { model } = parse({
      format: "rsd/1",
      meta: { name: "ok" },
      legend: { "#": "stone" },
      layers: [["#"]],
    });
    const bad = { ...model!, meta: { ...model!.meta, slug: "../../evil" } };
    const out = mcfunctionExporter.export(bad, {});
    expect(out.files).toEqual([]);
    expect(out.diagnostics[0]?.code).toBe("E012");
  });

  it("the build function only places blocks: it never sets air", () => {
    for (const { model } of examples)
      for (const line of buildLines(model)) expect(line).not.toMatch(/minecraft:air/);
  });
});

describe("allowlist", () => {
  it("accepts only block IDs the registry produces", () => {
    expect(PRODUCIBLE_IDS.has("minecraft:stone")).toBe(true);
    expect(PRODUCIBLE_IDS.has("minecraft:command_block")).toBe(false);
    expect(isAllowedLine("setblock ~1 ~ ~ minecraft:stone")).toBe(true);
    expect(isAllowedLine("setblock ~1 ~ ~ minecraft:command_block")).toBe(false);
    expect(isAllowedLine("say hello")).toBe(false);
    expect(isAllowedLine("setblock ~1 ~ ~ minecraft:stone\nsay hi")).toBe(false);
  });
});

describe("doors", () => {
  it("place the lower half then the upper half one above", () => {
    const { model } = parse({
      format: "rsd/1",
      meta: { name: "d" },
      legend: { "#": "stone", D: "door facing=east material=iron" },
      layers: [["#"], ["D"], ["."]],
    });
    const lines = buildLines(model!);
    const lower = lines.findIndex(
      (l) => l.startsWith("setblock ~1 ~1 ~ minecraft:iron_door") && l.includes('"upper_block_bit"=false'),
    );
    const upper = lines.findIndex(
      (l) => l.startsWith("setblock ~1 ~2 ~ minecraft:iron_door") && l.includes('"upper_block_bit"=true'),
    );
    expect(lower).toBeGreaterThan(0);
    expect(upper).toBe(lower + 1);
  });
});

describe("limits", () => {
  const big = (layers: number) => {
    const rows = Array.from({ length: 64 }, () => "#".repeat(64));
    return parse({
      format: "rsd/1",
      meta: { name: "big" },
      legend: { "#": "stone" },
      layers: Array.from({ length: layers }, () => rows),
    }).model!;
  };

  it("E014 when the build would exceed the function command limit; --command-limit raises it", () => {
    const model = big(3); // 12,288 blocks
    const out = mcfunctionExporter.export(model, {});
    expect(out.files).toEqual([]);
    expect(out.diagnostics[0]).toMatchObject({ code: "E014" });
    expect(out.diagnostics[0]?.hint).toContain("mcstructure");
    expect(mcfunctionExporter.export(model, { commandLimit: 20_000 }).files).toHaveLength(1);
  });

  it("clears in fills of at most 32,768 blocks, top layers first, covering the box exactly", () => {
    const model = big(12);
    const fills = clearLines(model).slice(1);
    const covered: number[] = [];
    for (const line of fills) {
      const n = line.match(/~(-?\d+)?/g)!.map((t) => Number(t.slice(1) || 0));
      const [x1, y1, z1, x2, y2, z2] = n as [number, number, number, number, number, number];
      expect((x2 - x1 + 1) * (y2 - y1 + 1) * (z2 - z1 + 1)).toBeLessThanOrEqual(32_768);
      for (let y = y1; y <= y2; y++) covered.push(y);
    }
    expect([...covered].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const firstTop = Number(fills[0]!.match(/~(-?\d+)?/g)![4]!.slice(1) || 0);
    expect(firstTop).toBe(11);
  });

  it("applies --origin offsets", () => {
    const { model } = parse({
      format: "rsd/1",
      meta: { name: "o" },
      legend: { "#": "stone" },
      layers: [["#"]],
    });
    expect(buildLines(model!, [-3, 2, 0])[1]).toBe("setblock ~-3 ~2 ~ minecraft:stone");
  });
});
