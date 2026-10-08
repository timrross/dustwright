// Game cross-check for the simulator (M6): measures in game, at game-tick resolution, the observer clock's period
// and pulse width, a lone observer's reaction delay and pulse width, and the T flip-flop's toggle sequence and
// latency, and compares each with the simulator. All times are game ticks (a redstone tick is 2).
//   node deploy/test-world/measure-timing.mjs install <pack-dir>     # then restart the server cold
//   node deploy/test-world/measure-timing.mjs run [container] > timing.json
//   node deploy/test-world/measure-timing.mjs uninstall <pack-dir>   # then restart the server cold again
// Remove the probe as soon as the run is done: with its tick function installed, redstone stops ticking in parts of
// the world (observed on BDS 1.26.52.3: a redstone block no longer lit a lamp in most of the ticking area, and it
// did again once the probe was removed), which breaks ingame-check.mjs.
// `install` adds a probe to the pack: `functions/tick.json` runs `dw_probe/tick` every game tick, which records edges
// on a scoreboard. The console alone cannot see single ticks. Needs `pnpm build` and both examples exported into the
// pack (`--clear` too). It checks first that redstone ticks at each build site (not every loaded chunk does).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseText } from "../../packages/core/dist/index.js";
import { BEDROCK_MECHANICS, settle, Simulation } from "../../packages/sim/dist/index.js";
import { parse } from "../../packages/core/dist/index.js";
import {
  answer,
  at,
  block,
  cmd,
  isBlock,
  sleep,
  spec,
  stalled,
  useContainer,
  worldTicks,
} from "./console.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const load = (name) => parseText(readFileSync(`${root}/examples/${name}.rsd.json`, "utf8")).model;
const clock = load("observer-clock");
const tff = load("t-flip-flop");

