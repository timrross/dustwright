import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serveLines } from "@dustwright/mcp";
import type { McpHost } from "@dustwright/mcp";
import { VERSION } from "../help.js";
import { writeIntoPack } from "../pack-write.js";
import type { RunIO, RunResult } from "../run.js";
import { VIEWER_ASSET } from "./bundle.js";

const ASSETS = new URL("../../assets/", import.meta.url);

/** The MCP host for this machine: the files the CLI ships with, and the same safe writers the commands use. */
export const nodeHost: McpHost = {
  authoringGuide: () => readFile(new URL("AUTHORING.md", ASSETS), "utf8"),
  async patterns() {
    const dir = new URL("patterns/", ASSETS);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".rsd.json")).sort();
    return Promise.all(
      files.map(async (f) => ({
        slug: f.replace(/\.rsd\.json$/, ""),
        text: await readFile(new URL(f, dir), "utf8"),
      })),
    );
  },
  viewerBundle: () => readFile(VIEWER_ASSET, "utf8"),
  writeFile: (path, data) => writeFile(path, data),
  async directory(dir, name) {
    await mkdir(dir, { recursive: true });
    return join(dir, name);
  },
  writeIntoPack,
};

/** `rsd mcp`: serves the toolchain as MCP tools over stdin and stdout until stdin closes. Logs go to stderr. */
export async function mcpCommand(io: RunIO): Promise<RunResult> {
  if (!io.stdin) {
    io.stderr("rsd: mcp needs a stdin stream\n");
    return { exitCode: 2 };
  }
  io.stderr(`dustwright ${VERSION} MCP server on stdio\n`);
  await serveLines(io.stdin, (line) => io.stdout(`${line}\n`), nodeHost, VERSION);
  return { exitCode: 0 };
}
