#!/usr/bin/env node
import { createInterface } from "node:readline";
import { run } from "./run.js";

const { exitCode } = await run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  env: { RSD_PACK_DIR: process.env.RSD_PACK_DIR },
  // Created only when a command reads it (rsd mcp), so other commands never hold stdin open.
  stdin: {
    [Symbol.asyncIterator]: () =>
      createInterface({ input: process.stdin, crlfDelay: Infinity })[Symbol.asyncIterator](),
  },
});
process.exitCode = exitCode;
