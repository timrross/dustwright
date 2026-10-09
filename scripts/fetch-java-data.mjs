// Builds the pinned Java Edition block report into .cache/ (gitignored: it is generated from Mojang's server jar, under
// Mojang's licence, so it is never committed). Downloads the pinned server jar (SHA-1 from Mojang's manifest), runs
// its data generator (`--reports`) in a Java 25 container, and checks the resulting blocks.json against the SHA-256
// pinned in packages/core/src/pins.ts. The Java registry mapping test reads it from there.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pins = readFileSync(`${root}/packages/core/src/pins.ts`, "utf8");
const pin = (name) => {
  const m = pins.match(new RegExp(`${name}: "([^"]+)"`));
  if (!m) throw new Error(`pin ${name} not found`);
  return m[1];
};
const version = pin("javaVersion");
const jarSha1 = pin("javaServerJarSha1");
const blocksSha = pin("javaBlocksSha256");
const dir = `${root}/.cache/java/${version}`;
const jar = `${dir}/server.jar`;
const file = `${dir}/blocks.json`;
const digest = (alg, buf) => createHash(alg).update(buf).digest("hex");

/** The data version the exporters write (PINS.javaDataVersion) must be the jar's own. */
async function checkDataVersion() {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(readFileSync(jar), { filter: (f) => f.name === "version.json" });
  const worldVersion = JSON.parse(strFromU8(files["version.json"])).world_version;
  const pinned = Number(pins.match(/javaDataVersion: (\d+)/)?.[1]);
  if (worldVersion !== pinned)
    throw new Error(`the jar's data version is ${worldVersion}, the pin is ${pinned}`);
}

if (existsSync(file) && digest("sha256", readFileSync(file)) === blocksSha) {
  if (existsSync(jar)) await checkDataVersion();
  console.log(`${file} is present and matches the pin`);
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
if (!existsSync(jar) || digest("sha1", readFileSync(jar)) !== jarSha1) {
  const url = `https://piston-data.mojang.com/v1/objects/${jarSha1}/server.jar`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (digest("sha1", buf) !== jarSha1) throw new Error(`SHA-1 mismatch for ${url}`);
  writeFileSync(jar, buf);
  console.log(`fetched ${url} (${buf.length} bytes, SHA-1 verified)`);
}
await checkDataVersion();
// The generator writes into the working directory; run it on a copy in a scratch directory inside the cache.
const work = `${dir}/generate`;
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
copyFileSync(jar, `${work}/server.jar`);
execFileSync(
  "docker",
  [
    "run",
    "--rm",
    "-v",
    `${work}:/work`,
    "-w",
    "/work",
    "eclipse-temurin:25-jre",
    "java",
    "-DbundlerMainClass=net.minecraft.data.Main",
    "-jar",
    "server.jar",
    "--reports",
    "--output",
    "/work/out",
  ],
  { stdio: ["ignore", "ignore", "inherit"] },
);
const report = readFileSync(`${work}/out/reports/blocks.json`);
const got = digest("sha256", report);
rmSync(work, { recursive: true, force: true });
if (got !== blocksSha) throw new Error(`blocks.json SHA-256 is ${got}, pinned ${blocksSha}`);
writeFileSync(file, report);
console.log(`generated ${file} (${report.length} bytes, SHA-256 verified)`);
