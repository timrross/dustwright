import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

async function rsd(...args: string[]) {
  let stdout = "";
  let stderr = "";
  const { exitCode } = await run(args, {
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
  });
  return { exitCode, stdout, stderr };
}

describe("rsd --help", () => {
  it("prints usage and exits 0", async () => {
    const r = await rsd("--help");
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Usage: rsd <command>");
    expect(r.stdout).toContain("validate <file>");
  });

  it("exits 2 on an unknown command", async () => {
    const r = await rsd("frobnicate");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("unknown command");
  });

  it("exits 2 with help when no command is given", async () => {
    const r = await rsd();
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toContain("Usage:");
  });
});

describe("version", () => {
  it("matches package.json", async () => {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect((await rsd("--version")).stdout.trim()).toBe(pkg.version);
  });

  it("names the milestone for commands that are not built yet", async () => {
    const r = await rsd("sheets", "x.rsd.json", "-o", "out");
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("not implemented yet");
  });
});
