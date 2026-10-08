import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseText, PINS } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import {
  buildManifest,
  buildMcpack,
  designManifest,
  mcfunctionExporter,
  mcstructureExporter,
  TEST_PACK_MANIFEST,
  uuidV5,
} from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const example = (name: string) =>
  parseText(readFileSync(`${root}examples/${name}.rsd.json`, "utf8")).model as Model;
const golden = fileURLToPath(new URL("./golden/not-gate.mcpack", import.meta.url));

describe("pack manifests", () => {
  it("one builder produces the committed test-pack manifest byte for byte", () => {
    expect(buildManifest(TEST_PACK_MANIFEST)).toBe(
      readFileSync(`${root}packs/redstone-designs-bp/manifest.json`, "utf8"),
    );
  });

  it("computes UUIDv5 per RFC 9562 (the python.org vector in the DNS namespace)", async () => {
    expect(await uuidV5("python.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "886313e1-3b8a-5372-9b90-0c9aee199e5d",
    );
  });

  it("gives each design one fixed identity: v5 UUIDs of the slug, data only, the pinned engine version", async () => {
    const m = JSON.parse(await designManifest("not-gate")) as {
      header: { uuid: string; name: string; min_engine_version: number[] };
      modules: { type: string; uuid: string }[];
      dependencies?: unknown;
    };
    const v5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(m.header.uuid).toMatch(v5);
    expect(m.modules.map((x) => x.type)).toEqual(["data"]);
    expect(m.modules[0]?.uuid).toMatch(v5);
    expect(m.modules[0]?.uuid).not.toBe(m.header.uuid);
    expect(m.dependencies).toBeUndefined();
    expect(m.header.min_engine_version).toEqual(PINS.gameVersion.split(".").map(Number));
    expect(await designManifest("not-gate")).toBe(await designManifest("not-gate"));
    expect(JSON.parse(await designManifest("t-flip-flop")).header.uuid).not.toBe(m.header.uuid);
  });
});

describe("buildMcpack", () => {
  it("zips exactly the manifest, the function and the structure", async () => {
    const model = example("not-gate");
    const result = await buildMcpack(model);
    expect(result.fileName).toBe("not-gate.mcpack");
    const files = unzipSync(result.bytes as Uint8Array);
    expect(Object.keys(files)).toEqual([
      "manifest.json",
      "functions/rsd/not-gate.mcfunction",
      "structures/rsd/not-gate.mcstructure",
    ]);
    const fn = (await mcfunctionExporter.export(model, {})).files[0]?.bytes;
    const st = (await mcstructureExporter.export(model, {})).files[0]?.bytes;
    expect(files["functions/rsd/not-gate.mcfunction"]).toEqual(fn);
    expect(files["structures/rsd/not-gate.mcstructure"]).toEqual(st);
    expect(new TextDecoder().decode(files["manifest.json"])).toBe(await designManifest("not-gate"));
  });

  it("is byte-identical for identical input (golden file)", async () => {
    const bytes = (await buildMcpack(example("not-gate"))).bytes as Uint8Array;
    expect(bytes).toEqual((await buildMcpack(example("not-gate"))).bytes);
    if (!existsSync(golden) && !process.env.CI) writeFileSync(golden, bytes);
    expect(Buffer.from(bytes).equals(readFileSync(golden))).toBe(true);
  });

  // Zip dates are local time: the same pack must come out of every time zone. Runs the built package in child
  // processes with TZ set (CI builds before it tests; locally, run pnpm build first).
  const dist = `${root}packages/export/dist/index.js`;
  it.skipIf(!existsSync(dist) && !process.env.CI)("is byte-identical in every time zone", () => {
    const script = `
      const { readFileSync } = await import("node:fs");
      const { parseText } = await import(${JSON.stringify(`${root}packages/core/dist/index.js`)});
      const { buildMcpack } = await import(${JSON.stringify(dist)});
      const model = parseText(readFileSync(${JSON.stringify(`${root}examples/not-gate.rsd.json`)}, "utf8")).model;
      process.stdout.write(Buffer.from((await buildMcpack(model)).bytes).toString("base64"));`;
    for (const tz of [
      "UTC",
      "Pacific/Kiritimati",
      "America/Los_Angeles",
      "Asia/Kathmandu",
      "America/St_Johns",
    ]) {
      const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        env: { ...process.env, TZ: tz },
        encoding: "utf8",
      });
      expect(Buffer.from(out, "base64").equals(readFileSync(golden)), tz).toBe(true);
    }
  });

  it("refuses a design the function exporter refuses (E014), with no bytes", async () => {
    const big = parseText(readFileSync(`${root}packages/validator/fixtures/E014/fail.rsd.json`, "utf8"))
      .model as Model;
    const result = await buildMcpack(big);
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toContain("E014");
  });
});
