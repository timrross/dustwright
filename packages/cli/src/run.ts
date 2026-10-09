import { parseArgs } from "node:util";
import { bundleCommand } from "./commands/bundle.js";
import { packCommand, sheetsCommand } from "./commands/pack.js";
import { exportCommand, exportListCommand } from "./commands/export.js";
import { mcpCommand } from "./commands/mcp.js";
import { registryDumpCommand } from "./commands/registry.js";
import { validateCommand } from "./commands/validate.js";
import { HELP_TEXT, VERSION } from "./help.js";

/** Output sinks for a CLI run. Tests capture them; the binary wires them to the process streams. */
export interface RunIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Environment variables the CLI reads (only RSD_PACK_DIR). */
  env?: Readonly<Record<string, string | undefined>>;
  /** Input lines, for `rsd mcp` (the binary wires stdin). */
  stdin?: AsyncIterable<string>;
}

/** Result of a CLI run: the process exit code (0 ok, 1 validation errors, 2 usage or I/O error). */
export interface RunResult {
  exitCode: 0 | 1 | 2;
}

/** Commands listed in the help that later milestones implement, with the milestone that brings each. */
const PLANNED_COMMANDS: Readonly<Record<string, string>> = {};

function usage(io: RunIO, json: boolean, message: string): RunResult {
  io.stderr(`rsd: ${message}\nRun rsd --help for usage.\n`);
  // With --json, stdout always carries exactly one JSON document, usage errors included.
  if (json) io.stdout(`${JSON.stringify({ ok: false, diagnostics: [], error: message })}\n`);
  return { exitCode: 2 };
}

/**
 * Runs the CLI with the given arguments (without the node and script paths).
 * Never throws: usage errors are reported on stderr with exit code 2.
 */
export async function run(argv: readonly string[], io: RunIO): Promise<RunResult> {
  const wantsJson = argv.includes("--json");
  let parsed;
  try {
    parsed = parseArgs({
      args: joinOrigin(argv),
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        json: { type: "boolean" },
        strict: { type: "boolean" },
        output: { type: "string", short: "o" },
        to: { type: "string" },
        pack: { type: "string" },
        clear: { type: "boolean" },
        origin: { type: "string" },
        "command-limit": { type: "string" },
        list: { type: "boolean" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    return usage(io, wantsJson, (err as Error).message);
  }
  const { values, positionals } = parsed;
  const [command, ...args] = positionals;
  if (values.version) {
    io.stdout(`${VERSION}\n`);
    return { exitCode: 0 };
  }
  if (values.help || command === undefined || command === "help") {
    io.stdout(HELP_TEXT);
    return { exitCode: command === undefined && !values.help ? 2 : 0 };
  }
  try {
    switch (command) {
      case "validate": {
        if (args.length !== 1) return usage(io, wantsJson, "validate takes exactly one file");
        return await validateCommand(
          args[0] as string,
          { json: values.json ?? false, strict: values.strict ?? false },
          io,
        );
      }
      case "export": {
        if (values.list) return exportListCommand(io);
        if (args.length !== 1) return usage(io, wantsJson, "export takes exactly one file");
        let origin: [number, number, number] | undefined;
        if (values.origin !== undefined) {
          const parts = values.origin.split(",").map((n) => Number(n));
          if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || Math.abs(n) > 30_000_000)) {
            return usage(io, wantsJson, "--origin takes three integers: --origin x y z");
          }
          origin = parts as [number, number, number];
        }
        let commandLimit: number | undefined;
        if (values["command-limit"] !== undefined) {
          commandLimit = /^[1-9]\d{0,8}$/.test(values["command-limit"])
            ? Number(values["command-limit"])
            : NaN;
          if (!Number.isInteger(commandLimit) || commandLimit < 1)
            return usage(io, wantsJson, "--command-limit takes a positive integer");
        }
        return await exportCommand(
          args[0] as string,
          {
            to: values.to,
            pack: values.pack,
            clear: values.clear ?? false,
            origin,
            commandLimit,
            json: values.json ?? false,
          },
          io,
        );
      }
      case "pack": {
        if (args.length !== 1)
          return usage(io, wantsJson, "pack takes exactly one file and -o <file.mcpack>");
        return await packCommand(args[0] as string, values.output, io);
      }
      case "sheets": {
        if (args.length !== 1) return usage(io, wantsJson, "sheets takes exactly one file and -o <dir>");
        return await sheetsCommand(args[0] as string, values.output, io);
      }
      case "bundle": {
        if (args.length !== 1) return usage(io, wantsJson, "bundle takes exactly one file and -o <html>");
        return await bundleCommand(args[0] as string, values.output, io);
      }
      case "mcp": {
        if (args.length !== 0) return usage(io, wantsJson, "mcp takes no arguments");
        return await mcpCommand(io);
      }
      case "registry": {
        if (args[0] !== "dump" || args.length !== 1)
          return usage(io, wantsJson, 'registry takes the subcommand "dump"');
        return await registryDumpCommand(values.output, io);
      }
    }
  } catch (err) {
    io.stderr(`rsd: ${(err as Error).message}\n`);
    return { exitCode: 2 };
  }
  const planned = PLANNED_COMMANDS[command];
  if (planned !== undefined) {
    io.stderr(`rsd: "${command}" is not implemented yet (arrives in ${planned}).\n`);
    return { exitCode: 2 };
  }
  io.stderr(`rsd: unknown command "${command}". Run rsd --help.\n`);
  return { exitCode: 2 };
}

/** `--origin x y z` takes three values; parseArgs takes one, so join them as `x,y,z` first. */
function joinOrigin(argv: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (
      a === "--origin" &&
      i + 3 < argv.length &&
      [1, 2, 3].every((k) => /^-?\d+$/.test(argv[i + k] ?? ""))
    ) {
      // The = form, because parseArgs refuses a separate value that starts with "-".
      out.push(`--origin=${argv[i + 1]},${argv[i + 2]},${argv[i + 3]}`);
      i += 3;
    } else out.push(a);
  }
  return out;
}
