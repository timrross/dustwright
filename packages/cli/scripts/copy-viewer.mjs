// Copies the prebuilt viewer bundle into packages/cli/assets/ so `rsd bundle` can inline it. The CLI does not
// depend on @dustwright/viewer as code (nothing may); the bundle is a build artifact. Run after the viewer builds.
// Also copies AUTHORING.md and the pattern library, which `rsd mcp` serves to agents.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const from = fileURLToPath(new URL("../../viewer/dist/bundle/redstone-viewer.js", import.meta.url));
const to = fileURLToPath(new URL("../assets/redstone-viewer.js", import.meta.url));
if (!existsSync(from)) {
  console.error(`missing ${from}: build @dustwright/viewer first (pnpm build does this in order)`);
  process.exit(1);
}
mkdirSync(fileURLToPath(new URL("../assets/", import.meta.url)), { recursive: true });
copyFileSync(from, to);
console.log("copied the viewer bundle to packages/cli/assets/redstone-viewer.js");

const repo = (p) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const assets = (p) => fileURLToPath(new URL(`../assets/${p}`, import.meta.url));
copyFileSync(repo("AUTHORING.md"), assets("AUTHORING.md"));
rmSync(assets("patterns"), { recursive: true, force: true });
mkdirSync(assets("patterns"), { recursive: true });
const patterns = readdirSync(repo("patterns")).filter((f) => f.endsWith(".rsd.json"));
for (const f of patterns) copyFileSync(repo(`patterns/${f}`), assets(`patterns/${f}`));
console.log(`copied AUTHORING.md and ${patterns.length} patterns to packages/cli/assets/`);
