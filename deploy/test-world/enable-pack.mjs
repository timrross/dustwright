// Enables packs/redstone-designs-bp in the test world by writing worlds/<level>/world_behavior_packs.json from the
// pack's manifest. Run once after the server has created the world (first start), then restart the container.
//   node deploy/test-world/enable-pack.mjs [data-dir] [level-name]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const dataDir = process.argv[2] ?? `${here}data`;
const level = process.argv[3] ?? "dustwright-test";
const manifest = JSON.parse(readFileSync(`${here}../../packs/redstone-designs-bp/manifest.json`, "utf8"));
const dir = `${dataDir}/worlds/${level}`;
mkdirSync(dir, { recursive: true });
const entry = [{ pack_id: manifest.header.uuid, version: manifest.header.version }];
writeFileSync(`${dir}/world_behavior_packs.json`, `${JSON.stringify(entry, null, 2)}\n`);
console.log(`enabled ${manifest.header.name} ${manifest.header.version.join(".")} in ${dir}`);
