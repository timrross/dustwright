import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nbt from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import { parse, parseText, PINS, toEditionBlocks } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import {
  blockVersion,
  cellIndex,
  encodeStructure,
  mcstructureExporter,
  structureLayout,
} from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const goldenDir = fileURLToPath(new URL("./golden/", import.meta.url));
const examples = readdirSync(`${root}/examples`)
  .filter((f) => f.endsWith(".rsd.json"))
  .sort()
  .map((f) => [f, parseText(readFileSync(`${root}/examples/${f}`, "utf8")).model as Model] as const);

/** Decodes with prismarine-nbt: an implementation independent of the writer the exporter uses. */
const decode = (bytes: Uint8Array) =>
  nbt.simplify(nbt.parseUncompressed(Buffer.from(bytes), "little")) as {
    format_version: number;
    size: number[];
    structure: {
      block_indices: number[][];
      entities: unknown[];
      palette: {
        default: {
          block_palette: { name: string; states: Record<string, unknown>; version: number }[];
          block_position_data: object;
        };
      };
    };
    structure_world_origin: number[];
  };

describe("structure layout", () => {
  it("indexes cells with z fastest, then y, then x", () => {
    const size = [3, 4, 5] as const;
    expect(cellIndex(0, 0, 0, size)).toBe(0);
    expect(cellIndex(0, 0, 1, size)).toBe(1);
    expect(cellIndex(0, 1, 0, size)).toBe(5);
    expect(cellIndex(1, 0, 0, size)).toBe(20);
    expect(cellIndex(2, 3, 4, size)).toBe(59);
  });

  it("packs the pinned block-state version", () => {
    expect(blockVersion("1.21.60.33")).toBe(18168865);
    expect(blockVersion()).toBe(blockVersion(PINS.blockStateVersion));
  });

  it.each(examples)(
    "%s: every block at its cell, air as -1, one palette entry per distinct block",
    (_f, model) => {
      const layout = structureLayout(model);
      const [sx, sy, sz] = model.size;
      expect(layout.indices).toHaveLength(sx * sy * sz);
      const expected = new Map<number, string>();
      for (const [key, block] of model.blocks) {
        const [x, y, z] = key.split(",").map(Number) as [number, number, number];
        for (const b of toEditionBlocks(block, "bedrock")) {
          expected.set(
            cellIndex(x + b.offset[0], y + b.offset[1], z + b.offset[2], model.size),
            `${b.id}${JSON.stringify(b.states)}`,
          );
        }
      }
      layout.indices.forEach((i, cell) => {
        const want = expected.get(cell);
        if (want === undefined) expect(i, `cell ${cell}`).toBe(-1);
        else expect(`${layout.palette[i]!.name}${JSON.stringify(layout.palette[i]!.states)}`).toBe(want);
      });
      const keys = layout.palette.map((p) => `${p.name}${JSON.stringify(p.states)}`);
      expect(new Set(keys).size).toBe(keys.length);
    },
  );
});

describe("encoding", () => {
  it.each(examples)("%s decodes (prismarine-nbt) to the expected structure", async (_f, model) => {
    const layout = structureLayout(model);
    const s = decode(await encodeStructure(layout));
    expect(s.format_version).toBe(1);
    expect(s.size).toEqual([...model.size]);
    expect(s.structure_world_origin).toEqual([0, 0, 0]);
    expect(s.structure.block_indices[0]).toEqual(layout.indices);
    expect(s.structure.block_indices[1]).toEqual(layout.indices.map(() => -1));
    expect(s.structure.entities).toEqual([]);
    expect(s.structure.palette.default.block_position_data).toEqual({});
    const palette = s.structure.palette.default.block_palette;
    expect(palette.map((p) => p.name)).toEqual(layout.palette.map((p) => p.name));
    for (const [i, p] of palette.entries()) {
      expect(p.version).toBe(18168865);
      const states = Object.fromEntries(
        Object.entries(layout.palette[i]!.states).map(([k, v]) => [
          k,
          typeof v === "boolean" ? (v ? 1 : 0) : v,
        ]),
      );
      expect(p.states).toEqual(states);
    }
  });

  it.each(examples)("%s matches its golden file and is deterministic", async (_f, model) => {
    const out = await mcstructureExporter.export(model, {});
    const again = await mcstructureExporter.export(model, {});
    expect(out.files).toHaveLength(1);
    expect(Buffer.from(out.files[0]!.bytes).equals(Buffer.from(again.files[0]!.bytes))).toBe(true);
    const path = `${goldenDir}${model.meta.slug}.mcstructure`;
    if (!existsSync(path) && process.env.CI) throw new Error(`missing golden file ${path}`);
    if (process.env.UPDATE_GOLDEN || !existsSync(path)) writeFileSync(path, out.files[0]!.bytes);
    expect(Buffer.from(out.files[0]!.bytes).equals(readFileSync(path))).toBe(true);
  });
});

describe("refusals", () => {
  const one = () =>
    parse({ format: "rsd/1", meta: { name: "s" }, legend: { "#": "stone" }, layers: [["#"]] }).model!;

  it("refuses a model over the structure size limit with E007", async () => {
    const big = { ...one(), size: [65, 1, 1] as const };
    const out = await mcstructureExporter.export(big, {});
    expect(out.files).toEqual([]);
    expect(out.diagnostics[0]?.code).toBe("E007");
  });

  it("refuses an invalid slug with E012", async () => {
    const bad = { ...one(), meta: { ...one().meta, slug: "../x" } };
    expect((await mcstructureExporter.export(bad, {})).diagnostics[0]?.code).toBe("E012");
  });

  it("writes to structures/rsd/<slug>.mcstructure", async () => {
    expect((await mcstructureExporter.export(one(), {})).files[0]?.path).toBe("structures/rsd/s.mcstructure");
  });
});
