import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Security row "Runtime network": the CLI never opens a socket, and the viewer fetches only its `src`.
const root = fileURLToPath(new URL("..", import.meta.url));
const NETWORK =
  /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|node:(http|https|http2|net|tls|dgram)\b|from "(http|https|net|tls|dgram)")/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : sources(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

describe("no runtime network access", () => {
  for (const pkg of ["core", "validator", "sim", "export", "cli", "mcp"]) {
    it(`${pkg} uses no network API`, () => {
      for (const file of sources(join(root, "packages", pkg, "src"))) {
        expect(NETWORK.test(readFileSync(file, "utf8")), file).toBe(false);
      }
    });
  }

  it("the viewer's only network call is the src fetch in element.ts", () => {
    const hits = sources(join(root, "packages/viewer/src")).filter((f) =>
      NETWORK.test(readFileSync(f, "utf8")),
    );
    expect(hits.map((f) => f.replace(root, ""))).toEqual(["packages/viewer/src/element.ts"]);
    const element = readFileSync(join(root, "packages/viewer/src/element.ts"), "utf8");
    expect(element.match(/fetch\s*\(/g)).toHaveLength(1);
  });
});
