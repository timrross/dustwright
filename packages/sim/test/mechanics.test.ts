import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIRS, keyPos, parse, parseText } from "@dustwright/core";
import type { Model, Pos } from "@dustwright/core";
import { runCase, settle, Simulation, simulateTests } from "../src/index.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function model(
  legend: Record<string, string>,
  layers: string[][],
  extra: Record<string, unknown> = {},
): Model {
  const result = parse({ format: "rsd/1", meta: { name: "Case" }, legend, layers, ...extra });
  if (!result.model) throw new Error(JSON.stringify(result.diagnostics));
  return result.model;
}

/**
 * Settles a design, sets `input` to 1, and records the outputs for the next `ticks` redstone ticks (or game ticks
 * with `game`); index 0 is the moment of the set.
 */
function trace(m: Model, input: Pos, outputs: Pos[], ticks: number, game = false): number[][] {
  const sim = settle(m);
  sim.setInput(input, 1);
  const rows: number[][] = [outputs.map((p) => sim.readOutput(p))];
  for (let i = 0; i < ticks; i++) {
    if (game) sim.step();
    else sim.stepRedstone();
    rows.push(outputs.map((p) => sim.readOutput(p)));
  }
  return rows;
}

describe("dust", () => {
  it("decays by one per block: 15 next to the lever, 0 at the 16th dust", () => {
    const m = model({ "#": "stone", L: "lever mount=floor", "-": "dust" }, [
      ["#".repeat(17)],
      ["L" + "-".repeat(16)],
    ]);
    const sim = settle(m);
    sim.setInput([0, 1, 0], 1);
    const levels = Array.from({ length: 16 }, (_, i) => sim.readOutput([i + 1, 1, 0]));
    expect(levels).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });
});

describe("repeater", () => {
  it.each([1, 2, 3, 4])("delay %i turns the lamp on delay + 1 ticks after the input", (delay) => {
    const m = model(
      {
        "#": "stone",
        L: "lever mount=floor",
        "-": "dust",
        ">": `repeater facing=east delay=${delay}`,
        "*": "lamp",
      },
      [["#####"], ["L->-*"]],
    );
    const lamp = trace(m, [0, 1, 0], [[4, 1, 0]], 8).map((r) => r[0]);
    expect(lamp.indexOf(1)).toBe(delay + 1);
  });

  it("is locked by a powered repeater pointing into its side", () => {
    const legend = {
      "#": "stone",
      L: "lever mount=floor",
      "-": "dust",
      ">": "repeater facing=east",
      "^": "repeater facing=north",
      B: "redstone_block",
      "*": "lamp",
    };
    const floor = ["#####", "#####", "#####"];
    const locked = model(legend, [floor, ["L->-*", "..^..", "..B.."]]);
    const free = model(legend, [floor, ["L->-*", "..^..", "....."]]);
    expect(trace(locked, [0, 1, 0], [[4, 1, 0]], 6).map((r) => r[0])).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(trace(free, [0, 1, 0], [[4, 1, 0]], 6).map((r) => r[0])).toEqual([0, 0, 1, 1, 1, 1, 1]);
  });
});

describe("comparator", () => {
  const legend = (mode: string) => ({
    "#": "stone",
    L: "lever mount=floor",
    S: "lever mount=floor",
    "-": "dust",
    c: `comparator facing=east mode=${mode}`,
    o: "dust",
  });
  // Rear: lever then 2 dust (level 14 at the comparator's back). Side: lever then 10 dust from the south (level 6).
  const layers = [
    [
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
      "#####",
    ],
    [
      "L-.c-",
      "...-.",
      "...-.",
      "...-.",
      "...-.",
      "...-.",
      "...-.",
      "...-.",
      "...-.",
      "...-.",
      "...-.",
      "...S.",
      ".....",
    ],
  ];
  it("subtract mode outputs rear minus side", () => {
    const m = model(legend("subtract"), [
      layers[0] as string[],
      ["L--c-", ...(layers[1] as string[]).slice(1)],
    ]);
    const sim = settle(m);
    sim.setInput([0, 1, 0], 1);
    sim.setInput([3, 1, 11], 1);
    for (let i = 0; i < 4; i++) sim.stepRedstone();
    const rear = sim.readOutput([2, 1, 0]);
    const side = sim.readOutput([3, 1, 1]);
    expect(rear).toBe(14);
    expect(side).toBe(6);
    expect(sim.powerAt([3, 1, 0])).toBe(rear - side);
  });

  it("compare mode passes the rear signal when it is at least the side, else 0", () => {
    const m = model(legend("compare"), [
      layers[0] as string[],
      ["L--c-", ...(layers[1] as string[]).slice(1)],
    ]);
    const sim = settle(m);
    sim.setInput([0, 1, 0], 1);
    sim.setInput([3, 1, 11], 1);
    for (let i = 0; i < 4; i++) sim.stepRedstone();
    expect(sim.powerAt([3, 1, 0])).toBe(14);
  });

  it("compare mode outputs 0 when the side is stronger than the rear", () => {
    // Rear: the second dust from its lever (14 at the comparator); side: dust right next to its own lever (15).
    const m = model(
      {
        "#": "stone",
        L: "lever mount=floor",
        S: "lever mount=floor",
        "-": "dust",
        c: "comparator facing=east",
      },
      [
        ["#####", "#####", "#####"],
        ["L--c-", "...-.", "...S."],
      ],
    );
    const sim = settle(m);
    sim.setInput([0, 1, 0], 1);
    sim.setInput([3, 1, 2], 1);
    for (let i = 0; i < 4; i++) sim.stepRedstone();
    expect(sim.readOutput([2, 1, 0])).toBe(14);
    expect(sim.readOutput([3, 1, 1])).toBe(15);
    expect(sim.powerAt([3, 1, 0])).toBe(0);
  });
});

