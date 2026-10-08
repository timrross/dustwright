import { diag, LIMITS } from "@dustwright/core";
import type { Diagnostic, Model, Pos, SimMechanics, TestCase } from "@dustwright/core";
import { BEDROCK_MECHANICS } from "./mechanics.js";
import { Simulation } from "./simulation.js";

/** Settling stops when the design is stable, or after this many redstone ticks (a clock never settles). */
export const SETTLE_TICKS = 64;
/** Game ticks per redstone tick. */
export const GAME_TICKS_PER_REDSTONE_TICK = 2;

/**
 * Cell updates the simulator may spend on one design's tests, all cases together. Counting work instead of time
 * keeps the result deterministic; a design too big to simulate that long reports T002 instead of hanging.
 */
export const WORK_BUDGET = 40_000_000;

/** The outcome of one test case. */
export interface CaseResult {
  status: "pass" | "fail" | "skipped" | "budget";
  /** The value read from every output the case expects (empty when the case did not run to the end). */
  actual: Record<string, number>;
  /** Game ticks spent settling before `set` was applied. */
  settleTicks: number;
  /** Cell updates the case used, charged against the design's budget. */
  work: number;
  /** Why the case was skipped or ran out of budget. */
  reason?: string;
}

/** Options for a test run. */
export interface RunOptions {
  mechanics?: SimMechanics;
  /** The work budget left for this case (cell updates). */
  budget?: number;
}

const portPos = (model: Model, name: string): Pos | undefined =>
  [...model.ports.inputs, ...model.ports.outputs].find((p) => p.name === name)?.pos;

/** Starts a run of the design: places it in its authored state and settles it. */
export function settle(model: Model, mechanics: SimMechanics = BEDROCK_MECHANICS): Simulation {
  const sim = new Simulation(model, mechanics);
  while (sim.tick < SETTLE_TICKS * GAME_TICKS_PER_REDSTONE_TICK && sim.step()) {
    /* run until stable or the cap */
  }
  return sim;
}

/** Applies a case's `set` to a settled run. */
export function applySet(sim: Simulation, model: Model, test: TestCase): void {
  for (const [name, value] of Object.entries(test.set)) {
    const pos = portPos(model, name);
    if (pos) sim.setInput(pos, value);
  }
}

/**
 * Runs one case: the design in its authored state runs until stable (at most 64 ticks), `set` is applied, then
 * `afterTicks` more ticks run and every expected output is read. Cases never share state.
 */
export function runCase(model: Model, test: TestCase, opts: RunOptions = {}): CaseResult {
  const mechanics = opts.mechanics ?? BEDROCK_MECHANICS;
  const budget = opts.budget ?? WORK_BUDGET;
  if (test.afterTicks > LIMITS.afterTicks) {
    return {
      status: "budget",
      actual: {},
      settleTicks: 0,
      work: 0,
      reason: `afterTicks is ${test.afterTicks}; the most is ${LIMITS.afterTicks}`,
    };
  }
  const sim = new Simulation(model, mechanics);
  const over = () => sim.work > budget;
  while (sim.tick < SETTLE_TICKS * GAME_TICKS_PER_REDSTONE_TICK && !over() && sim.step()) {
    /* settle */
  }
  const settleTicks = sim.tick;
  if (!over()) applySet(sim, model, test);
  let changing = true;
  const after = test.afterTicks * GAME_TICKS_PER_REDSTONE_TICK;
  for (let i = 0; i < after && changing && !over() && sim.unsupported === null; i++) changing = sim.step();
  const work = sim.work;
  if (sim.unsupported !== null)
    return { status: "skipped", actual: {}, settleTicks, work, reason: sim.unsupported };
  if (over()) {
    return {
      status: "budget",
      actual: {},
      settleTicks,
      work,
      reason: `the design is too large to simulate that long (stopped at redstone tick ${sim.tick / GAME_TICKS_PER_REDSTONE_TICK})`,
    };
  }
  const actual: Record<string, number> = {};
  for (const name of Object.keys(test.expect)) {
    const pos = portPos(model, name);
    actual[name] = pos ? sim.readOutput(pos) : 0;
  }
  const pass = Object.entries(test.expect).every(([name, v]) => actual[name] === v);
  return { status: pass ? "pass" : "fail", actual, settleTicks, work };
}

const describeCase = (i: number, t: TestCase) =>
  `Test ${i + 1} (set ${JSON.stringify(t.set)}, after ${t.afterTicks} ticks)`;

/** Stage 3: runs every test case and reports T001 (failed), T002 (out of budget) and T003 (skipped). */
export function simulateTests(model: Model, mechanics: SimMechanics = BEDROCK_MECHANICS): Diagnostic[] {
  const out: Diagnostic[] = [];
  let left = WORK_BUDGET;
  model.tests.forEach((test, i) => {
    let result: CaseResult | null = null;
    try {
      result = left > 0 ? runCase(model, test, { mechanics, budget: left }) : null;
    } catch (err) {
      // A simulator bug must not take the validator down: the case is skipped and the error named.
      result = {
        status: "skipped",
        actual: {},
        settleTicks: 0,
        work: 0,
        reason: `the simulator failed (${(err as Error).message}; please report this design)`,
      };
    }
    // Every case's work is charged against the whole design's budget.
    left = Math.max(0, left - (result?.work ?? 0));
    if (!result || result.status === "budget") {
      out.push(
        diag(
          "T002",
          `${describeCase(i, test)} ran out of its tick budget: ${result?.reason ?? "the design used up the simulation budget in earlier cases"}`,
          {
            path: `/tests/${i}`,
            hint: "Keep afterTicks at most 1,000; for a very large design, test the circuit in a smaller design.",
          },
        ),
      );
      return;
    }
    if (result.status === "skipped") {
      out.push(
        diag(
          "T003",
          `${describeCase(i, test)} was skipped: ${result.reason}, which the simulator does not model`,
          {
            path: `/tests/${i}`,
            hint: "Verify this case in game.",
          },
        ),
      );
      return;
    }
    if (result.status === "fail") {
      const wrong = Object.entries(test.expect).filter(([name, v]) => result.actual[name] !== v);
      const positions = wrong.map(([name]) => portPos(model, name)).filter((p): p is Pos => !!p);
      out.push(
        diag(
          "T001",
          `${describeCase(i, test)} failed: ${wrong.map(([name, v]) => `${name} expected ${v}, got ${result.actual[name]}`).join("; ")}`,
          {
            ...(positions[0] ? { pos: positions[0] } : { path: `/tests/${i}` }),
            ...(positions.length > 1 ? { related: positions.slice(1) } : {}),
            hint: "Fix the circuit, not the test. The simulator is approximate: if the case passes in game, the game wins.",
          },
        ),
      );
    }
  });
  return out;
}
