import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { VIEWER_ASSET } from "../src/commands/bundle.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "rsd-bundle-"));
async function rsd(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const { exitCode } = await run(args, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) });
  return { exitCode, stdout, stderr };
}

// The viewer asset is produced by `pnpm build`; CI builds before testing.
describe.skipIf(!existsSync(VIEWER_ASSET) && !process.env.CI)("rsd bundle", () => {
  it("writes one HTML file under 1.5 MB with one inline script and no remote URLs", async () => {
    const out = join(tmp, "not-gate.html");
    const r = await rsd("bundle", join(root, "examples/not-gate.rsd.json"), "-o", out);
    expect(r.exitCode).toBe(0);
    const html = readFileSync(out, "utf8");
    expect(Buffer.byteLength(html)).toBeLessThan(1.5 * 1024 * 1024);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toMatch(/\bsrc=|\bhref=/);
    // Only inert strings remain: the XHTML namespace three.js passes to createElementNS.
    expect([...new Set(html.match(/https?:\/\/[^"'`\s)]+/g) ?? [])]).toEqual([
      "http://www.w3.org/1999/xhtml",
    ]);
  });

  it("refuses a design with stage 1 errors (exit 1) and needs -o (exit 2)", async () => {
    const bad = join(tmp, "bad.rsd.json");
    writeFileSync(
      bad,
      JSON.stringify({ format: "rsd/1", meta: { name: "b" }, legend: { "#": "stone" }, layers: [["#?"]] }),
    );
    expect((await rsd("bundle", bad, "-o", join(tmp, "bad.html"))).exitCode).toBe(1);
    expect((await rsd("bundle", join(root, "examples/not-gate.rsd.json"))).exitCode).toBe(2);
  });
});
