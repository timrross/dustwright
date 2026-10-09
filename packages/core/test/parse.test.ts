import { describe, expect, it } from "vitest";
import { parse, parseText, posKey } from "../src/index.js";
import { codes, design, examples, snapshotModel } from "./helpers.js";

describe("examples", () => {
  it.each(examples().map((e) => [e.file, e.text]))("%s parses and normalises", (file, text) => {
    const { model, diagnostics } = parseText(text);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(model).toBeDefined();
    expect(snapshotModel(model!)).toMatchSnapshot(file);
  });
});

describe("normalisation", () => {
  it("keys blocks by x,y,z with +x east, layers bottom to top and rows north to south", () => {
    const { model } = parse(
      design({
        layers: [
          ["#.", ".#"],
          ["L.", ".."],
        ],
      }),
    );
    expect([...model!.blocks.keys()].sort()).toEqual(["0,0,0", "0,1,0", "1,0,1"]);
    expect(model!.size).toEqual([2, 2, 2]);
    expect(model!.blocks.get("0,1,0")).toEqual({ type: "lever", states: { mount: "floor", on: false } });
  });

  it("fills registry defaults and derives the slug", () => {
    const { model } = parse(design());
    expect(model!.blocks.get("3,1,0")).toEqual({ type: "lamp", states: { lit: false } });
    expect(model!.meta).toEqual({ name: "Test", slug: "test", edition: "bedrock" });
  });

  it("applies blocks overrides after layers", () => {
    const { model } = parse(design({ blocks: [{ pos: [2, 1, 0], block: "dust power=3" }] }));
    expect(model!.blocks.get(posKey([2, 1, 0]))).toEqual({ type: "dust", states: { power: 3 } });
  });

  it("makes one step per layer by default and keeps explicit steps", () => {
    expect(parse(design()).model!.steps.map((s) => [s.title, s.positions.length])).toEqual([
      ["Layer 0", 4],
      ["Layer 1", 3],
    ]);
    const withEmpty = parse(design({ layers: [["####"], ["...."], ["L-.*"]] }));
    expect(withEmpty.model!.steps.map((s) => s.positions.length)).toEqual([4, 0, 3]);
    const { model } = parse(
      design({
        steps: [
          { title: "all", layers: [0, 1] },
          { title: "one", positions: [[0, 1, 0]] },
        ],
      }),
    );
    expect(model!.steps.map((s) => s.positions.length)).toEqual([7, 1]);
  });

  it("carries ext through untouched and never mutates its argument", () => {
    const input = design({ ext: { tool: { nested: [1, 2] } } });
    const before = JSON.stringify(input);
    const { model } = parse(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(model!.ext).toEqual({ tool: { nested: [1, 2] } });
    expect(model!.ext).not.toBe(input.ext);
  });

  it("accepts deep-frozen input", () => {
    const freeze = (v: unknown): unknown => {
      if (typeof v === "object" && v !== null) Object.values(v).forEach(freeze);
      return Object.freeze(v);
    };
    expect(parse(freeze(design())).model).toBeDefined();
  });

  it("places a door's upper half implicitly and needs air above it", () => {
    const ok = parse(
      design({ legend: { "#": "stone", D: "door facing=east" }, layers: [["#"], ["D"], ["."]] }),
    );
    expect(ok.model).toBeDefined();
    const blocked = parse(
      design({ legend: { "#": "stone", D: "door facing=east" }, layers: [["#"], ["D"], ["#"]] }),
    );
    expect(codes(blocked.diagnostics)).toEqual(["E009"]);
    expect(blocked.diagnostics[0]?.related).toEqual([[0, 2, 0]]);
    const outside = parse(
      design({ legend: { "#": "stone", D: "door facing=east" }, layers: [["#"], ["D"]] }),
    );
    expect(codes(outside.diagnostics)).toEqual(["E008"]);
  });
});

describe("stage 1 errors carry the right code and position", () => {
  it("E002 ragged rows and layers", () => {
    const rows = parse(design({ layers: [["####"], ["L-.*", "L-."]] }));
    expect(codes(rows.diagnostics)).toContain("E002");
    const short = rows.diagnostics.find((d) => d.code === "E002" && d.path === "/layers/1/1");
    expect(short?.pos).toEqual([0, 1, 1]);
    const layers = parse(design({ layers: [["####", "####"], ["L-.*"]] }));
    expect(layers.diagnostics[0]).toMatchObject({ code: "E002", pos: [0, 1, 0], path: "/layers/1" });
  });

  it("E003 unknown character, once per character at its first position", () => {
    const { diagnostics } = parse(design({ layers: [["#?##"], ["L-?*"]] }));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "E003", pos: [1, 0, 0] });
  });

  it("E004 unknown type with the closest registry names", () => {
    const { diagnostics } = parse(design({ legend: { "#": "stone", L: "levr", "-": "dust", "*": "lamp" } }));
    expect(diagnostics[0]).toMatchObject({ code: "E004", pos: [0, 1, 0], path: "/legend/L" });
    expect(diagnostics[0]?.hint).toContain('"lever"');
  });

  it("E005 bad state value, unknown key, repeated key, tab", () => {
    const value = parse(design({ legend: { "#": "stone", L: "lever mount=sky", "-": "dust", "*": "lamp" } }));
    expect(value.diagnostics[0]).toMatchObject({ code: "E005", pos: [0, 1, 0] });
    expect(value.diagnostics[0]?.hint).toContain("floor, ceiling, north, south, east, west");
    const key = parse(design({ legend: { "#": "stone", L: "lever colour=red", "-": "dust", "*": "lamp" } }));
    expect(key.diagnostics[0]?.code).toBe("E005");
    const repeated = parse(
      design({ legend: { "#": "stone", L: "lever on=true on=false", "-": "dust", "*": "lamp" } }),
    );
    expect(repeated.diagnostics[0]?.code).toBe("E005");
    const tab = parse(design({ legend: { "#": "stone", L: "lever\ton=true", "-": "dust", "*": "lamp" } }));
    expect(tab.diagnostics[0]?.code).toBe("E005");
    const torch = parse(
      design({ legend: { "#": "stone", L: "torch mount=ceiling", "-": "dust", "*": "lamp" } }),
    );
    expect(torch.diagnostics[0]?.code).toBe("E005");
    const delay = parse(design({ legend: { "#": "stone", L: "lever delay=2", "-": "dust", "*": "lamp" } }));
    expect(delay.diagnostics[0]?.code).toBe("E005");
  });

  it("E007 bounding box", () => {
    expect(codes(parse(design({ layers: [["#".repeat(65)]] })).diagnostics)).toEqual(["E007"]);
  });

  it("E008 positions outside the grid or on air", () => {
    const port = parse(design({ ports: { inputs: [{ name: "A", pos: [9, 0, 0] }] } }));
    expect(port.diagnostics[0]).toMatchObject({ code: "E008", pos: [9, 0, 0] });
    const air = parse(design({ annotations: [{ pos: [2, 1, 0], text: "air" }] }));
    expect(air.diagnostics[0]).toMatchObject({ code: "E008", pos: [2, 1, 0] });
    const step = parse(design({ steps: [{ title: "x", layers: [5] }] }));
    expect(step.diagnostics[0]?.code).toBe("E008");
    const override = parse(design({ blocks: [{ pos: [0, 5, 0], block: "stone" }] }));
    expect(override.diagnostics[0]?.code).toBe("E008");
  });

  it("E009 repeated overrides", () => {
    const { diagnostics } = parse(
      design({
        blocks: [
          { pos: [2, 1, 0], block: "stone" },
          { pos: [2, 1, 0], block: "glass" },
        ],
      }),
    );
    expect(diagnostics[0]).toMatchObject({ code: "E009", pos: [2, 1, 0] });
  });

  it("E010 unsupported format names the accepted versions", () => {
    const { diagnostics } = parse(design({ format: "rsd/2" }));
    expect(diagnostics[0]).toMatchObject({ code: "E010", path: "/format" });
    expect(diagnostics[0]?.hint).toContain("rsd/1");
  });

  it("E011 port and test references", () => {
    const ports = { inputs: [{ name: "A", pos: [0, 1, 0] }], outputs: [{ name: "out", pos: [3, 1, 0] }] };
    expect(parse(design({ ports })).model).toBeDefined();
    const dup = parse(
      design({
        ports: { inputs: [{ name: "A", pos: [0, 1, 0] }], outputs: [{ name: "A", pos: [3, 1, 0] }] },
      }),
    );
    expect(codes(dup.diagnostics)).toContain("E011");
    const badInput = parse(design({ ports: { inputs: [{ name: "A", pos: [3, 1, 0] }] } }));
    expect(badInput.diagnostics[0]).toMatchObject({ code: "E011", pos: [3, 1, 0] });
    const badOutput = parse(design({ ports: { outputs: [{ name: "o", pos: [0, 0, 0] }] } }));
    expect(badOutput.diagnostics[0]?.code).toBe("E011");
    const unknown = parse(design({ ports, tests: [{ set: { B: 1 }, afterTicks: 2, expect: { out: 1 } }] }));
    expect(unknown.diagnostics[0]).toMatchObject({ code: "E011", path: "/tests/0/set/B" });
    const level = parse(design({ ports, tests: [{ set: { A: 1 }, afterTicks: 2, expect: { out: 7 } }] }));
    expect(level.diagnostics[0]).toMatchObject({ code: "E011", path: "/tests/0/expect/out" });
  });

  it("E012 slugs: traversal names are made safe, bad explicit slugs and emoji names fail", () => {
    expect(parse(design({ meta: { name: "../../evil" } })).model!.meta.slug).toBe("evil");
    expect(parse(design({ meta: { name: "🧱🔥" } })).diagnostics[0]).toMatchObject({
      code: "E012",
      path: "/meta/name",
    });
    expect(parse(design({ meta: { name: "x", slug: "../x" } })).diagnostics[0]).toMatchObject({
      code: "E012",
      path: "/meta/slug",
    });
    expect(parse(design({ meta: { name: "x", slug: "a".repeat(49) } })).diagnostics[0]?.code).toBe("E012");
    expect(parse(design({ meta: { name: "N".repeat(80) } })).model!.meta.slug).toHaveLength(48);
  });

  it("E001 schema errors carry a JSON Pointer path", () => {
    const { diagnostics } = parse(design({ colour: "red" }));
    expect(diagnostics[0]).toMatchObject({ code: "E001", path: "/colour" });
    const missing = parse({ format: "rsd/1", meta: { name: "x" }, legend: { "#": "stone" } });
    expect(missing.diagnostics[0]).toMatchObject({ code: "E001", path: "" });
    const key = parse(design({ legend: { ".": "stone" } }));
    expect(key.diagnostics[0]).toMatchObject({ code: "E001", path: "/legend/." });
    const control = parse(design({ meta: { name: "a\nb" } }));
    expect(control.diagnostics[0]).toMatchObject({ code: "E001", path: "/meta/name" });
  });

  it("strips a UTF-8 byte order mark", () => {
    expect(parseText(`\ufeff${JSON.stringify(design())}`).model).toBeDefined();
  });

  it("normalises -0 to 0 and rejects names with bidi overrides or line separators", () => {
    const { model } = parse(
      design({ legend: { "#": "stone", L: "lever", "-": "dust power=-0", "*": "lamp" } }),
    );
    expect(Object.is(model?.blocks.get("1,1,0")?.states.power, 0)).toBe(true);
    for (const name of ["a\u202eb", "a\u2028b", "a\u0085b"]) {
      expect(parse(design({ meta: { name } })).diagnostics[0]).toMatchObject({
        code: "E001",
        path: "/meta/name",
      });
    }
  });

  it("rejects repeated layer indices in a step", () => {
    expect(parse(design({ steps: [{ title: "x", layers: [0, 0] }] })).diagnostics[0]?.code).toBe("E001");
  });

  it("W106 unused legend key is a warning only", () => {
    const { model, diagnostics } = parse(
      design({ legend: { "#": "stone", L: "lever", "-": "dust", "*": "lamp", g: "glass" } }),
    );
    expect(model).toBeDefined();
    expect(diagnostics).toMatchObject([{ code: "W106", severity: "warning", path: "/legend/g" }]);
  });

  it("parses a java design", () => {
    const { model, diagnostics } = parse(design({ meta: { name: "j", edition: "java" } }));
    expect(diagnostics).toEqual([]);
    expect(model!.meta.edition).toBe("java");
  });
});
