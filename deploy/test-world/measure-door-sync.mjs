// Game cross-check for the Jeb door: measures in game, at game-tick resolution, the tick at which each of the four
// door blocks leaves the outer wall when the door opens and the tick it is back when it closes, and reports how far
// apart they are and how long the blocks were away. A plate input has a pig held on it for 3.5 s; a button input is
// pressed once through the console (set pressed, set released a second later). The upper and lower rows are driven through different paths (a tower of three torches against
// one torch), so they move together only if the delays before them match. All times are game ticks.
//   node deploy/test-world/measure-door-sync.mjs install <pack-dir>      # then restart the server cold
//   node deploy/test-world/measure-door-sync.mjs run [container] [slug[=design-file]...] > sync.json
//   node deploy/test-world/measure-door-sync.mjs uninstall <pack-dir>    # then restart the server cold again
// `install` adds a probe to the pack: `functions/tick.json` runs `dw_door/tick` every game tick, which records on a
// scoreboard the tick each door cell was last left and the tick it was last filled again. The console alone cannot see single ticks. Remove the
// probe as soon as the run is done (see measure-timing.mjs: a tick function can stop redstone in parts of the
// world). Needs `pnpm build` and each slug exported into the pack (`--clear` too); slugs default to `jeb-door`. Any
// other slug must be a design with the same door cells and inputs named `outside` and `inside`, such as an earlier
// version to compare with; give its file after `=` (the example's is the default).
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { attachedFace, DIRS, parseText } from "../../packages/core/dist/index.js";
import {
  add,
  answer,
  at,
  block,
  cmd,
  isBlock,
  send,
  sleep,
  spec,
  useContainer,
  worldTicks,
} from "./console.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const load = (file) => parseText(readFileSync(file, "utf8")).model;

// Build origin; the function builds one block east of where it runs. DOOR_AT=x,y,z moves it (for install and run
// alike), to measure the door across a chunk border, say.
const DOOR_AT = (process.env.DOOR_AT ?? "34,20,40").split(",").map(Number);
const cell = (p) => [DOOR_AT[0] + 1 + p[0], DOOR_AT[1] + p[1], DOOR_AT[2] + p[2]];
/** The four door blocks' places in the outer wall: lower and upper, west and east. */
const CELLS = {
  "lower west": [5, 3, 1],
  "upper west": [5, 4, 1],
  "lower east": [6, 3, 1],
  "upper east": [6, 4, 1],
};
const NAMES = Object.keys(CELLS);
const RUNS = 3;

function install(pack) {
  const fn = `${pack}/functions/dw_door`;
  mkdirSync(fn, { recursive: true });
  writeFileSync(`${pack}/functions/tick.json`, `${JSON.stringify({ values: ["dw_door/tick"] }, null, 2)}\n`);
  const lines = [
    "# Game-tick probe for deploy/test-world/measure-door-sync.mjs. Scores live on objective dw.",
    "scoreboard players add t dw 1",
  ];
  Object.values(CELLS).forEach((p, i) => {
    lines.push(
      `execute if block ${at(cell(p))} minecraft:stone run scoreboard players set c${i} dw 1`,
      `execute unless block ${at(cell(p))} minecraft:stone run scoreboard players set c${i} dw 0`,
      `execute if score c${i} dw matches 0 if score p${i} dw matches 1 run scoreboard players operation o${i} dw = t dw`,
      `execute if score c${i} dw matches 1 if score p${i} dw matches 0 run scoreboard players operation r${i} dw = t dw`,
      `scoreboard players operation p${i} dw = c${i} dw`,
    );
  });
  writeFileSync(`${fn}/tick.mcfunction`, `${lines.join("\n")}\n`);
  console.log(`installed the door probe in ${pack}; restart the server cold`);
}