// Build origins; each function builds one block east of where it runs.
const CLOCK_AT = [34, 20, 40];
const TFF_AT = [44, 20, 40];
const cell = (o, p) => [o[0] + 1 + p[0], o[1] + p[1], o[2] + p[2]];
const port = (m, name) => [...m.ports.inputs, ...m.ports.outputs].find((p) => p.name === name).pos;
const clockOut = cell(CLOCK_AT, port(clock, "tick"));
const tffIn = cell(TFF_AT, port(tff, "T"));
const tffOut = cell(TFF_AT, port(tff, "Q"));
const lever = (on) => spec(block("lever", { ...tff.blocks.get(port(tff, "T").join(",")).states, on }));
// A lone observer watching a lever, with dust behind it: its reaction delay and pulse width, edge by edge.
const RIG = { lever: [61, 21, 40], observer: [62, 21, 40], dust: [63, 21, 40] };
const rigLever = (on) => spec(block("lever", { mount: "floor", on }));
const GAPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function install(pack) {
  const fn = `${pack}/functions/dw_probe`;
  mkdirSync(fn, { recursive: true });
  const lines = (...l) => `${l.join("\n")}\n`;
  writeFileSync(`${pack}/functions/tick.json`, `${JSON.stringify({ values: ["dw_probe/tick"] }, null, 2)}\n`);
  const off = (p) => `${at(p)} minecraft:redstone_wire ["redstone_signal"=0]`;
  writeFileSync(
    `${fn}/tick.mcfunction`,
    lines(
      "# Game-tick probe for deploy/test-world/measure-timing.mjs. Scores live on objective dw.",
      "scoreboard players add t dw 1",
      // Observer clock output: rises and falls.
      `execute if block ${off(clockOut)} run scoreboard players set now dw 0`,
      `execute unless block ${off(clockOut)} run scoreboard players set now dw 1`,
      "execute if score now dw matches 1 if score prev dw matches 0 run function dw_probe/rise",
      "execute if score now dw matches 0 if score prev dw matches 1 run function dw_probe/fall",
      "scoreboard players operation prev dw = now dw",
      // T flip-flop: the tick its lever turns on, and the tick its lamp changes.
      `execute if block ${at(tffIn)} ${lever(true)} run scoreboard players set lev dw 1`,
      `execute if block ${at(tffIn)} ${lever(false)} run scoreboard players set lev dw 0`,
      "execute if score lev dw matches 1 if score levp dw matches 0 run scoreboard players operation press dw = t dw",
      "scoreboard players operation levp dw = lev dw",
      `execute if block ${at(tffOut)} minecraft:lit_redstone_lamp run scoreboard players set q dw 1`,
      `execute if block ${at(tffOut)} minecraft:redstone_lamp run scoreboard players set q dw 0`,
      "execute unless score q dw = qp dw run function dw_probe/qchange",
      "scoreboard players operation qp dw = q dw",
      // Lone observer: the tick its lever changes, and its output's rise and fall.
      `execute if block ${at(RIG.lever)} ${rigLever(true)} run scoreboard players set ol dw 1`,
      `execute if block ${at(RIG.lever)} ${rigLever(false)} run scoreboard players set ol dw 0`,
      "execute unless score ol dw = olp dw run scoreboard players operation ochg dw = t dw",
      "scoreboard players operation olp dw = ol dw",
      `execute if block ${off(RIG.dust)} run scoreboard players set oo dw 0`,
      `execute unless block ${off(RIG.dust)} run scoreboard players set oo dw 1`,
      "execute if score oo dw matches 1 if score oop dw matches 0 run function dw_probe/orise",
      "execute if score oo dw matches 0 if score oop dw matches 1 run function dw_probe/ofall",
      "scoreboard players operation oop dw = oo dw",
    ),
  );
  // Gaps between rises and pulse widths, counted from the third rise on (the first ones may straddle the reset).
  const tally = (v) => [
    ...GAPS.map(
      (g) =>
        `execute if score rises dw matches 3.. if score ${v} dw matches ${g} run scoreboard players add ${v}${g} dw 1`,
    ),
    `execute if score rises dw matches 3.. unless score ${v} dw matches ${GAPS[0]}..${GAPS.at(-1)} run scoreboard players add ${v}x dw 1`,
  ];
  writeFileSync(
    `${fn}/rise.mcfunction`,
    lines(
      "scoreboard players add rises dw 1",
      "scoreboard players operation gap dw = t dw",
      "scoreboard players operation gap dw -= last dw",
      "scoreboard players operation last dw = t dw",
      ...tally("gap"),
    ),
  );
  writeFileSync(
    `${fn}/fall.mcfunction`,
    lines(
      "scoreboard players operation w dw = t dw",
      "scoreboard players operation w dw -= last dw",
      ...tally("w"),
    ),
  );
  writeFileSync(
    `${fn}/qchange.mcfunction`,
    lines("scoreboard players operation lat dw = t dw", "scoreboard players operation lat dw -= press dw"),
  );
  writeFileSync(
    `${fn}/orise.mcfunction`,
    lines(
      "scoreboard players operation odelay dw = t dw",
      "scoreboard players operation odelay dw -= ochg dw",
      "scoreboard players operation orisetick dw = t dw",
    ),
  );
  writeFileSync(
    `${fn}/ofall.mcfunction`,
    lines(
      "scoreboard players operation owidth dw = t dw",
      "scoreboard players operation owidth dw -= orisetick dw",
    ),
  );
  console.error(`probe installed in ${pack}; restart the server cold before "run"`);
}

