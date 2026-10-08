import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@dustwright\/(core|validator|sim|viewer|export|mcp)$/, replacement: pkg("$1") },
      { find: /^dustwright$/, replacement: pkg("cli") },
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
