import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PINS } from "@dustwright/core";

// Security row "Behavior pack": data only, no script module, no network module, no dependencies.
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(`${root}/packs/redstone-designs-bp/manifest.json`, "utf8")) as {
  format_version: number;
  header: { uuid: string; version: number[]; min_engine_version: number[] };
  modules: { type: string; uuid: string }[];
  dependencies?: unknown[];
};

describe("redstone-designs-bp", () => {
  it("is data only: one data module, no scripts, no dependencies", () => {
    expect(manifest.modules.map((m) => m.type)).toEqual(["data"]);
    expect(manifest.dependencies).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toMatch(/@minecraft\/|"entry"|"language"/);
  });

  it("has fixed, distinct v4 UUIDs and tracks the pinned game version", () => {
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(manifest.header.uuid).toMatch(v4);
    expect(manifest.modules[0]?.uuid).toMatch(v4);
    expect(manifest.header.uuid).not.toBe(manifest.modules[0]?.uuid);
    expect(manifest.header.min_engine_version).toEqual(PINS.gameVersion.split(".").map(Number));
  });

  it("keeps nothing in the repo but the manifest (exports are written per run and git-ignored)", () => {
    const tracked = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "packs/redstone-designs-bp"],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
    expect(tracked.trim().split("\n").filter(Boolean)).toEqual(["packs/redstone-designs-bp/manifest.json"]);
  });
});
