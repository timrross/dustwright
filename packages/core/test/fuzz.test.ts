import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expansionCases, limitCases, mutations, stressCases } from "../fuzz/corpus.js";
import { LIMITS, parse, parseText } from "../src/index.js";
import { examples, ROOT } from "./helpers.js";

/** Runs the parser and fails the test if it throws or takes longer than a second. */
function timed(text: string) {
  const start = performance.now();
  const result = parseText(text);
  return { result, ms: performance.now() - start };
}

describe("fuzz corpus: every Limits row exceeded by one", () => {
  const cases = limitCases();
  it("covers every row of the Limits table", () => {
    expect(cases.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "file size 2 MB + 1",
        "json depth 9",
        "box x 65",
        "box y 385",
        "box z 65",
        "legend 91 entries",
        "spec 201 chars",
        "name 81 chars",
        "description 2001 chars",
        "blocks 10001",
        "inputs 65",
        "outputs 65",
        "tests 65",
        "annotations 501",
        "annotation text 501",
        "steps 385",
        "non-air 50001",
      ]),
    );
  });
  it.each(cases.map((c) => [c.name, c] as const))("%s is rejected in under a second", (_name, c) => {
    const { result, ms } = timed(c.text);
    expect(result.model).toBeUndefined();
    expect(c.codes).toContain(result.diagnostics.find((d) => d.severity === "error")?.code);
    expect(ms).toBeLessThan(1000);
  });

  it("a limit diagnostic names the limit", () => {
    const c = cases.find((x) => x.name === "legend 91 entries")!;
    expect(parseText(c.text).diagnostics[0]?.message).toContain(String(LIMITS.legendEntries));
  });
});

describe("fuzz corpus: expansion bombs", () => {
  it.each(expansionCases().map((c) => [c.name, c] as const))(
    "%s is rejected in under a second",
    (_name, c) => {
      expect(c.text.length).toBeLessThan(2 * 1024 * 1024);
      const { result, ms } = timed(c.text);
      expect(result.model).toBeUndefined();
      expect(c.codes).toContain(result.diagnostics.find((d) => d.severity === "error")?.code);
      expect(ms).toBeLessThan(1000);
    },
  );
});

describe("fuzz corpus: stress inputs", () => {
  it.each(stressCases().map((c) => [c.name, c] as const))("%s is rejected in under a second", (_name, c) => {
    const { result, ms } = timed(c.text);
    expect(result.model).toBeUndefined();
    expect(c.codes).toContain(result.diagnostics[0]?.code);
    expect(ms).toBeLessThan(1000);
  });

  it("rejects cyclic and over-deep objects passed directly", () => {
    const cyclic: Record<string, unknown> = { format: "rsd/1" };
    cyclic.self = cyclic;
    expect(parse(cyclic).diagnostics[0]?.code).toBe("E013");
    let deep: unknown = 1;
    for (let i = 0; i < 100; i++) deep = { a: deep };
    expect(parse(deep).diagnostics[0]?.code).toBe("E013");
  });

  it("counts strings against the size budget when an object is passed directly", () => {
    const huge = { format: "rsd/1", meta: { name: "x", description: "d".repeat(3 * 1024 * 1024) } };
    const start = performance.now();
    expect(parse(huge).diagnostics[0]?.code).toBe("E013");
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("caps diagnostics at 200 and says the rest are omitted", () => {
    const legend: Record<string, string> = { "#": "stone" };
    const rows = Array.from({ length: 64 }, (_, z) =>
      [...Array(64)]
        .map((_, x) => String.fromCharCode(33 + ((x + z) % 90)))
        .join("")
        .replace(/[.#]/g, "a"),
    );
    const keys = [...Array(90)]
      .map((_, i) => String.fromCharCode(33 + i))
      .filter((c) => c !== "." && c !== "#");
    for (const k of keys.slice(0, 89)) legend[k] = `nope${keys.indexOf(k)}`;
    const r = parse({ format: "rsd/1", meta: { name: "x" }, legend, layers: [rows, rows, rows] });
    expect(r.diagnostics.length).toBeLessThanOrEqual(200);
    const many = parse({
      format: "rsd/1",
      meta: { name: "x" },
      legend: { "#": "stone" },
      layers: [["#"]],
      annotations: Array.from({ length: 300 }, () => ({ pos: [5, 5, 5], text: "a" })),
    });
    expect(many.diagnostics).toHaveLength(200);
    expect(many.diagnostics[199]).toMatchObject({ code: "E013" });
    expect(many.diagnostics[199]?.message).toContain("omitted");
  });

  it("does not throw on hostile values passed directly", () => {
    const throwing = {
      format: "rsd/1",
      get meta(): unknown {
        throw new Error("boom");
      },
    };
    for (const v of [undefined, null, 0, "x", [], () => 1, Symbol("s"), 10n, throwing]) {
      expect(() => parse(v)).not.toThrow();
      expect(parse(v).model).toBeUndefined();
    }
  });
});

describe("fuzz seeds", () => {
  const dir = `${ROOT}/packages/core/fuzz/seeds`;
  it.each(readdirSync(dir).filter((f) => f.endsWith(".json")))("%s never throws", (file) => {
    expect(() => parseText(readFileSync(`${dir}/${file}`, "utf8"))).not.toThrow();
  });
});

describe("mutation fuzz", () => {
  it("2,000 seeded mutations of every example never throw", () => {
    for (const { text } of examples()) {
      for (const mutated of mutations(text, 400)) {
        const r = parseText(mutated);
        expect(Array.isArray(r.diagnostics)).toBe(true);
        if (r.model === undefined) expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
      }
    }
  });
});
