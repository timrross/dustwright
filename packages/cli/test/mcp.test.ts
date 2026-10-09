import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const bin = join(root, "packages/cli/dist/bin.js");

/** Talks to `rsd mcp` over stdio: sends each request, collects one reply per request with an id. */
async function session(requests: object[]): Promise<Record<string, unknown>[]> {
  const child = spawn(process.execPath, [bin, "mcp"], { stdio: ["pipe", "pipe", "pipe"] });
  let buffer = "";
  const replies: Record<string, unknown>[] = [];
  const expected = requests.filter((r) => "id" in r).length;
  const done = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        replies.push(JSON.parse(buffer.slice(0, nl)) as Record<string, unknown>);
        buffer = buffer.slice(nl + 1);
        if (replies.length === expected) resolve();
      }
    });
    child.on("error", reject);
    setTimeout(() => reject(new Error("rsd mcp did not answer")), 20_000);
  });
  for (const r of requests) child.stdin.write(`${JSON.stringify(r)}\n`);
  await done;
  child.stdin.end();
  await new Promise((r) => child.on("close", r));
  return replies;
}

// CI builds before it tests; locally, run pnpm build first.
describe.skipIf(!existsSync(bin) && !process.env.CI)("rsd mcp over stdio", () => {
  it("initializes, lists tools, validates and writes a pack, then exits when stdin closes", async () => {
    const out = mkdtempSync(join(tmpdir(), "rsd-mcp-"));
    const notGate = readFileSync(join(root, "examples/not-gate.rsd.json"), "utf8");
    const replies = await session([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "validate", arguments: { design: notGate } },
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "pack", arguments: { design: notGate, output: join(out, "n.mcpack") } },
      },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "authoring_guide", arguments: {} } },
    ]);
    expect(replies.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
    expect(replies[0]).toMatchObject({ result: { serverInfo: { name: "dustwright" } } });
    const text = (i: number) =>
      JSON.parse((replies[i] as { result: { content: { text: string }[] } }).result.content[0]!.text);
    expect(text(2)).toEqual({ ok: true, diagnostics: [] });
    expect(text(3)).toMatchObject({ ok: true });
    expect(existsSync(join(out, "n.mcpack"))).toBe(true);
    expect(text(4).guide).toContain("# Authoring Dustwright designs");
  });
});
