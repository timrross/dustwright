import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Builds the self-contained viewer script used by `rsd bundle` and the hosted viewer.html: one IIFE file with
// three.js, the core parser and the static validator rules inlined, no dynamic imports, no external requests.
export default defineConfig({
  plugins: [
    {
      // three.js cites a paper in a shader comment; drop the URL so the bundle carries no remote addresses.
      name: "strip-citation-urls",
      renderChunk(code) {
        return code.replaceAll("https://jcgt.org/published/0007/04/01/", "jcgt.org 0007/04/01");
      },
    },
  ],
  resolve: {
    alias: {
      "@dustwright/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      "@dustwright/validator/static": fileURLToPath(new URL("../validator/src/static.ts", import.meta.url)),
    },
  },
  build: {
    outDir: "dist/bundle",
    emptyOutDir: true,
    target: "es2022",
    minify: true,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL("src/bundle.ts", import.meta.url)),
      name: "DustwrightViewer",
      formats: ["iife"],
      fileName: () => "redstone-viewer.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
