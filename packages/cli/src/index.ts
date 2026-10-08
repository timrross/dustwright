/**
 * @packageDocumentation
 * The Dustwright CLI (`dustwright`, alias `rsd`). The binary entry point is `bin.ts`; this module exposes
 * `run` so tests can drive the CLI without spawning a process. Command logic lives in the packages it belongs
 * to (validator, export, ...), so the CLI and the MCP server are both thin adapters over the same functions.
 */

export { run, type RunIO, type RunResult } from "./run.js";
export { HELP_TEXT, VERSION } from "./help.js";
