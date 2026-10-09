import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import nbt from "prismarine-nbt";
import { describe, expect, it } from "vitest";
import { parse, PINS } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import {
  dustShape,
  encodeLitematic,
  encodeSchem,
  javaCells,
  javaStateString,
  litematicExporter,
  schemExporter,
} from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
/** Every pattern, as a Java design (the format is edition-neutral; only `meta.edition` changes). */
const designs = readdirSync(`${root}/patterns`)
  .filter((f) => f.endsWith(".rsd.json"))
  .sort()
  .map((f) => {
    const raw = JSON.parse(readFileSync(`${root}/patterns/${f}`, "utf8")) as {
      meta: Record<string, unknown>;
    };
    raw.meta.edition = "java";
    delete raw.meta.gameVersion;
    return [f, parse(raw).model as Model] as const;
  });

/** Decodes gzipped big-endian NBT with prismarine-nbt, independent of the writer the exporters use. */
const decode = (bytes: Uint8Array) =>
  nbt.simplify(nbt.parseUncompressed(gunzipSync(Buffer.from(bytes)), "big"));

const design = (layers: string[][], legend: Record<string, string>) =>
  parse({ format: "rsd/1", meta: { name: "t", edition: "java" }, legend, layers }).model as Model;

describe("Java dust shapes", () => {
  const shape = (m: Model, p: [number, number, number]) =>
    dustShape((q) => m.blocks.get(`${q[0]},${q[1]},${q[2]}`), p);

  it("a lone dust is a cross; one connection makes a line through it", () => {
    const lone = design([["###"], [".-."]], { "#": "stone", "-": "dust" });
    expect(shape(lone, [1, 1, 0])).toEqual({ north: "side", south: "side", east: "side", west: "side" });
    const line = design([["###"], ["--."]], { "#": "stone", "-": "dust" });
    expect(shape(line, [1, 1, 0])).toEqual({ north: "none", south: "none", east: "side", west: "side" });
  });

  it("a corner stays a corner; a lever beside it connects; dust a step up connects up", () => {
    const corner = design(
      [
        ["##", "##"],
        ["-.", "--"],
      ],
      { "#": "stone", "-": "dust" },
    );
    expect(shape(corner, [0, 1, 1])).toEqual({ north: "side", south: "none", east: "side", west: "none" });
    const lever = design([["##"], ["L-"]], { "#": "stone", "-": "dust", L: "lever mount=floor" });
    expect(shape(lever, [1, 1, 0]).west).toBe("side");
    const step = design([["###"], ["-#."], [".-."]], { "#": "stone", "-": "dust" });
    expect(shape(step, [0, 1, 0]).east).toBe("up");
  });
});

describe("Sponge schematic (.schem)", () => {
  it.each(designs)("%s decodes to the same blocks, in x, z, y order", async (_f, m) => {
    const s = decode(await encodeSchem(m)) as {
      Schematic: {
        Version: number;
        DataVersion: number;
        Width: number;
        Height: number;
        Length: number;
        Blocks: { Palette: Record<string, number>; Data: number[] };
      };
    };
    const x = s.Schematic;
    expect(x.Version).toBe(3);
    expect(x.DataVersion).toBe(PINS.javaDataVersion);
    const byIndex = new Map(Object.entries(x.Blocks.Palette).map(([k, v]) => [v, k]));
    // Varints: every value here is under 128 for these designs, but decode properly anyway.
    const ids: number[] = [];
    const bytes = x.Blocks.Data.map((b) => b & 0xff);
    for (let i = 0; i < bytes.length;) {
      let v = 0;
      let shift = 0;
      for (;;) {
        const b = bytes[i++] ?? 0;
        v |= (b & 0x7f) << shift;
        shift += 7;
        if (b < 0x80) break;
      }
      ids.push(v);
    }
    expect(ids).toHaveLength(x.Width * x.Height * x.Length);
    const cells = javaCells(m);
    for (const c of cells) {
      const at = c.pos[0] + c.pos[2] * x.Width + c.pos[1] * x.Width * x.Length;
      expect(byIndex.get(ids[at] ?? -1)).toBe(javaStateString(c.id, c.states));
    }
    const filled = ids.filter((i) => byIndex.get(i) !== "minecraft:air").length;
    expect(filled).toBe(cells.length);
  });

  it("is deterministic", async () => {
    const m = designs[0]?.[1] as Model;
    expect(Buffer.from(await encodeSchem(m)).equals(Buffer.from(await encodeSchem(m)))).toBe(true);
  });
});