describe("torch", () => {
  it("inverts its support one tick later (NOT gate: lamp off two ticks after the lever)", () => {
    const m = model(
      { "#": "stone", L: "lever mount=floor", "-": "dust", t: "torch mount=west", "*": "lamp" },
      [["#####"], ["L-#t*"]],
    );
    const sim = settle(m);
    expect(sim.readOutput([4, 1, 0])).toBe(1);
    const lamp = trace(m, [0, 1, 0], [[4, 1, 0]], 4).map((r) => r[0]);
    expect(lamp).toEqual([1, 1, 0, 0, 0]);
  });
});

describe("observer", () => {
  // Measured in game (docs/ingame/2026-10-08-m6-timing.json): reacts 3 game ticks after a change, pulses for 2.
  it("pulses for 2 game ticks, 3 game ticks after the block it watches changes", () => {
    const m = model({ "#": "stone", L: "lever mount=floor", o: "observer facing=west", "-": "dust" }, [
      ["####"],
      [".Lo-"],
    ]);
    const dust = trace(m, [1, 1, 0], [[3, 1, 0]], 8, true).map((r) => r[0]);
    expect(dust).toEqual([0, 0, 0, 15, 15, 0, 0, 0, 0]);
  });

  it("clocks with the period measured in game: a rise every 6 game ticks, 2 ticks high", () => {
    const m = parseText(readFileSync(`${ROOT}/examples/observer-clock.rsd.json`, "utf8")).model as Model;
    const sim = new Simulation(m);
    const high: number[] = [];
    for (let i = 0; i < 80; i++) {
      sim.step();
      high.push(sim.readOutput([3, 1, 0]) > 0 ? 1 : 0);
    }
    const rises = high.flatMap((v, i) => (v === 1 && high[i - 1] === 0 ? [i] : []));
    expect(rises.length).toBeGreaterThan(8);
    expect(new Set(rises.slice(1).map((r, i) => r - (rises[i] as number)))).toEqual(new Set([6]));
    expect(high.slice(rises[0]).filter(Boolean).length / rises.length).toBeCloseTo(2, 0);
  });
});

describe("piston", () => {
  const pushLine = (n: number) =>
    model({ "#": "stone", L: "lever mount=floor", P: "piston facing=east", g: "glass" }, [
      ["#".repeat(n + 4)],
      ["LP" + "g".repeat(n) + ".."],
    ]);

  it("pushes 12 blocks", () => {
    const sim = settle(pushLine(12));
    sim.setInput([0, 1, 0], 1);
    sim.stepRedstone();
    sim.stepRedstone();
    expect(sim.readOutput([1, 1, 0])).toBe(1);
    expect(sim.snapshot().blocks.get("14,1,0")?.type).toBe("glass");
  });

  it("does not extend against 13", () => {
    const sim = settle(pushLine(13));
    sim.setInput([0, 1, 0], 1);
    sim.stepRedstone();
    sim.stepRedstone();
    expect(sim.readOutput([1, 1, 0])).toBe(0);
  });

  it("has no quasi-connectivity: power two blocks above does nothing", () => {
    const m = model({ "#": "stone", P: "piston facing=east", L: "lever mount=floor" }, [
      ["#."],
      [".P"],
      ["#."],
      ["L."],
    ]);
    const sim = settle(m);
    sim.setInput([0, 3, 0], 1);
    for (let i = 0; i < 4; i++) sim.stepRedstone();
    expect(sim.readOutput([1, 1, 0])).toBe(0);
  });
});

