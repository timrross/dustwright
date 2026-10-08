// Compares two .mcstructure files cell by cell: one saved by the game (a structure block's Export, or a structure
// extracted from the world after `/structure save ... disk`, see extract-structure.py) and one written by
// `rsd export --to mcstructure`.
//   node deploy/test-world/compare-structure.mjs <saved-by-game.mcstructure> <exported.mcstructure>
// Compares raw tags (so a byte against an int shows), prints the container fields that differ, and exits 1 on a size
// mismatch or any cell whose block, state names, state values or tag types differ. prismarine-nbt (a dev
// dependency) parses both, independently of the writer the exporter uses.
import { readFileSync } from "node:fs";
import nbt from "prismarine-nbt";

const [savedPath, oursPath] = process.argv.slice(2);
if (!savedPath || !oursPath) {
  console.error("usage: compare-structure.mjs <saved-by-game.mcstructure> <exported.mcstructure>");
  process.exit(2);
}
const load = (path) => nbt.parseUncompressed(readFileSync(path), "little").value;
const saved = load(savedPath);
const ours = load(oursPath);
const plain = (tag) => nbt.simplify(tag);

/** The primary block layer as a flat array of palette indices, whatever container the file uses. */
function primaryLayer(root) {
  const bi = root.structure.value.block_indices;
  // A list of layers, each a list of ints (format 1) or an int array (format 2).
  const first = bi.value.value[0];
  if (Array.isArray(first)) return first;
  if (first && Array.isArray(first.value)) return first.value;
  throw new Error(`unrecognised block_indices layout: ${JSON.stringify(bi).slice(0, 120)}`);
}
function containerShape(root) {
  const bi = root.structure.value.block_indices;
  return `${bi.type}<${bi.value.type}> x ${bi.value.value.length} layer(s)`;
}

const size = { saved: plain(saved.size), ours: plain(ours.size) };
console.log("size", JSON.stringify(size.saved), JSON.stringify(size.ours));
console.log("format_version", plain(saved.format_version), plain(ours.format_version));
console.log("block_indices container", containerShape(saved), "|", containerShape(ours));
const paletteOf = (root) => root.structure.value.palette.value.default.value.block_palette.value.value;
const versions = (root) => [...new Set(paletteOf(root).map((p) => p.version.value))];
console.log("palette versions", versions(saved), versions(ours));
console.log(
  "entities",
  plain(saved.structure.value.entities).length,
  plain(ours.structure.value.entities).length,
);
const bpd = (root) =>
  Object.keys(plain(root.structure.value.palette.value.default.value.block_position_data)).length;
console.log("block_position_data entries (block entities)", bpd(saved), bpd(ours));
if (JSON.stringify(size.saved) !== JSON.stringify(size.ours)) {
  console.log("SIZE MISMATCH");
  process.exit(1);
}

const [, sy, sz] = size.ours;
const a = primaryLayer(saved).map((i) => (i < 0 ? null : paletteOf(saved)[i]));
const b = primaryLayer(ours).map((i) => (i < 0 ? null : paletteOf(ours)[i]));
if (a.length !== b.length) {
  console.log(`CELL COUNT MISMATCH ${a.length} vs ${b.length}`);
  process.exit(1);
}
const kinds = new Map();
const note = (kind, where) => {
  if (!kinds.has(kind)) kinds.set(kind, []);
  kinds.get(kind).push(where);
};
let compared = 0;
for (let i = 0; i < a.length; i++) {
  const where = `[${Math.floor(i / (sy * sz))},${Math.floor(i / sz) % sy},${i % sz}]`;
  const s = a[i];
  const o = b[i];
  const sName = s?.name.value ?? "minecraft:air";
  if (o === null) {
    if (sName !== "minecraft:air") note(`saved has ${sName} where the export is void`, where);
    continue;
  }
  compared++;
  if (sName !== o.name.value) {
    note(`block ${o.name.value} -> ${sName}`, where);
    continue;
  }
  const ss = s.states.value;
  const os = o.states.value;
  for (const k of new Set([...Object.keys(ss), ...Object.keys(os)])) {
    const st = ss[k] ? `${ss[k].type}:${JSON.stringify(ss[k].value)}` : "missing";
    const ot = os[k] ? `${os[k].type}:${JSON.stringify(os[k].value)}` : "missing";
    if (st !== ot) note(`${o.name.value} ${k}: export ${ot}, saved ${st}`, where);
  }
  if (s.version.type !== o.version.type || s.version.value !== o.version.value) {
    note(
      `version: export ${o.version.type}:${o.version.value}, saved ${s.version.type}:${s.version.value}`,
      where,
    );
  }
}
let total = 0;
for (const [kind, where] of kinds) {
  total += where.length;
  console.log(`${where.length} x ${kind}: ${where.slice(0, 6).join(" ")}${where.length > 6 ? " ..." : ""}`);
}
if (compared === 0) {
  console.log("NOTHING COMPARED: the export has no blocks");
  process.exit(1);
}
console.log(
  total === 0
    ? `${compared} blocks identical (name, states, tag types); container fields as listed above`
    : `${total} cell differences`,
);
process.exitCode = total === 0 ? 0 : 1;
