import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const entry = (pkg: string, file = "index.ts") =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/${file}`, import.meta.url));

// The site builds the workspace packages from source, so a dev server or build never depends on stale dist output.
export default defineConfig({
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
    // The viewer chunk (three.js plus the parser) is about 650 kB; the budget is 1.5 MB.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        play: fileURLToPath(new URL("play/index.html", import.meta.url)),
        bench: fileURLToPath(new URL("bench/index.html", import.meta.url)),
      },
    },
  },
  server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
});
