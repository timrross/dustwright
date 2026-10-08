import { readFile, stat } from "node:fs/promises";
import { LIMITS } from "@dustwright/core";

/** A file read that failed for a reason the CLI reports with exit code 2, or a size-limit refusal (E013). */
export type ReadOutcome =
  | { ok: true; text: string }
  | { ok: false; kind: "io"; message: string }
  | { ok: false; kind: "limit"; message: string };

/** Reads a design file, refusing files over the size limit before reading them into memory. */
export async function readDesignFile(path: string): Promise<ReadOutcome> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { ok: false, kind: "io", message: `${path} is not a file` };
    if (info.size > LIMITS.fileBytes) {
      return {
        ok: false,
        kind: "limit",
        message: `Design is larger than the file size limit of ${LIMITS.fileBytes} bytes (2 MB)`,
      };
    }
    return { ok: true, text: await readFile(path, "utf8") };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return {
      ok: false,
      kind: "io",
      message: code === "ENOENT" ? `${path}: no such file` : `${path}: ${(err as Error).message}`,
    };
  }
}
