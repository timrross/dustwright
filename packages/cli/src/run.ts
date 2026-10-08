import { parseArgs } from "node:util";
import { bundleCommand } from "./commands/bundle.js";
import { registryDumpCommand } from "./commands/registry.js";
import { validateCommand } from "./commands/validate.js";
import { HELP_TEXT, VERSION } from "./help.js";

/** Output sinks for a CLI run. Tests capture them; the binary wires them to the process streams. */
export interface RunIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Result of a CLI run: the process exit code (0 ok, 1 validation errors, 2 usage or I/O error). */
export interface RunResult {
  exitCode: 0 | 1 | 2;
}

/** Commands listed in the help that later milestones implement, with the milestone that brings each. */
const PLANNED_COMMANDS: Readonly<Record<string, string>> = {
  export: "M3",
  sheets: "M7",
  pack: "M7",
  mcp: "M8",
};

function usage(io: RunIO, message: string): RunResult {
  io.stderr(`rsd: ${message}\nRun rsd --help for usage.\n`);
  return { exitCode: 2 };
}

/**
 * Runs the CLI with the given arguments (without the node and script paths).
 * Never throws: usage errors are reported on stderr with exit code 2.
 */
export async function run(argv: readonly string[], io: RunIO): Promise<RunResult> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        json: { type: "boolean" },
        strict: { type: "boolean" },
        output: { type: "string", short: "o" },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    return usage(io, (err as Error).message);
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
        if (args.length !== 1) return usage(io, "validate takes exactly one file");
        return await validateCommand(
          args[0] as string,
          { json: values.json ?? false, strict: values.strict ?? false },
          io,
        );
      }
      case "bundle": {
        if (args.length !== 1) return usage(io, "bundle takes exactly one file and -o <html>");
        return await bundleCommand(args[0] as string, values.output, io);
      }
      case "registry": {
        if (args[0] !== "dump" || args.length !== 1) return usage(io, 'registry takes the subcommand "dump"');
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
