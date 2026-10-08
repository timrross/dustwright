// Copies the stable raw files the site serves into public/ before a build or dev server: the JSON Schemas,
// AUTHORING.md, the example designs and the single-file viewer script, and writes llms.txt. The copies are
// git-ignored; the repo files are the source.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const pub = fileURLToPath(new URL("../public/", import.meta.url));

for (const dir of ["schema", "examples"]) {
  rmSync(`${pub}${dir}`, { recursive: true, force: true });
  mkdirSync(`${pub}${dir}`, { recursive: true });
}
copyFileSync(`${root}packages/core/schema/rsd-1.json`, `${pub}schema/rsd-1.json`);
copyFileSync(`${root}packages/core/schema/diagnostics.json`, `${pub}schema/diagnostics.json`);
copyFileSync(`${root}AUTHORING.md`, `${pub}AUTHORING.md`);
const examples = readdirSync(`${root}examples`)
  .filter((f) => f.endsWith(".rsd.json"))
  .sort();
for (const f of examples) copyFileSync(`${root}examples/${f}`, `${pub}examples/${f}`);
const viewer = `${root}packages/viewer/dist/bundle/redstone-viewer.js`;
if (existsSync(viewer)) copyFileSync(viewer, `${pub}redstone-viewer.js`);
else
  console.warn(
    "sync-public: the viewer bundle is not built yet (pnpm build); /redstone-viewer.js will be missing",
  );

writeFileSync(
  `${pub}llms.txt`,
  `# Dustwright

> Describe, check, view and export Minecraft Bedrock redstone designs. A design is one JSON file (format rsd/1):
> layers of character grids, a legend of block specs, ports and truth-table tests. Validate it, view it in 3D,
> and export it as a function, a structure or a behavior pack.

## Docs

- [AUTHORING.md](/AUTHORING.md): how to write a design, block by block, and the authoring loop
- [Diagnostics](/docs/diagnostics.html): every diagnostic code and its fix
- [Bedrock mapping](/docs/bedrock-mapping.html): every block type and state, with its Bedrock ID

## Schemas

- [rsd/1 design format](/schema/rsd-1.json): JSON Schema for .rsd.json files
- [Diagnostics output](/schema/diagnostics.json): JSON Schema for \`rsd validate --json\`

## Examples

${examples.map((f) => `- [${f.replace(/\.rsd\.json$/, "")}](/examples/${f})`).join("\n")}

## Tools

- [Playground](/play/): edit a design and see diagnostics and the 3D view live
- [Viewer](/view/): open a design from a share link (#d= or #json=), a URL (?src=) or a file
`,
);
console.log(`sync-public: ${examples.length} examples, schemas, AUTHORING.md, llms.txt`);
