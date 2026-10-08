// Downloads the pinned Mojang bedrock-samples block metadata into .cache/ (gitignored: it is Mojang data under
// Mojang's licence, so it is never committed) and checks its SHA-256 against the pin in packages/core/src/pins.ts.
// The registry mapping test reads it from there. CI runs this before the tests.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pins = readFileSync(`${root}/packages/core/src/pins.ts`, "utf8");
const pin = (name) => {
  const m = pins.match(new RegExp(`${name}: "([^"]+)"`));
  if (!m) throw new Error(`pin ${name} not found`);
  return m[1];
};
const tag = pin("bedrockSamples");
const sha = pin("mojangBlocksSha256");
const dir = `${root}/.cache/bedrock-samples/${tag}`;
const file = `${dir}/mojang-blocks.json`;
const url = `https://raw.githubusercontent.com/Mojang/bedrock-samples/${tag}/metadata/vanilladata_modules/mojang-blocks.json`;

const hash = (buf) => createHash("sha256").update(buf).digest("hex");
if (existsSync(file) && hash(readFileSync(file)) === sha) {
  console.log(`${file} is present and matches the pin`);
} else {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = hash(buf);
  if (got !== sha) throw new Error(`SHA-256 mismatch for ${url}: got ${got}, pinned ${sha}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, buf);
  console.log(`fetched ${url} (${buf.length} bytes, SHA-256 verified)`);
}