describe("pistons moving pistons", () => {
  /** Every extended piston has its head in front of it, and every head belongs to one. */
  function consistent(sim: Simulation) {
    const blocks = sim.snapshot().blocks;
    const extended = [...blocks].filter(([, b]) => b.states.extended === true);
    for (const [key, b] of extended) {
      const pos = keyPos(key);
      const f = DIRS[b.states.facing as keyof typeof DIRS];
      expect(sim.at([pos[0] + f[0], pos[1] + f[1], pos[2] + f[2]])?.type, `head of ${key}`).toBe(
        "piston_head",
      );
    }
    let heads = 0;
    for (let x = -2; x < 12; x++)
      for (let z = -6; z < 6; z++) if (sim.at([x, 1, z])?.type === "piston_head") heads++;
    expect(heads).toBe(extended.length);
  }

  it("does not crash when one piston moves another on the tick it fires (review M6)", () => {
    const m = model(
      { B: "redstone_block", P: "piston facing=east", Q: "piston facing=north", g: "glass", "#": "stone" },
      [["###B##"], ["BPgQ.."], ["......"]],
    );
    const sim = new Simulation(m);
    for (let i = 0; i < 20; i++) sim.step();
    consistent(sim);
  });

  it("a row of pistons fired at once moves one push per tick, never a head", () => {
    const m = model({ B: "redstone_block", P: "piston facing=east" }, [["BBBB...."], ["PPP....."]]);
    const sim = new Simulation(m);
    for (let i = 0; i < 20; i++) {
      sim.step();
      consistent(sim);
    }
    expect(
      [...sim.snapshot().blocks]
        .filter(([, b]) => b.type === "piston")
        .every(([k]) => Number(k.split(",")[0]) <= 4),
    ).toBe(true);
  });

  it("reports a simulator failure as a skipped case, not a crash", () => {
    const m = model({ "#": "stone", L: "lever mount=floor", "*": "lamp" }, [["###"], ["L.*"]], {
      ports: { inputs: [{ name: "A", pos: [0, 1, 0] }], outputs: [{ name: "out", pos: [2, 1, 0] }] },
      tests: [{ set: { A: 1 }, afterTicks: 2, expect: { out: 0 } }],
    });
    const step = Simulation.prototype.step;
    Simulation.prototype.step = () => {
      throw new Error("boom");
    };
    try {
      expect(simulateTests(m)).toMatchObject([
        { code: "T003", message: expect.stringMatching(/simulator failed \(boom/) },
      ]);
    } finally {
      Simulation.prototype.step = step;
    }
  });
});

describe("test cases", () => {
  const examples = readdirSync(`${ROOT}/examples`).filter((f) => f.endsWith(".rsd.json"));

  it.each(examples)("%s: every test passes", (file) => {
    const m = parseText(readFileSync(`${ROOT}/examples/${file}`, "utf8")).model as Model;
    for (const test of m.tests) expect(runCase(m, test)).toMatchObject({ status: "pass" });
  });

  it.each(examples.filter((f) => !f.startsWith("observer") && !f.startsWith("orientation")))(
    "%s: every test fails when its expectation is flipped (the tests are not vacuous)",
    (file) => {
      const m = parseText(readFileSync(`${ROOT}/examples/${file}`, "utf8")).model as Model;
      for (const test of m.tests) {
        const flipped = Object.fromEntries(Object.entries(test.expect).map(([k, v]) => [k, v === 0 ? 1 : 0]));
        expect(runCase(m, { ...test, expect: flipped }).status).toBe("fail");
      }
    },
  );

  it("reports T002 for a clock that waits 1,001 ticks, without running it", () => {
    const text = readFileSync(`${ROOT}/examples/observer-clock.rsd.json`, "utf8");
    const m = parseText(text).model as Model;
    const clock = { ...m, tests: [{ set: {}, afterTicks: 1001, expect: { tick: 0 } }] };
    const t0 = performance.now();
    const diagnostics = simulateTests(clock);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(diagnostics.map((d) => d.code)).toEqual(["T002"]);
  });

  it("runs a clock for 1,000 ticks within budget", () => {
    const m = parseText(readFileSync(`${ROOT}/examples/observer-clock.rsd.json`, "utf8")).model as Model;
    expect(runCase(m, { set: {}, afterTicks: 1000, expect: { tick: 0 } }).status).not.toBe("budget");
  });

  it("skips a case with T003 when a comparator reads a container", () => {
    const m = model(
      { "#": "stone", h: "hopper", c: "comparator facing=east", "-": "dust", "*": "lamp" },
      [["####"], ["hc-*"]],
      {
        ports: { outputs: [{ name: "out", pos: [3, 1, 0] }] },
        tests: [{ set: {}, afterTicks: 2, expect: { out: 0 } }],
      },
    );
    const diagnostics = simulateTests(m);
    expect(diagnostics).toMatchObject([{ code: "T003", severity: "info" }]);
    expect(diagnostics[0]?.message).toMatch(/comparator at \[1,1,0\]/);
  });

  it("is deterministic", () => {
    const m = parseText(readFileSync(`${ROOT}/examples/t-flip-flop.rsd.json`, "utf8")).model as Model;
    const run = () => {
      const sim = new Simulation(m);
      const out: string[] = [];
      for (let i = 0; i < 40; i++) {
        if (i === 5) sim.setInput([0, 2, 4], 1);
        sim.stepRedstone();
        out.push(JSON.stringify([...sim.snapshot().blocks]));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
