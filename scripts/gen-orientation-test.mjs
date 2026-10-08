// Generates examples/orientation-test.rsd.json: one of every directional block in every orientation, each standing
// on a wool square coloured by its orientation and labelled with an annotation. Built in game at M3 and compared
// side by side with the viewer from the same angle.
//   node scripts/gen-orientation-test.mjs           write it
//   node scripts/gen-orientation-test.mjs --check   exit 1 if the committed file differs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}/examples/orientation-test.rsd.json`;

const COLOR = {
  north: "red",
  south: "blue",
  east: "yellow",
  west: "lime",
  up: "white",
  down: "black",
  floor: "gray",
  ceiling: "light_gray",
};
const H = ["north", "south", "east", "west"];
const D6 = ["north", "south", "east", "west", "up", "down"];
const W = ["floor", "north", "south", "east", "west"];
const M6 = ["floor", "ceiling", "north", "south", "east", "west"];

/** Rows of the test: a type, and the variants (state strings plus the orientation that colours the wool). */
const ROWS = [
  ["repeater", H.map((f) => [`facing=${f}`, f])],
  ["comparator", H.map((f) => [`facing=${f}`, f])],
  ["torch", W.map((m) => [`mount=${m}`, m])],
  ["lever", M6.map((m) => [`mount=${m}`, m])],
  ["button", M6.map((m) => [`mount=${m}`, m])],
  ["piston", D6.map((f) => [`facing=${f}`, f])],
  ["sticky_piston", D6.map((f) => [`facing=${f}`, f])],
  ["observer", D6.map((f) => [`facing=${f}`, f])],
  ["hopper", ["down", "north", "south", "east", "west"].map((f) => [`facing=${f}`, f])],
  ["dropper", D6.map((f) => [`facing=${f}`, f])],
  ["dispenser", D6.map((f) => [`facing=${f}`, f])],
  [
    "stairs",
    H.flatMap((f) => [
      [`facing=${f} half=bottom`, f],
      [`facing=${f} half=top`, f],
    ]),
  ],
  [
    "door",
    H.flatMap((f) => [
      [`facing=${f} hinge=left`, f],
      [`facing=${f} hinge=right`, f],
      [`facing=${f} hinge=left open=true`, f],
      [`facing=${f} hinge=right open=true`, f],
    ]),
  ],
  [
    "trapdoor",
    H.flatMap((f) => [
      [`facing=${f} open=false`, f],
      [`facing=${f} open=true`, f],
      [`facing=${f} half=top open=false`, f],
      [`facing=${f} half=top open=true`, f],
    ]),
  ],
];

const OFFSET = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], ceiling: [0, 1, 0] };
const SPACING = 3;
const width = Math.max(...ROWS.map(([, v]) => v.length)) * SPACING;
const depth = ROWS.length * SPACING;
const height = 3;
const grid = Array.from({ length: height }, () =>
  Array.from({ length: depth }, () => Array.from({ length: width }, () => ".")),
);
const legend = { "#": "stone" };
const keys = new Map();
const pool = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$%&*+,/:;<=>?@^_|~"];
const keyFor = (spec) => {
  if (!keys.has(spec)) {
    const k = pool.shift();
    if (!k) throw new Error("out of legend keys");
    keys.set(spec, k);
    legend[k] = spec;
  }
  return keys.get(spec);
};
const annotations = [];
const blocks = [];
ROWS.forEach(([type, variants], row) => {
  variants.forEach(([states, orientation], col) => {
    const x = col * SPACING + 1;
    const z = row * SPACING + 1;
    grid[0][z][x] = keyFor(`wool color=${COLOR[orientation]}`);
    // Blocks under test go in `blocks` overrides: 84 variants would overflow the 90-entry legend.
    blocks.push({ pos: [x, 1, z], block: `${type} ${states}` });
    const mount = /mount=(\w+)/.exec(states)?.[1];
    const support = mount && OFFSET[mount];
    if (support) grid[1 + support[1]][z + support[2]][x + support[0]] = "#";
    annotations.push({ pos: [x, 1, z], text: `${type} ${states}` });
  });
});

const design = {
  format: "rsd/1",
  meta: {
    name: "Orientation test",
    description:
      "One of every directional block in every orientation, each on a wool square coloured by orientation: north red, south blue, east yellow, west lime, up white, down black, floor gray, ceiling light gray. Rows run north to south in this order: repeater, comparator, torch, lever, button, piston, sticky piston, observer, hopper, dropper, dispenser, stairs, door (closed and open, both hinges), trapdoor (bottom and top, closed and open). Build it in the test world and compare each block with the viewer from the same angle.",
    edition: "bedrock",
    gameVersion: "1.26.50",
  },
  legend,
  layers: grid.map((layer) => layer.map((row) => row.join(""))),
  blocks,
  annotations,
};
const text = `${JSON.stringify(design, null, 2)}\n`;
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8");
  } catch {
    // a missing file is drift
  }
  if (current !== text) {
    console.error(
      "drift: examples/orientation-test.rsd.json is out of date; run node scripts/gen-orientation-test.mjs",
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(out, text);
  console.log(`wrote examples/orientation-test.rsd.json (${annotations.length} blocks under test)`);
}
