import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { parse, parseText, PINS } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import {
  buildLines,
  buildLoaderPack,
  formatStates,
  LOADER_SCRIPT,
  loaderDesign,
  loaderDesignsModule,
} from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const patterns = readdirSync(`${root}/patterns`)
  .filter((f) => f.endsWith(".rsd.json"))
  .sort()
  .map((f) => parseText(readFileSync(`${root}/patterns/${f}`, "utf8")).model as Model);

describe("Script API loader", () => {
  it("places each design's blocks in the function exporter's order, with the same IDs and states", () => {
    for (const m of patterns) {
      const lines = buildLines(m, [0, 0, 0]).slice(1);
      const fromLoader = loaderDesign(m).blocks.map(
        ([x, y, z, id, states]) => `${x},${y},${z} ${id}${formatStates(states)}`,
      );
      const fromFunction = lines.map((l) => {
        const [, x, y, z, rest] = /^setblock (\S+) (\S+) (\S+) (minecraft:.*)$/.exec(l) ?? [];
        const n = (t = "") => (t === "~" ? 0 : Number(t.slice(1)));
        return `${n(x)},${n(y)},${n(z)} ${rest}`;
      });
      expect(fromLoader, m.meta.slug).toEqual(fromFunction);
    }
  });

  it("stores designs as one JSON literal that reads back as data", () => {
    const text = loaderDesignsModule(patterns);
    const json = /^export const DESIGNS = (.*);$/m.exec(text)?.[1] ?? "";
    expect(JSON.parse(json)).toEqual(
      JSON.parse(JSON.stringify(Object.fromEntries(patterns.map((m) => [m.meta.slug, loaderDesign(m)])))),
    );
    expect(
      text.split("\n").filter((l) => l && !l.startsWith("//") && !l.startsWith("export const DESIGNS = ")),
    ).toEqual([]);
  });

  it("uses only the pinned stable @minecraft/server, and no other module", async () => {
    expect([...LOADER_SCRIPT.matchAll(/from "([^"]+)"/g)].map((m) => m[1])).toEqual([
      "@minecraft/server",
      "./designs.js",
    ]);
    const pack = await buildLoaderPack(patterns);
    const files = unzipSync(pack.bytes as Uint8Array);
    expect(Object.keys(files).sort()).toEqual(["manifest.json", "scripts/designs.js", "scripts/main.js"]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"] as Uint8Array));
    expect(manifest.dependencies).toEqual([
      { module_name: "@minecraft/server", version: PINS.scriptApiServer },
    ]);
    expect(PINS.scriptApiServer).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.modules).toMatchObject([{ type: "script", entry: "scripts/main.js" }]);
    expect(strFromU8(files["scripts/main.js"] as Uint8Array)).toBe(LOADER_SCRIPT);
  });

  it("is deterministic, refuses duplicate slugs, and refuses Java designs", async () => {
    const a = await buildLoaderPack(patterns);
    const b = await buildLoaderPack(patterns);
    expect(Buffer.from(a.bytes as Uint8Array).equals(Buffer.from(b.bytes as Uint8Array))).toBe(true);
    const twice = await buildLoaderPack([patterns[0] as Model, patterns[0] as Model]);
    expect(twice.bytes).toBeUndefined();
    expect(twice.diagnostics.map((d) => d.code)).toEqual(["E012"]);
    const java = parse({
      format: "rsd/1",
      meta: { name: "j", edition: "java" },
      legend: { "#": "stone" },
      layers: [["#"]],
    }).model as Model;
    await expect(buildLoaderPack([java])).rejects.toThrow(/Bedrock/);
  });
});
