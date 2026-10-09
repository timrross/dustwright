/**
 * @packageDocumentation
 * MCP server over stdio exposing the Dustwright toolchain to agents: the authoring guide, validate, simulate, the
 * pattern library, bundle, export, pack and sheets, with the same JSON shapes as the CLI. `rsd mcp` runs it.
 */

/** Name of this package, exposed so consumers and tests can confirm the wiring. */
export const PACKAGE_NAME = "@dustwright/mcp";

export { handleMessage, PROTOCOL_VERSIONS, serveLines } from "./server.js";
export { ArgumentError, TOOLS } from "./tools.js";
export type { McpHost, Tool, ToolResult } from "./tools.js";
