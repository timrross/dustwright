// RCON helpers for checks against the Java test world (deploy/test-world-java). Each command runs through rcon-cli
// inside the container and returns the server's answer directly. A query that gets neither a yes nor a no throws.
import { execFileSync } from "node:child_process";
import { registryEntry, toEditionBlocks } from "../../packages/core/dist/index.js";

const state = { container: "dustwright-test-java" };
/** Selects the container every helper talks to. */
export function useContainer(name) {
  state.container = name;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs one command and returns the server's answer (trimmed). */
export function run(command) {
  return execFileSync("docker", ["exec", state.container, "rcon-cli", command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Sends a command that needs no answer, then waits for the game to act on it. */
export async function cmd(command, settleMs = 60) {
  const out = run(command);
  // A syntax error or an unloaded position is a failure; "Could not set the block" (already that block) is not.
  if (/Unknown or incomplete|Incorrect argument|Expected |Invalid |not loaded/i.test(out)) {
    throw new Error(`${command}: ${out}`);
  }
  await sleep(settleMs);
  return out;
}

/** A query the server answered with neither a yes nor a no. */
export class NoAnswer extends Error {}

export const at = (p) => p.join(" ");
export const add = (p, d, k = 1) => [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k];
export const OFF = {
  up: [0, 1, 0],
  down: [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
};

/** A Java block for an abstract type, with registry defaults for any state not given (the first block of a door). */
export const block = (type, states = {}) => blocks(type, states)[0];
/** Every Java block an abstract block becomes (a door is two). */
export const blocks = (type, states = {}) => {
  const defaults = Object.fromEntries(
    Object.entries(registryEntry(type).states).map(([k, d]) => [k, d.default]),
  );
  return toEditionBlocks({ type, states: { ...defaults, ...states } }, "java");
};
/** A Java block spec: `minecraft:repeater[delay=1,facing=west]`. */
export const spec = (b) => {
  const s = Object.entries(b.states).map(([k, v]) => `${k}=${String(v)}`);
  return s.length ? `${b.id}[${s.join(",")}]` : b.id;
};

/** Whether the block at `p` matches `predicate` (an ID, with states optional). */
export async function isBlock(p, predicate) {
  // An empty or garbled reply (seen once while another RCON client was busy) is asked again before it fails.
  let out = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    out = run(`execute if block ${at(p)} ${predicate}`);
    if (/^Test passed/.test(out)) return true;
    if (/^Test failed/.test(out)) return false;
    await sleep(200);
  }
  throw new NoAnswer(`execute if block ${at(p)} ${predicate}: ${out}`);
}

/** Force-loads the 80 x 64 check area at the origin: with nobody online, Java ticks only force-loaded chunks. */
export const forceloadCheckArea = () => cmd("forceload add 0 0 79 63");

/** The y of the flat world's surface: builds start here. */
export const FLOOR = -60;
