import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseText } from "@dustwright/core";
import type { Model } from "@dustwright/core";
import { settle } from "@dustwright/sim";
import { validateText } from "@dustwright/validator";

// The pattern library (spec: LLM authoring deliverables). Every pattern is also built and tested in game by
// deploy/test-world/ingame-check.mjs --only patterns (logged in docs/ingame/).
const root = fileURLToPath(new URL("..", import.meta.url));
const files = readdirSync(`${root}/patterns`)
  .filter((f) => f.endsWith(".rsd.json"))
  .sort();
const SPEC_LIST = [
  "not-gate",
  "or-gate",
  "and-gate",
  "xor-gate",
  "repeater-line",
  "pulse-extender",
  "pulse-limiter",
  "observer-clock",
  "repeater-clock",
  "t-flip-flop",
  "rs-latch",
  "piston-door-2x2",
  "hopper-sorter",
];

describe("pattern library", () => {
  it("holds exactly the spec's thirteen patterns", () => {
    expect(files.map((f) => f.replace(/\.rsd\.json$/, "")).sort()).toEqual([...SPEC_LIST].sort());
  });

  it.each(files)("%s: has ports and tests, a description, and passes in the simulator", (file) => {
    const result = validateText(readFileSync(`${root}/patterns/${file}`, "utf8"));
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    const model = result.model!;
    expect(model.ports.outputs.length).toBeGreaterThan(0);
    expect(model.tests.length).toBeGreaterThan(0);
    expect(model.meta.description?.length ?? 0).toBeGreaterThan(20);
    expect(model.meta.slug).toBe(
      file.replace(/\.rsd\.json$/, "") === "piston-door-2x2"
        ? "2x2-piston-door"
        : file.replace(/\.rsd\.json$/, ""),
    );
    const t = result.diagnostics.filter((d) => d.code.startsWith("T"));
    // Only the hopper sorter is skipped (a comparator reading a container); it is tested in game instead.
    expect(t.map((d) => d.code)).toEqual(
      file === "hopper-sorter.rsd.json" ? model.tests.map(() => "T003") : [],
    );
  });

  it.each(files.filter((f) => existsSync(`${root}/examples/${f}`)))(
    "%s is the same as its example",
    (file) => {
      expect(readFileSync(`${root}/patterns/${file}`, "utf8")).toBe(
        readFileSync(`${root}/examples/${file}`, "utf8"),
      );
    },
  );

  it("the RS latch rests reset, sets, holds, resets and holds again (a sequence; each test case starts fresh)", () => {
    const m = parseText(readFileSync(`${root}/patterns/rs-latch.rsd.json`, "utf8")).model as Model;
    const port = (name: string) =>
      [...m.ports.inputs, ...m.ports.outputs].find((p) => p.name === name)?.pos as [number, number, number];
    const sim = settle(m);
    const run = (ticks: number) => {
      for (let i = 0; i < ticks; i++) sim.stepRedstone();
      return sim.readOutput(port("Q"));
    };
    expect(sim.readOutput(port("Q"))).toBe(0);
    const steps: [string, number, number][] = [
      ["S", 1, 1],
      ["S", 0, 1],
      ["R", 1, 0],
      ["R", 0, 0],
      ["S", 1, 1],
      ["S", 0, 1],
    ];
    for (const [input, value, q] of steps) {
      sim.setInput(port(input), value);
      expect(run(10), `${input}=${value}`).toBe(q);
    }
  });
});
