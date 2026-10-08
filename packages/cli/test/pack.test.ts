import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const example = (name: string) => join(root, "examples", `${name}.rsd.json`);
const tmp = () => mkdtempSync(join(tmpdir(), "rsd-pack-"));

async function rsd(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const { exitCode } = await run(args, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) });
  return { exitCode, stdout, stderr };
}

describe("rsd pack", () => {
  it("writes a .mcpack with the manifest, function and structure, and prints its path", async () => {
    const out = join(tmp(), "not-gate.mcpack");
    const r = await rsd("pack", example("not-gate"), "-o", out);
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe(out);
    expect(Object.keys(unzipSync(readFileSync(out)))).toEqual([
      "manifest.json",
      "functions/rsd/not-gate.mcfunction",
      "structures/rsd/not-gate.mcstructure",
    ]);
  });

  it("refuses a design with errors (exit 1) and needs -o (exit 2)", async () => {
    const dir = tmp();
    const bad = join(dir, "bad.rsd.json");
    writeFileSync(
      bad,
      JSON.stringify({ format: "rsd/1", meta: { name: "b" }, legend: { "-": "dust" }, layers: [["-"]] }),
    );
    expect((await rsd("pack", bad, "-o", join(dir, "b.mcpack"))).exitCode).toBe(1);
    expect(readdirSync(dir)).toEqual(["bad.rsd.json"]);
    expect((await rsd("pack", example("not-gate"))).exitCode).toBe(2);
  });
});

describe("rsd sheets", () => {
  it("writes one SVG per layer into the directory and prints every path", async () => {
    const dir = join(tmp(), "sheets");
    const r = await rsd("sheets", example("piston-door-2x2"), "-o", dir);
    expect(r.exitCode).toBe(0);
    const files = readdirSync(dir).sort();
    expect(files).toEqual([0, 1, 2, 3].map((y) => `2x2-piston-door-layer-00${y}.svg`));
    expect(
      r.stdout
        .trim()
        .split("\n")
        .map((l) => l.replace(`${dir}/`, "")),
    ).toEqual(files);
  });
});
