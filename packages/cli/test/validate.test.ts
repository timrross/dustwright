import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderMappingDoc } from "@dustwright/core";
import { run } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const example = join(root, "examples/not-gate.rsd.json");
const tmp = mkdtempSync(join(tmpdir(), "rsd-cli-"));

async function rsd(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const { exitCode } = await run(args, { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) });
  return { exitCode, stdout, stderr };
}

describe("rsd validate", () => {
  it("exits 0 on a valid design (warnings allowed) and prints positions and hints", async () => {
    const r = await rsd("validate", example);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("W108 warning");
    expect(r.stdout).toContain("hint:");
  });

  it("--json prints exactly one JSON document on stdout", async () => {
    const r = await rsd("validate", example, "--json");
    const doc = JSON.parse(r.stdout) as { ok: boolean; diagnostics: unknown[] };
    expect(doc.ok).toBe(true);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
  });

  it("--strict exits 1 on warnings", async () => {
    expect((await rsd("validate", example, "--strict")).exitCode).toBe(1);
  });

  it("exits 1 on validation errors", async () => {
    const bad = join(tmp, "bad.rsd.json");
    writeFileSync(
      bad,
      JSON.stringify({ format: "rsd/1", meta: { name: "b" }, legend: { "#": "stone" }, layers: [["#?"]] }),
    );
    const r = await rsd("validate", bad, "--json");
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics[0]).toMatchObject({ code: "E003", pos: [1, 0, 0] });
  });

  it("refuses a file over 2 MB with E013 without parsing it", async () => {
    const big = join(tmp, "big.rsd.json");
    writeFileSync(big, " ".repeat(2 * 1024 * 1024 + 1));
    const r = await rsd("validate", big, "--json");
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).diagnostics[0].code).toBe("E013");
  });

  it("--json still prints one JSON document when the file cannot be read", async () => {
    const r = await rsd("validate", join(tmp, "missing.json"), "--json");
    expect(r.exitCode).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({
      ok: false,
      diagnostics: [],
      error: expect.stringContaining("no such file"),
    });
  });

  it("exits 2 on a missing file, a directory, or bad usage", async () => {
    expect((await rsd("validate", join(tmp, "missing.json"))).exitCode).toBe(2);
    expect((await rsd("validate", tmp)).exitCode).toBe(2);
    expect((await rsd("validate")).exitCode).toBe(2);
    expect((await rsd("validate", example, "--bogus")).exitCode).toBe(2);
  });
});

describe("rsd registry dump", () => {
  it("prints the mapping table, or writes it only where told", async () => {
    const r = await rsd("registry", "dump");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe(renderMappingDoc("bedrock"));
    const out = join(tmp, "mapping.md");
    expect((await rsd("registry", "dump", "-o", out)).exitCode).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(renderMappingDoc("bedrock"));
  });

  it("exits 2 on a bad subcommand", async () => {
    expect((await rsd("registry", "list")).exitCode).toBe(2);
  });
});
