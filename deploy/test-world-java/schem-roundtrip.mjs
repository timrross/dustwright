// Round-trips a design through Sponge .schem into a Java world (the Paper test server, with WorldEdit):
//   node deploy/test-world-java/schem-roundtrip.mjs [design.rsd.json] [container]
// 1. exports the design as .schem (as a Java design) and copies it into WorldEdit's schematics folder;
// 2. WorldEdit loads it and pastes it at its own origin, (0, 0, 0), in an emptied area, with no block updates;
// 3. every block is checked in the world by ID and full state (`execute if block`);
// 4. WorldEdit copies the area and saves it as a new .schem, which is decoded and compared block by block with ours.
// Prints one JSON line with the results. The design defaults to the orientation test.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parse } from "../../packages/core/dist/index.js";
import { encodeSchem, javaCells, javaStateString } from "../../packages/export/dist/index.js";
import { at, isBlock, run, sleep, useContainer } from "./rcon.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const file = process.argv[2] ?? `${root}/examples/orientation-test.rsd.json`;
const container = process.argv[3] ?? "dustwright-test-paper";
useContainer(container);

const raw = JSON.parse(readFileSync(file, "utf8"));
raw.meta.edition = "java";
delete raw.meta.gameVersion;
const model = parse(raw).model;
if (!model) throw new Error(`${file} does not parse`);
const dir = mkdtempSync(join(tmpdir(), "dw-schem-"));
const ours = join(dir, "dw-rt-src.schem");
writeFileSync(ours, await encodeSchem(model));
const folder = "/data/plugins/WorldEdit/schematics";
execFileSync("docker", ["exec", container, "mkdir", "-p", folder]);
execFileSync("docker", ["cp", ours, `${container}:${folder}/dw-rt-src.schem`]);

const cells = javaCells(model);
const size = [0, 1, 2].map((i) => Math.max(model.size[i], ...cells.map((c) => c.pos[i] + 1)));
const last = size.map((n) => n - 1);
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const say = (c) => run(c).replace(ANSI, "").trim();
const results = [];

say("forceload add 0 0 79 63");
say("//world world");
// Place exactly what the file says: no neighbour or block updates (a NOT gate's lamp would light, which is the
// circuit working, not the file). The patterns' behaviour is checked on the Fabric server, not here.
say("//perf neighbors off");
say("//perf update off");
say(`fill 0 0 0 ${at(last.map((n) => n + 1))} minecraft:air`);
const loaded = say("/schem load dw-rt-src.schem");
const pasted = say("//paste -o");
await sleep(1000);
results.push({ step: "load and paste", detail: `${loaded} ${pasted}`.replace(/\s+/g, " ") });

const wrong = [];
for (const c of cells) {
  if (!(await isBlock(c.pos, javaStateString(c.id, c.states))))
    wrong.push(`${c.pos.join(",")} ${javaStateString(c.id, c.states)}`);
}
results.push({
  step: "every block in the world by ID and state",
  pass: wrong.length === 0,
  checked: cells.length,
  wrong: wrong.slice(0, 10),
});

say(`//pos1 0,0,0`);
say(`//pos2 ${last.join(",")}`);
say("//copy");
say("/schem save dw-rt-back -f");
await sleep(500);
const back = join(dir, "dw-rt-back.schem");
execFileSync("docker", ["cp", `${container}:${folder}/dw-rt-back.schem`, back]);

/** Decodes a v3 schem into a map of "x,y,z" -> normalised state string (air left out). */
async function blocksOf(path) {
  // prismarine-nbt: a reader independent of the writer our exporter uses.
  const nbt = (await import("prismarine-nbt")).default.simplify(
    (await import("prismarine-nbt")).default.parseUncompressed(gunzipSync(readFileSync(path)), "big"),
  );
  const s = nbt.Schematic ?? nbt;
  const w = Number(s.Width),
    l = Number(s.Length);
  const byIndex = new Map(Object.entries(s.Blocks.Palette).map(([k, v]) => [Number(v), normalise(k)]));
  const bytes = [...s.Blocks.Data].map((b) => b & 0xff);
  const out = new Map();
  let i = 0;
  for (let n = 0; i < bytes.length; n++) {
    let v = 0,
      shift = 0,
      b;
    do {
      b = bytes[i++];
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b >= 0x80);
    const state = byIndex.get(v);
    if (state !== "minecraft:air")
      out.set(`${n % w},${Math.floor(n / (w * l))},${Math.floor(n / w) % l}`, state);
  }
  return { out, version: Number(s.Version), dataVersion: Number(s.DataVersion) };
}
function normalise(s) {
  const m = s.match(/^([^[]+)(?:\[(.*)\])?$/);
  const props = (m[2] ?? "").split(",").filter(Boolean).sort();
  return props.length ? `${m[1]}[${props.join(",")}]` : m[1];
}
const a = await blocksOf(ours);
const b = await blocksOf(back);
const diff = [];
for (const k of new Set([...a.out.keys(), ...b.out.keys()])) {
  if (a.out.get(k) !== b.out.get(k)) diff.push(`${k}: ours ${a.out.get(k)}, WorldEdit's ${b.out.get(k)}`);
}
results.push({
  step: "WorldEdit's saved copy equals our export, block by block",
  pass: diff.length === 0,
  ours: a.out.size,
  theirs: b.out.size,
  theirVersion: b.version,
  theirDataVersion: b.dataVersion,
  diff: diff.slice(0, 10),
});
const pass = results.every((r) => r.pass !== false);
console.log(
  JSON.stringify({
    when: new Date().toISOString(),
    container,
    design: file.replace(root, ""),
    pass,
    results,
  }),
);
process.exitCode = pass ? 0 : 1;
