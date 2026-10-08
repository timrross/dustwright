import { describe, expect, it } from "vitest";
// @ts-expect-error: plain ESM script without type declarations
import { allowed } from "../scripts/check-licenses.mjs";

describe("licence allowlist", () => {
  it.each(["MIT", "Apache-2.0", "(MIT OR GPL-3.0)", "ISC AND MIT", "MIT AND (ISC OR GPL-3.0)"])(
    "accepts %s",
    (expr) => {
      expect(allowed(expr)).toBe(true);
    },
  );
  it.each([
    "GPL-3.0",
    "AGPL-3.0-only",
    "UNLICENSED",
    "MIT AND GPL-2.0",
    "SSPL-1.0",
    "GPL-3.0 AND (MIT OR Apache-2.0)",
    "(MIT",
    "",
  ])("rejects %s", (expr) => {
    expect(allowed(expr)).toBe(false);
  });
});
