import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The viewer bundles the stage 1 and 2 rules through `@dustwright/validator/static`, so those files may import only
// core: anything else (the exporters and nbtify above all) would end up in the single-file viewer.
const root = fileURLToPath(new URL("..", import.meta.url));
const validatorSrc = `${root}/packages/validator/src`;
const staticFiles = ["static.ts", ...readdirSync(`${validatorSrc}/rules`).map((f) => `rules/${f}`)];
const bundle = `${root}/packages/viewer/dist/bundle/redstone-viewer.js`;

describe("static rules stay light", () => {
  it.each(staticFiles)("%s imports only core and its own rule files", (file) => {
    const source = readFileSync(`${validatorSrc}/${file}`, "utf8");
    const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1] as string);
    expect(
      specifiers.filter((s) => s !== "@dustwright/core" && !/^\.\/(rules\/)?[\w-]+\.js$/.test(s)),
    ).toEqual([]);
  });

  // CI builds before it tests; locally, run `pnpm build` first.
  it.skipIf(!existsSync(bundle) && !process.env.CI)("the viewer bundle carries no exporter", () => {
    const code = readFileSync(bundle, "utf8");
    // The pack paths are what catch an exporter: bundling drops module names such as "nbtify". The simulator
    // is in the bundle on purpose (the power view).
    for (const marker of ["functions/rsd", "structures/rsd", "nbtify"]) {
      expect(code.includes(marker), marker).toBe(false);
    }
  });
});