async function score(name) {
  // The answer is two lines: "Showing 1 tracked objective(s) for <name>:" then "- dw: <value> (dw)".
  const header = new RegExp(`tracked objective\\(s\\) for ${name}:|${name} has no scores`);
  for (let attempt = 0; ; attempt++) {
    try {
      return await answer(`scoreboard players list ${name}`, (after) => {
        const i = after.findIndex((l) => header.test(l));
        if (i < 0) return undefined;
        const m = /- dw: (-?\d+)/.exec(after[i + 1] ?? "");
        if (!m) throw new Error(`no dw score for ${name}: ${after[i]}`);
        return Number(m[1]);
      });
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

async function reset(names) {
  for (const [n, v] of names) await cmd(`scoreboard players set ${n} dw ${v}`, 30);
}

async function histogram(v) {
  const h = {};
  for (const g of GAPS) {
    const n = await score(`${v}${g}`);
    if (n > 0) h[g] = n;
  }
  const other = await score(`${v}x`);
  if (other > 0) h.other = other;
  return h;
}

/** Rising edges and pulse widths of a 0/1 series, in game ticks. */
function edges(series) {
  const rises = series.flatMap((v, i) => (v === 1 && series[i - 1] === 0 ? [i] : []));
  const gaps = rises.slice(1).map((r, i) => r - rises[i]);
  const widths = rises.map((r) => {
    let w = 0;
    while (series[r + w] === 1) w++;
    return w;
  });
  return { gaps, widths };
}

/** The simulator's view of the same measurements, in game ticks. */
function simulated() {
  const sim = new Simulation(clock, BEDROCK_MECHANICS);
  const series = [];
  for (let i = 0; i < 400; i++) {
    sim.step();
    series.push(sim.readOutput(port(clock, "tick")) > 0 ? 1 : 0);
  }
  const clockEdges = edges(series);
  const rig = parse({
    format: "rsd/1",
    meta: { name: "Observer rig" },
    legend: { "#": "stone", L: "lever mount=floor", o: "observer facing=west", "-": "dust" },
    layers: [["###"], ["Lo-"]],
  }).model;
  const r = settle(rig, BEDROCK_MECHANICS);
  r.setInput([0, 1, 0], 1);
  const rigSeries = [];
  for (let i = 0; i < 20; i++) {
    rigSeries.push(r.readOutput([2, 1, 0]) > 0 ? 1 : 0);
    r.step();
  }
  const rigEdges = edges(rigSeries);
  const t = settle(tff, BEDROCK_MECHANICS);
  const sequence = [];
  const latencies = [];
  for (let press = 0; press < 4; press++) {
    const before = t.readOutput(port(tff, "Q"));
    t.setInput(port(tff, "T"), 1);
    let latency = null;
    for (let i = 1; i <= 30; i++) {
      t.step();
      if (latency === null && t.readOutput(port(tff, "Q")) !== before) latency = i;
    }
    sequence.push(t.readOutput(port(tff, "Q")));
    latencies.push(latency);
    t.setInput(port(tff, "T"), 0);
    for (let i = 0; i < 30; i++) t.step();
  }
  return {
    clockGaps: [...new Set(clockEdges.gaps.slice(2))],
    clockWidths: [...new Set(clockEdges.widths.slice(2))],
    observerDelay: rigSeries.indexOf(1),
    observerWidth: rigEdges.widths[0],
    tffSequence: sequence,
    tffLatency: latencies,
  };
}

/** Whether redstone ticks at `p`: a redstone block must light a lamp there. Not every loaded chunk ticks. */
async function siteTicks(p) {
  await cmd(`setblock ${at(p)} minecraft:redstone_lamp`);
  await cmd(`setblock ${at([p[0] + 1, p[1], p[2]])} minecraft:redstone_block`, 500);
  const lit = await isBlock(p, "minecraft:lit_redstone_lamp").catch(() => false);
  await cmd(`fill ${at(p)} ${at([p[0] + 1, p[1], p[2]])} minecraft:air`);
  return lit;
}

async function run(container) {
  useContainer(container);
  if (!(await worldTicks(true))) stalled("before measuring");
  for (const site of [CLOCK_AT, TFF_AT, RIG.lever].map((p) => [p[0], p[1] + 6, p[2]])) {
    if (!(await siteTicks(site))) {
      console.error(`redstone does not tick at ${at(site)}: move the build sites into the ticking area`);
      process.exit(2);
    }
  }
  await cmd("scoreboard objectives remove dw");
  await cmd("scoreboard objectives add dw dummy");
  for (const [o, slug] of [
    [CLOCK_AT, "observer-clock"],
    [TFF_AT, "t-flip-flop"],
  ]) {
    await cmd(`execute positioned ${at(o)} run function rsd/${slug}_clear`);
    await cmd(`execute positioned ${at(o)} run function rsd/${slug}`, 1500);
  }
  // Start the clock: a freshly built observer pair may or may not see each other placed, so re-place one.
  const east = cell(CLOCK_AT, [1, 1, 0]);
  await cmd(`setblock ${at(east)} minecraft:stone`);
  await cmd(`setblock ${at(east)} ${spec(block("observer", { facing: "east" }))}`, 1000);
  // Observer clock: tally the gaps between rises and the pulse widths for 10 seconds (200 game ticks).
  await reset([
    ["rises", 0],
    ...["gap", "w"].flatMap((v) => [...GAPS.map((g) => [`${v}${g}`, 0]), [`${v}x`, 0]]),
  ]);
  await sleep(10_000);
  const clockGame = {
    rises: await score("rises"),
    gaps: await histogram("gap"),
    widths: await histogram("w"),
  };
  // A lone observer: flip the lever it watches eight times, 1 s apart.
  await cmd(`fill ${at([60, 20, 40])} ${at([64, 20, 40])} minecraft:stone`);
  await cmd(`fill ${at([60, 21, 40])} ${at([64, 21, 40])} minecraft:air`);
  await cmd(`setblock ${at(RIG.observer)} ${spec(block("observer", { facing: "west" }))}`);
  await cmd(`setblock ${at(RIG.dust)} ${spec(block("dust", {}))}`);
  await cmd(`setblock ${at(RIG.lever)} ${rigLever(false)}`, 1000);
  const observer = [];
  for (let i = 0; i < 8; i++) {
    await reset([
      ["odelay", -1],
      ["owidth", -1],
    ]);
    await cmd(`setblock ${at(RIG.lever)} ${rigLever(i % 2 === 0)}`, 1000);
    observer.push({ delay: await score("odelay"), width: await score("owidth") });
  }
  // T flip-flop: four presses, each held 1.5 s, then released for 1.5 s.
  const sequence = [];
  const latencies = [];
  for (let press = 0; press < 4; press++) {
    await reset([["lat", -1]]);
    await cmd(`setblock ${at(tffIn)} ${lever(true)}`, 1500);
    sequence.push(await score("q"));
    latencies.push(await score("lat"));
    await cmd(`setblock ${at(tffIn)} ${lever(false)}`, 1500);
  }
  if (!(await worldTicks(false))) stalled("after measuring");
  const sim = simulated();
  const keys = (h) =>
    Object.keys(h)
      .filter((k) => k !== "other")
      .map(Number);
  // Console commands land at an arbitrary point of a tick, so an input set from the console is seen up to two game
  // ticks late or early; the clock and the pulse widths are internal to the game and have no such slack.
  const SLACK = 2;
  const checks = [
    [
      `observer clock period: game ${JSON.stringify(clockGame.gaps)}, simulator ${sim.clockGaps}`,
      clockGame.rises > 10 &&
        !clockGame.gaps.other &&
        JSON.stringify(keys(clockGame.gaps)) === JSON.stringify(sim.clockGaps),
    ],
    [
      `observer clock pulse width: game ${JSON.stringify(clockGame.widths)}, simulator ${sim.clockWidths}`,
      !clockGame.widths.other && JSON.stringify(keys(clockGame.widths)) === JSON.stringify(sim.clockWidths),
    ],
    [
      `lone observer pulse width: game ${observer.map((o) => o.width)}, simulator ${sim.observerWidth}`,
      observer.every((o) => o.width === sim.observerWidth),
    ],
    [
      `lone observer delay from a console-set lever: game ${observer.map((o) => o.delay)}, simulator ${sim.observerDelay} (slack ${SLACK})`,
      observer.every((o) => o.delay >= 0 && Math.abs(o.delay - sim.observerDelay) <= SLACK),
    ],
    [
      `T flip-flop toggles: game ${sequence}, simulator ${sim.tffSequence}`,
      JSON.stringify(sequence) === JSON.stringify(sim.tffSequence),
    ],
    [
      `T flip-flop latency from a console-set lever: game ${latencies}, simulator ${sim.tffLatency} (slack ${SLACK})`,
      latencies.every((l, i) => l >= 0 && Math.abs(l - (sim.tffLatency[i] ?? -99)) <= SLACK),
    ],
  ];
  for (const [name, ok] of checks) console.error(`${ok ? "MATCH" : "DIFF "}  ${name}`);
  console.log(
    JSON.stringify(
      {
        when: new Date().toISOString(),
        container,
        tool: "deploy/test-world/measure-timing.mjs",
        unit: "game ticks (a redstone tick is 2)",
        game: { clock: clockGame, observer, tffSequence: sequence, tffLatency: latencies },
        simulator: sim,
        checks: Object.fromEntries(checks),
      },
      null,
      2,
    ),
  );
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
}

function uninstall(pack) {
  rmSync(`${pack}/functions/tick.json`, { force: true });
  rmSync(`${pack}/functions/dw_probe`, { recursive: true, force: true });
  console.error(`probe removed from ${pack}; restart the server cold`);
}

const [mode, arg] = process.argv.slice(2);
if (mode === "install" && arg) install(arg);
else if (mode === "uninstall" && arg) uninstall(arg);
else if (mode === "run") await run(arg ?? "dustwright-test");
else {
  console.error("usage: measure-timing.mjs install <pack-dir> | run [container] | uninstall <pack-dir>");
  process.exitCode = 2;
}