function uninstall(pack) {
  rmSync(`${pack}/functions/dw_door`, { recursive: true, force: true });
  rmSync(`${pack}/functions/tick.json`, { force: true });
  console.log(`removed the door probe from ${pack}; restart the server cold`);
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

/** For scores `o` (left) or `r` (returned): each cell's tick relative to the earliest, and their spread; -1 if a cell did not change. */
async function changes(kind) {
  const at4 = [];
  for (let i = 0; i < NAMES.length; i++) at4.push(await score(`${kind}${i}`));
  const moved = at4.filter((v) => v > 0);
  const first = Math.min(...moved);
  return {
    ticks: at4,
    behind: Object.fromEntries(NAMES.map((n, i) => [n, at4[i] > 0 ? at4[i] - first : -1])),
    spread: moved.length === NAMES.length ? Math.max(...moved) - first : -1,
  };
}
const arm = async () => {
  for (let i = 0; i < NAMES.length; i++) {
    await cmd(`scoreboard players set o${i} dw 0`, 30);
    await cmd(`scoreboard players set r${i} dw 0`, 30);
  }
};
/**
 * Presses a button from the console: set pressed and, a second later, released. Each change goes through air, and
 * the block the button hangs on is swapped to another block and back, because a setblock updates neither (see
 * driveInput in ingame-check.mjs).
 */
async function press(model, port) {
  const b = model.blocks.get(port.pos.join(","));
  const support = add(port.pos, DIRS[attachedFace(b)]);
  const put = async (pressed) => {
    send(`setblock ${at(cell(port.pos))} air`);
    send(`setblock ${at(cell(port.pos))} ${spec(block(b.type, { ...b.states, pressed }))}`);
    send(`setblock ${at(cell(support))} minecraft:cobblestone`);
    await sleep(150);
    send(`setblock ${at(cell(support))} minecraft:stone`);
  };
  await put(true);
  await sleep(850);
  await put(false);
}
const closed = async () => {
  for (const p of Object.values(CELLS)) if (!(await isBlock(cell(p), "minecraft:stone"))) return false;
  return true;
};

async function run(container, slugs) {
  useContainer(container);
  // The same ticking area as ingame-check.mjs: with no player on the server, nothing else keeps the site loaded.
  await cmd("tickingarea add 0 0 0 79 0 63 dustwright-check");
  if (!(await worldTicks(true))) throw new Error("the world does not tick; start the server cold");
  await cmd("scoreboard objectives remove dw");
  await cmd("scoreboard objectives add dw dummy");
  const t0 = await score("t").catch(() => -1);
  await sleep(500);
  if (!((await score("t").catch(() => -1)) > t0))
    throw new Error("the probe is not running: install it first");
  const results = [];
  const designs = slugs.map((s) => s.split("="));
  slugs = designs.map(([slug]) => slug);
  for (const [slug, file] of designs) {
    const model = load(file ?? `${root}/examples/jeb-door.rsd.json`);
    for (const s of slugs) await cmd(`execute positioned ${at(DOOR_AT)} run function rsd/${s}_clear`);
    await cmd(`execute positioned ${at(DOOR_AT)} run function rsd/${slug}`, 5000);
    if (!(await closed())) throw new Error(`${slug}: the door did not close itself after building`);
    for (const plate of ["outside", "inside"]) {
      const port = model.ports.inputs.find((i) => i.name === plate);
      const button = model.blocks.get(port.pos.join(","))?.type === "button";
      const p = cell(port.pos);
      for (let n = 0; n < RUNS; n++) {
        await arm();
        if (button) {
          await press(model, port);
          await sleep(5000);
        } else {
          await cmd(`summon pig ${p[0] + 0.5} ${p[1]} ${p[2] + 0.5}`, 0);
          await cmd("effect @e[type=pig] slowness 60 255 true", 0);
          await sleep(3500);
          await cmd("kill @e[type=pig]", 0);
          await sleep(4500);
        }
        const opening = await changes("o");
        const closing = await changes("r");
        await cmd("kill @e[type=item]", 0);
        const away = closing.ticks[0] - opening.ticks[0];
        results.push({
          slug,
          input: plate,
          kind: button ? "button" : "plate",
          run: n + 1,
          opening,
          closing,
          away,
        });
        console.error(
          `${slug}  ${plate} ${button ? "button" : "plate"}, run ${n + 1}: opening spread ${opening.spread} gt ${JSON.stringify(opening.behind)}; closing spread ${closing.spread} gt; away ${away} gt`,
        );
        if (!(await closed())) throw new Error(`${slug}: the door did not close again`);
      }
    }
    await cmd(`execute positioned ${at(DOOR_AT)} run function rsd/${slug}_clear`);
  }
  const ticking = await worldTicks(false);
  console.log(
    JSON.stringify(
      { when: new Date().toISOString(), container, unit: "game ticks", ticking, results },
      null,
      2,
    ),
  );
  if (!ticking) process.exitCode = 2;
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "install" && rest[0]) install(rest[0]);
else if (mode === "uninstall" && rest[0]) uninstall(rest[0]);
else if (mode === "run")
  await run(rest[0] ?? "dustwright-test", rest.length > 1 ? rest.slice(1) : ["jeb-door"]);
else {
  console.error(
    "usage: measure-door-sync.mjs install <pack-dir> | run [container] [slug...] | uninstall <pack-dir>",
  );
  process.exitCode = 2;
}
