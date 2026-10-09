import { ArgumentError, TOOLS } from "./tools.js";
import type { McpHost } from "./tools.js";

/**
 * A Model Context Protocol server over stdio: JSON-RPC 2.0, one message per line. It answers `initialize`,
 * `ping`, `tools/list` and `tools/call`; notifications get no reply. No network transport, ever.
 */

/** The protocol versions this server speaks; it answers with the client's when it is one of these. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

type Json = Record<string, unknown>;

const reply = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const failure = (id: unknown, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

/** Handles one parsed JSON-RPC message; returns the reply, or null for a notification. */
export async function handleMessage(message: unknown, host: McpHost, version: string): Promise<Json | null> {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return failure(null, -32600, "Invalid request");
  }
  const m = message as Json;
  const id = m.id;
  const isNotification = !("id" in m);
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") {
    return isNotification ? null : failure(id ?? null, -32600, "Invalid request");
  }
  const params = (typeof m.params === "object" && m.params !== null ? m.params : {}) as Json;
  switch (m.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked)
        ? asked
        : PROTOCOL_VERSIONS[0];
      return reply(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "dustwright", version },
      });
    }
    case "ping":
      return isNotification ? null : reply(id, {});
    case "tools/list":
      return reply(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return failure(id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = (
        typeof params.arguments === "object" && params.arguments !== null ? params.arguments : {}
      ) as Json;
      try {
        const { result, isError } = await tool.run(args, host);
        return reply(id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: isError === true,
        });
      } catch (err) {
        const text =
          err instanceof ArgumentError ? err.message : `${tool.name} failed: ${(err as Error).message}`;
        return reply(id, {
          content: [{ type: "text", text: JSON.stringify({ error: text }) }],
          isError: true,
        });
      }
    }
    default:
      return isNotification ? null : failure(id, -32601, `Method not found: ${m.method}`);
  }
}

/**
 * Serves MCP over a line stream (stdin) until it ends, writing one JSON reply per line. Lines longer than 4 MB are
 * refused (a design is at most 2 MB). Requests are answered in order.
 */
export async function serveLines(
  lines: AsyncIterable<string>,
  write: (line: string) => void,
  host: McpHost,
  version: string,
): Promise<void> {
  for await (const line of lines) {
    if (line.trim() === "") continue;
    let message: unknown;
    if (line.length > 4 * 1024 * 1024) {
      write(JSON.stringify(failure(null, -32600, "Message too large")));
      continue;
    }
    try {
      message = JSON.parse(line);
    } catch {
      write(JSON.stringify(failure(null, -32700, "Parse error")));
      continue;
    }
    const answer = await handleMessage(message, host, version);
    if (answer) write(JSON.stringify(answer));
  }
}
