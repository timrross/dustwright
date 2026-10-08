import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LIMITS } from "@dustwright/core";
import { decodeFragment, encodeFragment, shareFragment } from "../src/fragment.js";

const notGate = readFileSync(
  fileURLToPath(new URL("../../../examples/not-gate.rsd.json", import.meta.url)),
  "utf8",
);

describe("share fragments", () => {
  it("round-trips a design through #d= (deflate + base64url, URL-safe)", async () => {
    const fragment = await encodeFragment(notGate);
    expect(fragment).toMatch(/^d=[A-Za-z0-9_-]+$/);
    expect(await decodeFragment(`#${fragment}`)).toEqual({ text: notGate });
  });

  it("reads #json= links written by hand", async () => {
    expect(await decodeFragment(`#json=${encodeURIComponent(notGate)}`)).toEqual({ text: notGate });
  });

  it("opens a fragment of exactly 64 KB and refuses one byte more with E013", async () => {
    const pad = (n: number) => `json=${encodeURIComponent(notGate)}${"%20".repeat(n)}`;
    const base = pad(0).length;
    const fits = pad(Math.floor((LIMITS.fragmentBytes - base) / 3));
    expect(fits.length).toBeLessThanOrEqual(LIMITS.fragmentBytes);
    expect(await decodeFragment(fits)).toHaveProperty("text");
    const over = `${fits}${"x".repeat(LIMITS.fragmentBytes - fits.length + 1)}`;
    expect(await decodeFragment(over)).toMatchObject({ error: { code: "E013" } });
  });

  it("stops inflating at the 2 MB file limit (a small link cannot become a huge design)", async () => {
    const bomb = await encodeFragment(" ".repeat(LIMITS.fileBytes + 10));
    expect(bomb.length).toBeLessThan(LIMITS.fragmentBytes);
    expect(await decodeFragment(bomb)).toMatchObject({ error: { code: "E013" } });
  });

  it("reports a damaged link and ignores anything else", async () => {
    expect(await decodeFragment("#d=!!!")).toMatchObject({ error: { code: "E001" } });
    expect(await decodeFragment("#json=%E0%A4%A")).toMatchObject({ error: { code: "E001" } });
    expect(await decodeFragment("#section-2")).toBeNull();
    expect(await decodeFragment("")).toBeNull();
  });

  it("refuses to make a link for a design over 64 KB compressed", async () => {
    const noisy = JSON.stringify({
      pad: Array.from({ length: 30000 }, (_, i) => (i * 2654435761) % 1000003),
    });
    expect(await shareFragment(noisy)).toMatchObject({ error: { code: "E013" } });
    expect(await shareFragment(notGate)).toHaveProperty("fragment");
  });
});
