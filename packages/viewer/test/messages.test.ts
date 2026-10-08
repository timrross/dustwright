import { describe, expect, it } from "vitest";
import { parseAllowedOrigins, parseCommand } from "../src/index.js";

describe("inbound commands", () => {
  it("accepts exactly the documented shapes", () => {
    expect(parseCommand({ type: "setStep", step: 2 })).toEqual({ type: "setStep", step: 2 });
    expect(parseCommand({ type: "setLayer", layer: 0 })).toEqual({ type: "setLayer", layer: 0 });
    expect(parseCommand({ type: "setMode", mode: "instructions" })).toEqual({
      type: "setMode",
      mode: "instructions",
    });
  });

  it.each([
    null,
    "setStep",
    [],
    { type: "setStep" },
    { type: "setStep", step: "2" },
    { type: "setStep", step: 1.5 },
    { type: "setStep", step: 2, extra: true },
    { type: "setLayer", step: 2 },
    { type: "setMode", mode: "edit" },
    { type: "eval", code: "alert(1)" },
    Object.assign(Object.create({ type: "setStep" }), { step: 1 }),
    JSON.parse('{"type":"setStep","step":1,"__proto__":{"x":1}}'),
  ])("ignores %j", (data) => {
    expect(parseCommand(data)).toBeNull();
  });
});

describe("allowed-origins", () => {
  it("keeps http(s) origins, normalised and de-duplicated", () => {
    expect(
      parseAllowedOrigins("https://minecraft.wiki  https://minecraft.wiki/w/Page, http://127.0.0.1:4320"),
    ).toEqual(["https://minecraft.wiki", "http://127.0.0.1:4320"]);
  });

  it("drops anything else, the wildcard included", () => {
    expect(parseAllowedOrigins("* null file:///x javascript:alert(1) not-a-url")).toEqual([]);
    expect(parseAllowedOrigins(null)).toEqual([]);
  });
});
