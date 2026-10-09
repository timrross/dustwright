import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateText } from "@dustwright/validator";
import { handleMessage, serveLines, TOOLS } from "../src/index.js";
import type { McpHost } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const notGate = readFileSync(`${root}examples/not-gate.rsd.json`, "utf8");
const written = new Map<string, Uint8Array | string>();
const host: McpHost = {
  authoringGuide: async () => readFileSync(`${root}AUTHORING.md`, "utf8"),
  patterns: async () =>
    readdirSync(`${root}patterns`)
      .filter((f) => f.endsWith(".rsd.json"))
      .map((f) => ({
        slug: f.replace(/\.rsd\.json$/, ""),
        text: readFileSync(`${root}patterns/${f}`, "utf8"),
      })),
  viewerBundle: async () => "/* viewer */",
  writeFile: async (path, data) => void written.set(path, data),
  directory: async (dir, name) => `${dir}/${name}`,
  writeIntoPack: async (packRoot, files) => files.map((f) => `${packRoot}/${f.path}`),
};

let nextId = 1;
async function call(name: string, args: Record<string, unknown> = {}) {
  const reply = (await handleMessage(
    { jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } },
    host,
    "0.0.0",
  )) as { result: { content: { type: string; text: string }[]; isError: boolean } };
  return {
    ...reply.result,
    json: JSON.parse(reply.result.content[0]?.text ?? "null") as Record<string, unknown>,
  };
}

describe("MCP protocol", () => {
  it("initializes with the client's protocol version and advertises tools", async () => {
    const reply = await handleMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {} },
      },
      host,
      "1.2.3",
    );
    expect(reply).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "dustwright", version: "1.2.3" },
      },
    });
  });

  it("lists every tool with a description and an object input schema", async () => {
    const reply = (await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, host, "0")) as {
      result: { tools: { name: string; description: string; inputSchema: { type: string } }[] };
    };
    expect(reply.result.tools.map((t) => t.name)).toEqual([
      "authoring_guide",
      "validate",
      "simulate",
      "list_patterns",
      "get_pattern",
      "bundle",
      "export",
      "pack",
      "sheets",
    ]);
    for (const t of reply.result.tools) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("answers notifications with nothing and unknown methods with an error", async () => {
    expect(
      await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, host, "0"),
    ).toBeNull();
    expect(await handleMessage({ jsonrpc: "2.0", id: 9, method: "resources/list" }, host, "0")).toMatchObject(
      {
        error: { code: -32601 },
      },
    );
    expect(await handleMessage([1, 2], host, "0")).toMatchObject({ error: { code: -32600 } });
  });

  it("serves lines in order and reports unparsable ones", async () => {
    const out: string[] = [];
    async function* lines() {
      yield '{"jsonrpc":"2.0","id":1,"method":"ping"}';
      yield "{not json";
      yield "";
      yield '{"jsonrpc":"2.0","method":"notifications/initialized"}';
      yield '{"jsonrpc":"2.0","id":2,"method":"ping"}';
    }
    await serveLines(lines(), (l) => out.push(l), host, "0");
    expect(out.map((l) => JSON.parse(l))).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { jsonrpc: "2.0", id: 2, result: {} },
    ]);
  });
});

describe("MCP tools: the CLI's JSON shapes", () => {
  it("validate returns {ok, diagnostics} like rsd validate --json", async () => {
    const good = await call("validate", { design: notGate });
    expect(good.isError).toBe(false);
    expect(good.json).toEqual({ ok: true, diagnostics: [] });
    const bad = await call("validate", { design: notGate.replace('"L-#t*"', '"L-?t*"') });
    expect(bad.json).toMatchObject({ ok: false, diagnostics: [{ code: "E003" }] });
  });

  it("simulate reports each case with its actual outputs", async () => {
    const r = await call("simulate", { design: notGate });
    expect(r.json).toMatchObject({
      ok: true,
      cases: [
        { index: 0, status: "pass", actual: { out: 1 } },
        { index: 1, status: "pass", actual: { out: 0 } },
      ],
    });
    const wrong = notGate.replace('"expect": { "out": 0 }', '"expect": { "out": 1 }');
    expect(wrong).not.toBe(notGate);
    expect((await call("simulate", { design: wrong })).json).toMatchObject({ ok: false });
  });

  it("simulate agrees with validate: the same cases, simulated once against the design's one budget", async () => {
    const design = readFileSync(`${root}patterns/rs-latch.rsd.json`, "utf8");
    const checked = validateText(design);
    const r = (await call("simulate", { design })).json as { cases: { status: string; actual: unknown }[] };
    expect(r.cases.map((c) => c.status)).toEqual(checked.cases?.map((c) => c?.status ?? "budget"));
    expect(r.cases.map((c) => c.actual)).toEqual(checked.cases?.map((c) => c?.actual ?? {}));
  });

  it("lists the pattern library and returns a pattern that validates", async () => {
    const list = (await call("list_patterns")).json as { patterns: { slug: string }[] };
    expect(list.patterns.map((p) => p.slug)).toContain("xor-gate");
    expect(list.patterns).toHaveLength(13);
    const xor = (await call("get_pattern", { slug: "xor-gate" })).json as { design: string };
    expect((await call("validate", { design: xor.design })).json).toMatchObject({ ok: true });
    expect((await call("get_pattern", { slug: "nope" })).isError).toBe(true);
  });

  it("export, pack, bundle and sheets write through the host", async () => {
    expect((await call("export", { design: notGate, to: "mcfunction", pack: "/p" })).json).toMatchObject({
      ok: true,
      files: ["/p/functions/rsd/not-gate.mcfunction"],
    });
    expect((await call("pack", { design: notGate, output: "/o/x.mcpack" })).json).toMatchObject({ ok: true });
    expect(written.get("/o/x.mcpack")).toBeInstanceOf(Uint8Array);
    expect((await call("bundle", { design: notGate, output: "/o/x.html" })).json).toMatchObject({ ok: true });
    expect(String(written.get("/o/x.html"))).toContain("/* viewer */");
    expect((await call("sheets", { design: notGate, output: "/s" })).json).toMatchObject({
      ok: true,
      files: ["/s/not-gate-layer-000.svg", "/s/not-gate-layer-001.svg"],
    });
  });

  it("writes only files of the tool's own type", async () => {
    const before = written.size;
    for (const [tool, output] of [
      ["bundle", "/home/u/.bashrc"],
      ["bundle", "/o/x.mcpack"],
      ["pack", "/o/run.sh"],
      ["pack", "/o/x.html"],
    ] as const) {
      const r = await call(tool, { design: notGate, output });
      expect(r.isError, `${tool} ${output}`).toBe(true);
    }
    expect(written.size).toBe(before);
  });

  it("refuses bad arguments as a tool error, not a crash", async () => {
    const r = await call("validate", { design: 42 });
    expect(r.isError).toBe(true);
    expect(r.json).toEqual({ error: '"design" must be a non-empty string' });
    expect(
      (await call("export", { design: notGate, to: "mcfunction", pack: "/p", origin: [1, "x", 2] })).isError,
    ).toBe(true);
  });

  it("keeps every tool description self-contained (they are an agent's only instructions)", () => {
    const text = TOOLS.map((t) => t.description).join(" ");
    expect(text).toContain("authoring");
    expect(text).toMatch(/never change ports or tests/i);
  });
});
