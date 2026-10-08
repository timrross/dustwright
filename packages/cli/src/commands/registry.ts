import { writeFile } from "node:fs/promises";
import { renderMappingDoc } from "@dustwright/core";
import type { RunIO, RunResult } from "../run.js";

/** `rsd registry dump [-o <file>]`: prints the Bedrock mapping table, or writes it where told. */
export async function registryDumpCommand(out: string | undefined, io: RunIO): Promise<RunResult> {
  const doc = renderMappingDoc("bedrock");
  if (out === undefined) {
    io.stdout(doc);
    return { exitCode: 0 };
  }
  try {
    await writeFile(out, doc);
    io.stderr(`wrote ${out}\n`);
    return { exitCode: 0 };
  } catch (err) {
    io.stderr(`rsd: cannot write ${out}: ${(err as Error).message}\n`);
    return { exitCode: 2 };
  }
}
