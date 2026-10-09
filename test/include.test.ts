import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse, PATTERN_DESIGNS, RSD_1_SCHEMA, rotateBlock, rotatePos } from "@dustwright/core";
import type { Model, Pos } from "@dustwright/core";
import { settle } from "@dustwright/sim";
import { validate } from "@dustwright/validator";

// Pattern `include` (M10): stamping library patterns into a design, with rotation.
const root = fileURLToPath(new URL("..", import.meta.url));
const names = readdirSync(`${root}/patterns`)
  .filter((f) => f.endsWith(".rsd.json"))
  .map((f) => f.replace(/\.rsd\.json$/, ""))
  .sort();

describe("rotation", () => {
  it("turns horizontal orientation clockwise and leaves vertical values and other states alone", () => {
    const r = (spec: Record<string, unknown>, type: string, turns: number) =>
      rotateBlock({ type, states: spec as never }, turns).states;
    expect(r({ facing: "north", delay: 2 }, "repeater", 1)).toEqual({ facing: "east", delay: 2 });
    expect(r({ facing: "west" }, "repeater", 3)).toEqual({ facing: "south" });
    expect(r({ mount: "north" }, "torch", 2)).toEqual({ mount: "south" });
    expect(r({ mount: "floor" }, "lever", 1)).toEqual({ mount: "floor" });
    expect(r({ facing: "up" }, "piston", 1)).toEqual({ facing: "up" });
    expect(r({ facing: "north", hinge: "left" }, "door", 1)).toEqual({ facing: "east", hinge: "left" });
  });

  it("turns positions so north becomes east, and four turns change nothing", () => {
    const size = [3, 1, 2] as const;
    expect(rotatePos([0, 0, 0], size, 1)).toEqual([1, 0, 0]);
    expect(rotatePos([2, 0, 0], size, 1)).toEqual([1, 0, 2]);
    for (let x = 0; x < 3; x++)
      for (let z = 0; z < 2; z++) expect(rotatePos([x, 0, z], size, 4)).toEqual([x, 0, z]);
  });
});

describe("include", () => {
  it("the schema names exactly the pattern library", () => {
    const schema = RSD_1_SCHEMA as unknown as {
      properties: { include: { items: { properties: { pattern: { enum: string[] } } } } };
    };
    expect([...schema.properties.include.items.properties.pattern.enum].sort()).toEqual(names);
    expect(Object.keys(PATTERN_DESIGNS).sort()).toEqual(names);
  });

  /** A design that is only `pattern`, stamped at the origin of a square grid, with its ports and tests turned. */
  function stamped(name: string, rotate: 0 | 90 | 180 | 270) {
    const p = parse(JSON.parse(readFileSync(`${root}/patterns/${name}.rsd.json`, "utf8"))).model as Model;
    const side = Math.max(p.size[0], p.size[2]);
    const turns = rotate / 90;
    const move = (pos: Pos) => rotatePos(pos, p.size, turns);
    const layer = Array.from({ length: side }, () => ".".repeat(side));
    return {
      format: "rsd/1",
      meta: { name: `${name} turned ${rotate}` },
      legend: {},
      layers: Array.from({ length: p.size[1] }, () => layer),
      include: [{ pattern: name, at: [0, 0, 0], rotate }],
      ports: {
        inputs: p.ports.inputs.map((x) => ({ name: x.name, pos: move(x.pos) })),
        outputs: p.ports.outputs.map((x) => ({ name: x.name, pos: move(x.pos) })),
      },
      tests: p.tests,
    };
  }

  it.each(names.flatMap((n) => ([0, 90, 180, 270] as const).map((r) => [n, r] as const)))(
    "%s turned %i passes its own tests",
    (name, rotate) => {
      if (name === "observer-clock") {
        // A free-running clock's phase depends on the order its blocks are placed, which turning changes (in game
        // too: exporters place in a fixed x, z, y order). So the turned clock is checked for running, not phase.
        const m = parse({ ...stamped(name, rotate), tests: [] }).model as Model;
        const sim = settle(m);
        const out = m.ports.outputs[0]?.pos as Pos;
        const seen = new Set<number>();
        for (let t = 0; t < 40; t++) {
          sim.step();
          seen.add(sim.readOutput(out) > 0 ? 1 : 0);
        }
        expect([...seen].sort()).toEqual([0, 1]);
        return;
      }
      const r = validate(stamped(name, rotate));
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      // T003 only for the hopper sorter, as for the pattern itself.
      const t = r.diagnostics.filter((d) => d.code.startsWith("T")).map((d) => d.code);
      expect(t.every((c) => c === "T003")).toBe(true);
      expect(t.length > 0).toBe(name === "hopper-sorter");
    },
  );

  it("refuses an unknown pattern, a stamp outside the grid, and a stamp onto a block", () => {
    const base = { format: "rsd/1", meta: { name: "i" }, legend: { "#": "stone" } };
    const codes = (d: object) => parse(d).diagnostics.map((x) => x.code);
    expect(codes({ ...base, layers: [["....."]], include: [{ pattern: "nope", at: [0, 0, 0] }] })).toContain(
      "E001",
    );
    expect(
      codes({ ...base, layers: [["...."], ["...."]], include: [{ pattern: "not-gate", at: [0, 0, 0] }] }),
    ).toContain("E008");
    expect(
      codes({ ...base, layers: [["#...."], ["....."]], include: [{ pattern: "not-gate", at: [0, 0, 0] }] }),
    ).toContain("E009");
    const ok = parse({
      ...base,
      layers: [["....."], ["....."]],
      include: [{ pattern: "not-gate", at: [0, 0, 0] }],
    });
    expect(ok.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(ok.model?.blocks.size).toBe(10);
  });
});
