import { describe, expect, it } from "vitest";
import { deriveSlug, formatSpec, isValidSlug, parseSpec, splitSpec, typedValue } from "../src/index.js";

describe("block spec grammar", () => {
  it("types values: integers (with minus), booleans, strings", () => {
    expect(typedValue("12")).toBe(12);
    expect(typedValue("-3")).toBe(-3);
    expect(typedValue("true")).toBe(true);
    expect(typedValue("false")).toBe(false);
    expect(typedValue("east")).toBe("east");
  });

  it("splits a spec into type and pairs", () => {
    expect(splitSpec("repeater facing=east delay=2").raw).toEqual({
      type: "repeater",
      pairs: [
        ["facing", "east"],
        ["delay", 2],
      ],
    });
  });

  it.each([
    ["double space", "repeater  facing=east"],
    ["leading space", " repeater"],
    ["trailing space", "repeater "],
    ["newline", "repeater\nfacing=east"],
    ["uppercase", "Repeater"],
    ["no value", "repeater facing"],
    ["empty value", "repeater facing="],
    ["repeated key", "repeater delay=1 delay=2"],
    ["too long token", `repeater facing=${"e".repeat(33)}`],
  ])("rejects %s with E005", (_n, spec) => {
    expect(splitSpec(spec).diagnostics[0]?.code).toBe("E005");
  });

  it("rejects a spec over 200 characters with E013", () => {
    expect(splitSpec(`stone${" a=b".repeat(49)}`).diagnostics[0]?.code).toBe("E013");
    expect(splitSpec(`stone${" a=b".repeat(48)}`).diagnostics[0]?.code).not.toBe("E013");
  });

  it("checks the registry's domain for the value's kind", () => {
    expect(parseSpec("repeater delay=2", "bedrock").block?.states.delay).toBe(2);
    expect(parseSpec("repeater delay=two", "bedrock").diagnostics[0]?.code).toBe("E005");
    expect(parseSpec("repeater delay=5", "bedrock").diagnostics[0]?.hint).toContain("1, 2, 3, 4");
    expect(parseSpec("lever on=1", "bedrock").diagnostics[0]?.code).toBe("E005");
  });

  it("round-trips through formatSpec", () => {
    const { block } = parseSpec("comparator mode=subtract facing=west", "bedrock");
    expect(formatSpec(block!)).toBe("comparator facing=west mode=subtract powered=false");
  });
});

describe("slugs", () => {
  it.each([
    ["NOT gate", "not-gate"],
    ["../../evil", "evil"],
    ["  2x2  Piston Door!! ", "2x2-piston-door"],
    ["Ünïcödé", "n-c-d"],
    ["🧱", ""],
  ])("derives %j as %j", (name, slug) => {
    expect(deriveSlug(name)).toBe(slug);
  });

  it("validates explicit slugs", () => {
    expect(isValidSlug("not-gate")).toBe(true);
    expect(isValidSlug("a".repeat(48))).toBe(true);
    for (const bad of ["", "a".repeat(49), "-a", "a-", "a--b", "A", "a_b", "a/b", ".."])
      expect(isValidSlug(bad)).toBe(false);
  });
});

describe("printable", () => {
  it("escapes control characters and caps length", async () => {
    const { printable } = await import("../src/index.js");
    expect(printable("a\nb\u0000")).toBe("a\\u000ab\\u0000");
    expect(printable("x".repeat(70), 60)).toBe(`${"x".repeat(60)}…`);
  });
});
