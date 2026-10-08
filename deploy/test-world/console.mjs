// Console helpers for checks against a test-world container: send commands, read their answers from the server log,
// and query blocks. Every query fails (NoAnswer) when the server neither confirms nor denies.
import { execFileSync } from "node:child_process";
import { registryEntry, toEditionBlocks } from "../../packages/core/dist/index.js";
import { formatStates } from "../../packages/export/dist/index.js";

const state = { container: "dustwright-test" };
/** Selects the container every helper talks to. */
export function useContainer(name) {
  state.container = name;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The last 400 non-empty lines of the server log (each starts with a millisecond timestamp). */
export const logLines = () =>
  execFileSync("docker", ["logs", "--tail", "400", state.container], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  })
    .split("\n")
    .filter((l) => l.trim() !== "");
export const send = (command) =>
  execFileSync("docker", ["exec", state.container, "send-command", command], { stdio: "ignore" });

/** A query the server never answered, or answered with an error. */
export class NoAnswer extends Error {}

/** Sends a command that needs no answer, then waits for the game to act on it. */
export async function cmd(command, settleMs = 120) {
  send(command);
  await sleep(settleMs);
}

/** Sends a query and returns the first new log line `match` recognises; throws NoAnswer after 3 seconds. */
export async function query(command, match) {
  const lines = await answer(command, (after) => after.find((l) => match.test(l)));
  return lines;
}

/**
 * Sends a command and waits until `pick` finds its answer among the log lines logged after it; throws NoAnswer
 * after 3 seconds. The anchor is the last timestamped line before the command (timestamps are unique to the
 * millisecond; continuation lines such as "- dw: 0 (dw)" repeat and would anchor on a later answer).
 */
export async function answer(command, pick) {
  const stamped = (l) => /^\[\d{4}-\d\d-\d\d /.test(l);
  const before = logLines().filter(stamped);
  const anchor = before[before.length - 1];
  send(command);
  for (let i = 0; i < 40; i++) {
    await sleep(75);
    const lines = logLines();
    const from = anchor === undefined ? 0 : lines.lastIndexOf(anchor) + 1;
    const found = pick(lines.slice(from));
    if (found !== undefined) return found;
  }
  throw new NoAnswer(`no answer to: ${command}`);
}

export const at = (p) => p.join(" ");

/** Whether the block at `p` is `id` (states optional). Throws NoAnswer when the game neither confirms nor denies. */
export async function isBlock(p, id) {
  const coords = p.join(",");
  const line = await query(
    `testforblock ${at(p)} ${id}`,
    new RegExp(
      `(Successfully found the block at|The block at) ${coords}\\b|Cannot test|is invalid|[Ss]yntax error`,
    ),
  );
  if (/Successfully found/.test(line)) return true;
  if (new RegExp(`The block at ${coords}\\b`).test(line)) return false;
  throw new NoAnswer(`testforblock ${at(p)} ${id}: ${line}`);
}

/** Whether any item entity exists (something popped off). Throws NoAnswer when the game does not say. */
export async function itemsExist() {
  return /Found /.test(await query("testfor @e[type=item]", /Found |No targets matched/));
}

/**
 * Counts the glass blocks in a region by turning them into tinted glass (the server reports how many it changed).
 * Throws NoAnswer when the game does not say.
 */
export async function countGlass(a, b) {
  const line = await query(
    `fill ${at(a)} ${at(b)} minecraft:tinted_glass replace minecraft:glass`,
    /\d+ blocks filled|outside|Unable/,
  );
  const n = /(\d+) blocks filled/.exec(line);
  if (!n) throw new NoAnswer(`fill count: ${line}`);
  return Number(n[1]);
}

/** Cells (relative "x,y,z") a design fills, its blocks' extra cells (a door's upper half) included. */
export function filledCells(model) {
  const cells = new Set();
  for (const [key, b] of model.blocks) {
    const [x, y, z] = key.split(",").map(Number);
    for (const e of toEditionBlocks(b, "bedrock"))
      cells.add(`${x + e.offset[0]},${y + e.offset[1]},${z + e.offset[2]}`);
  }
  return cells;
}

/** A Bedrock block for an abstract type, with registry defaults for any state not given. */
export const block = (type, states) => {
  const defaults = Object.fromEntries(
    Object.entries(registryEntry(type).states).map(([k, d]) => [k, d.default]),
  );
  return toEditionBlocks({ type, states: { ...defaults, ...states } }, "bedrock")[0];
};
export const spec = (b) => `${b.id}${formatStates(b.states)}`;
export const OFF = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};
export const add = (p, d, k = 1) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];

/**
 * Readiness: a server can accept commands while its chunks do not tick (after a warm restart, or mid-run), and then
 * no circuit reacts. Checks that a redstone block lights a canary lamp; `wait` retries for up to a minute.
 */
export async function worldTicks(wait) {
  const lamp = [78, 2, 62];
  for (let attempt = 0; attempt < (wait ? 30 : 2); attempt++) {
    await cmd(`setblock ${at(lamp)} minecraft:redstone_lamp`);
    await cmd(`setblock ${at(add(lamp, OFF.west))} minecraft:air`);
    await cmd(`setblock ${at(add(lamp, OFF.west))} minecraft:redstone_block`, 600);
    const lit = await isBlock(lamp, "minecraft:lit_redstone_lamp").catch(() => false);
    await cmd(`fill ${at(add(lamp, OFF.west))} ${at(lamp)} minecraft:air`);
    if (lit) return true;
    await sleep(1400);
  }
  return false;
}
export const stalled = (when) => {
  console.error(
    `the world stopped ticking (${when}): this run is invalid. Stop and start the server (a cold start, not a restart) and run again.`,
  );
  process.exit(2);
};
