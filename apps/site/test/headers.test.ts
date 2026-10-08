import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMBED_EXAMPLE_CSP, SITE_CSP, SITE_HEADERS } from "../csp.js";

// The security headers live in three places (the Cloudflare/Netlify _headers file, the nginx snippet, the meta tag
// in every page); this keeps them identical to csp.ts. Checking them on a live host is deploy-stack work.
const site = fileURLToPath(new URL("..", import.meta.url));
const repo = fileURLToPath(new URL("../../..", import.meta.url));
const dist = join(site, "dist");

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? htmlFiles(p) : f.endsWith(".html") ? [p] : [];
  });
}

const metaCsp = (html: string) =>
  /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1];

describe("security headers", () => {
  it("the CSP allows only the site and https: fetches, and nothing inline", () => {
    expect(SITE_CSP).toContain("default-src 'self'");
    expect(SITE_CSP).toContain("connect-src 'self' https:");
    expect(SITE_CSP).toContain("img-src 'self' data:");
    expect(SITE_CSP).toContain("frame-src 'self';");
    expect(SITE_CSP).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    // The embedding example may frame loopback builds only, never another site.
    expect(/frame-src[^;]*https/.test(EMBED_EXAMPLE_CSP)).toBe(false);
  });

  it("public/_headers sends the CSP and the other headers on every path", () => {
    const text = readFileSync(join(site, "public/_headers"), "utf8");
    expect(text).toContain("/*\n");
    expect(text).toContain(`  Content-Security-Policy: ${SITE_CSP}\n`);
    for (const [name, value] of Object.entries(SITE_HEADERS)) expect(text).toContain(`  ${name}: ${value}\n`);
  });

  it("the nginx snippet sends the same headers, always", () => {
    const text = readFileSync(join(repo, "deploy/nginx/dustwright.conf"), "utf8");
    expect(text).toContain(`add_header Content-Security-Policy "${SITE_CSP}" always;`);
    for (const [name, value] of Object.entries(SITE_HEADERS))
      expect(text).toContain(`add_header ${name} "${value}" always;`);
    // nginx drops server-level add_header in any location that has its own.
    const blocks = [...text.matchAll(/^location[^{]*\{([^}]*)\}/gm)].map((m) => m[1] as string);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) expect(block).not.toContain("add_header");
  });

  it("the plain HTML example carries the CSP as a meta tag", () => {
    expect(metaCsp(readFileSync(join(site, "public/plain-example.html"), "utf8"))).toBe(SITE_CSP);
  });

  // CI builds before it tests; locally, run `pnpm build` first.
  it.skipIf(!existsSync(dist) && !process.env.CI)("every built page carries the CSP as a meta tag", () => {
    const pages = htmlFiles(dist);
    expect(pages.length).toBeGreaterThanOrEqual(11);
    for (const page of pages) {
      const expected = page.endsWith("embed-example.html") ? EMBED_EXAMPLE_CSP : SITE_CSP;
      expect(metaCsp(readFileSync(page, "utf8")), page).toBe(expected);
    }
  });

  it.skipIf(!existsSync(dist) && !process.env.CI)("no built script uses eval or new Function", () => {
    const assets = join(dist, "assets");
    const scripts = [
      ...readdirSync(assets)
        .filter((x) => x.endsWith(".js"))
        .map((x) => join(assets, x)),
      join(dist, "redstone-viewer.js"),
    ];
    for (const f of scripts) {
      const code = readFileSync(f, "utf8");
      expect(/\beval\(|new Function\(/.test(code), f).toBe(false);
    }
  });
});
