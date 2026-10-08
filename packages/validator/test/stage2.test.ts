import { describe, expect, it } from "vitest";
import { validate } from "../src/index.js";

// Regression cases for the stage 2 rules, from the M5 review.
function codes(legend: Record<string, string>, layers: string[][]): string[] {
  const result = validate({
    format: "rsd/1",
    meta: { name: "Case", gameVersion: "1.26.50" },
    legend,
    layers,
  });
  return result.diagnostics
    .map((d) => `${d.code}${d.pos ? ` ${d.pos.join(",")}` : ""}`)
    .filter((c) => !c.startsWith("W108"));
}

describe("W102", () => {
  it("accepts a repeater feeding a comparator's side (subtract) and a repeater's side (lock)", () => {
    const legend = {
      "#": "stone",
      L: "lever mount=floor",
      ">": "repeater facing=east",
      c: "comparator facing=south",
      r: "repeater facing=south",
      "-": "dust",
      "*": "lamp",
    };
    expect(
      codes(legend, [
        ["####", "####", "####"],
        ["L>c.", "..-.", "..*."],
      ]),
    ).not.toContain("W102 1,1,0");
    expect(
      codes(legend, [
        ["####", "####", "####"],
        ["L>r.", "..-.", "..*."],
      ]),
    ).not.toContain("W102 1,1,0");
  });

  it("still flags a diode pointing into another diode's front", () => {
    const legend = {
      "#": "stone",
      L: "lever mount=floor",
      ">": "repeater facing=east",
      "<": "repeater facing=west",
      "-": "dust",
    };
    expect(codes(legend, [["#####"], ["L><-."]])).toContain("W102 1,1,0");
  });
});

describe("W103", () => {
  it("flags stray dust on stone, far from anything", () => {
    const legend = { "#": "stone", "-": "dust" };
    expect(codes(legend, [["#####"], ["...-."]])).toContain("W103 3,1,0");
  });

  it("accepts dust that powers a torch through the block it points into (NOT gate input)", () => {
    const legend = { "#": "stone", "-": "dust", t: "torch mount=west", L: "lever mount=floor", "*": "lamp" };
    expect(codes(legend, [["######"], ["L-#t-*"]]).filter((c) => c.startsWith("W103"))).toEqual([]);
  });
});

describe("W104", () => {
  it("does not flag dust running past the support without pointing into it", () => {
    // NOT gate whose output line runs along the side of the input block and turns away.
    const legend = { "#": "stone", t: "torch mount=west", "-": "dust" };
    expect(
      codes(legend, [
        ["###", "###"],
        ["#t-", "--."],
      ]),
    ).not.toContain("W104 1,1,0");
  });

  it("flags dust that turns into the support", () => {
    const legend = { "#": "stone", t: "torch mount=west", "-": "dust" };
    expect(
      codes(legend, [
        ["###", "###", "###"],
        ["#t-", "-.-", "---"],
      ]),
    ).toContain("W104 1,1,0");
  });

  it("flags dust lying on the support", () => {
    const legend = { "#": "stone", t: "torch mount=west", "-": "dust" };
    // The torch on the west face of [0,1,0] feeds dust that climbs a step and runs back onto the support.
    expect(
      codes(legend, [
        ["###", "###"],
        ["#t-", "##-"],
        ["-..", "--."],
      ]),
    ).toContain("W104 1,1,0");
  });

  it("stays fast on a 50,000-block torch-and-dust design", () => {
    // 64 x 13 x 64: stone floors with rows of floor torches and dust between them.
    const floor = Array.from({ length: 64 }, () => "#".repeat(64));
    const parts = Array.from({ length: 64 }, (_, z) => (z % 2 === 0 ? "T-".repeat(32) : "-T".repeat(32)));
    const layers = Array.from({ length: 12 }, (_, y) => (y % 2 === 0 ? floor : parts));
    const t0 = performance.now();
    codes({ "#": "stone", "-": "dust", T: "torch mount=floor" }, layers);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});

describe("E006", () => {
  it("does not let a lever hang on a component the game would not place it on", () => {
    const legend = { "#": "stone", r: "repeater facing=east", L: "lever mount=floor" };
    expect(codes(legend, [["#"], ["r"], ["L"]])).toContain("E006 0,2,0");
  });

  it("tells you to add a layer when the support would be below layer 0", () => {
    const result = validate({
      format: "rsd/1",
      meta: { name: "Case" },
      legend: { "-": "dust" },
      layers: [["-"]],
    });
    expect(result.diagnostics.find((d) => d.code === "E006")?.hint).toMatch(
      /add one \(layers\[0\] is the bottom\)/,
    );
  });
});

describe("W101", () => {
  it("treats an unlit torch as a source (lit is only the initial state)", () => {
    const legend = { "#": "stone", t: "torch mount=floor lit=false", "-": "dust" };
    expect(codes(legend, [["#".repeat(18)], ["t" + "-".repeat(17)]])).toContain("W101 16,1,0");
  });
});