describe("Litematica (.litematic)", () => {
  it.each(designs)("%s decodes to the same blocks from its packed longs", async (_f, m) => {
    const d = decode(await encodeLitematic(m)) as {
      MinecraftDataVersion: number;
      Regions: Record<
        string,
        {
          Size: { x: number; y: number; z: number };
          BlockStatePalette: { Name: string; Properties?: Record<string, string> }[];
          BlockStates: [number, number][];
        }
      >;
    };
    expect(d.MinecraftDataVersion).toBe(PINS.javaDataVersion);
    const region = d.Regions[m.meta.slug];
    expect(region).toBeDefined();
    if (!region) return;
    const { x: w, y: h, z: l } = region.Size;
    const palette = region.BlockStatePalette.map((e) => javaStateString(e.Name, e.Properties ?? {}));
    expect(palette[0]).toBe("minecraft:air");
    const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
    // prismarine-nbt gives each long as [high, low] 32-bit halves.
    const longs = region.BlockStates.map(([hi, lo]) => (BigInt(hi) << 32n) | BigInt(lo >>> 0));
    const read = (i: number) => {
      const bit = i * bits;
      const word = Math.floor(bit / 64);
      const offset = BigInt(bit % 64);
      const lo = BigInt.asUintN(64, longs[word] ?? 0n) >> offset;
      const hi = (bit % 64) + bits > 64 ? BigInt.asUintN(64, longs[word + 1] ?? 0n) << (64n - offset) : 0n;
      return Number((lo | hi) & ((1n << BigInt(bits)) - 1n));
    };
    for (const c of javaCells(m)) {
      expect(palette[read(c.pos[0] + c.pos[2] * w + c.pos[1] * w * l)]).toBe(javaStateString(c.id, c.states));
    }
    expect(w * h * l).toBeGreaterThan(0);
  });

  it("is deterministic, and both exporters name their file from the slug", async () => {
    const m = designs[0]?.[1] as Model;
    expect(Buffer.from(await encodeLitematic(m)).equals(Buffer.from(await encodeLitematic(m)))).toBe(true);
    expect((await schemExporter.export(m, {})).files.map((f) => f.path)).toEqual([`${m.meta.slug}.schem`]);
    expect((await litematicExporter.export(m, {})).files.map((f) => f.path)).toEqual([
      `${m.meta.slug}.litematic`,
    ]);
  });
});

// Goldens hold the NBT inside the gzip: the gzip header names the OS it was written on, so the compressed bytes
// differ between macOS and Linux while the content does not.
const goldenDir = fileURLToPath(new URL("./golden/java/", import.meta.url));
describe("Java goldens", () => {
  it.each(designs.filter(([f]) => ["not-gate.rsd.json", "t-flip-flop.rsd.json"].includes(f)))(
    "%s: .schem and .litematic match their golden NBT",
    async (_f, m) => {
      mkdirSync(goldenDir, { recursive: true });
      for (const [ext, bytes] of [
        ["schem.nbt", await encodeSchem(m)],
        ["litematic.nbt", await encodeLitematic(m)],
      ] as const) {
        const nbtBytes = gunzipSync(Buffer.from(bytes));
        const path = `${goldenDir}${m.meta.slug}.${ext}`;
        if (!existsSync(path) && process.env.CI) throw new Error(`missing golden file ${path}`);
        if (process.env.UPDATE_GOLDEN || !existsSync(path)) writeFileSync(path, nbtBytes);
        expect(nbtBytes.equals(readFileSync(path)), path).toBe(true);
      }
    },
  );
});
