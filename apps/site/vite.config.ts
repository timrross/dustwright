import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { defineConfig, type Plugin } from "vite";
import { normaliseBase, rebaseHtml, rebaseMarkdown } from "./base-path.js";
import { EMBED_EXAMPLE_CSP, SITE_CSP } from "./csp.js";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const repo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const entry = (pkg: string, file = "index.ts") => repo(`packages/${pkg}/src/${file}`);

/** Every page of the site. */
const PAGES: Record<string, string> = {
  main: "index.html",
  view: "view/index.html",
  play: "play/index.html",
  patterns: "patterns/index.html",
  docs: "docs/index.html",
  "docs-authoring": "docs/authoring.html",
  "docs-diagnostics": "docs/diagnostics.html",
  "docs-mapping": "docs/bedrock-mapping.html",
  "docs-embedding": "docs/embedding.html",
  viewer: "viewer.html",
  "embed-example": "embed-example.html",
};
// bench/ (the M2 frame-rate page) is served by the dev server only; it is not part of the public build.

/** Repo Markdown files the docs pages render, and where their links to each other point on the site. */
const DOC_LINKS: Record<string, string> = {
  "AUTHORING.md": "/docs/authoring.html",
  "docs/diagnostics.md": "/docs/diagnostics.html",
  "docs/bedrock-mapping.md": "/docs/bedrock-mapping.html",
  "docs/embedding.md": "/docs/embedding.html",
};

/**
 * Renders `<!--doc:FILE-->` placeholders from the repo's Markdown, at build time and in the dev server. The
 * Markdown is the repo's own reviewed text, not design data.
 */
function docs(): Plugin {
  return {
    name: "dustwright-docs",
    transformIndexHtml(html) {
      return html.replace(/<!--doc:([\w./-]+)-->/g, (_, file: string) => {
        let out = marked.parse(readFileSync(repo(file), "utf8"), { async: false });
        for (const [md, page] of Object.entries(DOC_LINKS)) {
          out = out
            .replaceAll(`href="${md}"`, `href="${page}"`)
            .replaceAll(`href="../${md}"`, `href="${page}"`);
        }
        return out;
      });
    },
  };
}

/**
 * The CSP as a `<meta>` in every built page, for hosts that cannot send headers. Build only: the dev server injects
 * inline scripts for hot reload.
 */
function cspMeta(): Plugin {
  return {
    name: "dustwright-csp-meta",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const csp = ctx.path.endsWith("/embed-example.html") ? EMBED_EXAMPLE_CSP : SITE_CSP;
        const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
        const charset = /<meta charset="utf-8"\s*\/?>/i;
        if (!charset.test(html)) throw new Error(`${ctx.path}: no <meta charset> to put the CSP after`);
        return html.replace(charset, (m) => `${m}\n    ${meta}`);
      },
    },
  };
}

/** "/" on the site's own domain; "/dustwright/" for the GitHub Pages project site (.github/workflows/pages.yml). */
const BASE = normaliseBase(process.env.DUSTWRIGHT_BASE);

/**
 * Under a base path, puts the base in front of the root-relative links Vite leaves alone: links between pages and
 * viewer `src` attributes in every page, and the links in the two public files that carry any (copied as they are).
 */
function rebase(): Plugin {
  return {
    name: "dustwright-rebase",
    apply: "build",
    transformIndexHtml: { order: "post", handler: (html) => rebaseHtml(html, BASE) },
    closeBundle() {
      if (BASE === "/") return;
      const page = here("dist/plain-example.html");
      writeFileSync(page, rebaseHtml(readFileSync(page, "utf8"), BASE));
      const llms = here("dist/llms.txt");
      writeFileSync(llms, rebaseMarkdown(readFileSync(llms, "utf8"), BASE));
    },
  };
}

// The site builds the workspace packages from source, so a dev server or build never depends on stale dist output.
export default defineConfig({
  base: BASE,
  plugins: [docs(), cspMeta(), rebase()],
  resolve: {
    alias: [
      { find: "@dustwright/viewer/browser", replacement: entry("viewer", "browser.ts") },
      { find: "@dustwright/validator/static", replacement: entry("validator", "static.ts") },
      { find: /^@dustwright\/(core|validator|sim|export|viewer)$/, replacement: entry("$1") },
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    // The viewer chunk (three.js, the parser and the simulator) is about 700 kB; the budget is 1.5 MB.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: Object.fromEntries(Object.entries(PAGES).map(([name, file]) => [name, here(file)])),
    },
  },
  server: { fs: { allow: [repo("")] } },
});
