import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { join, sep } from "node:path";

/**
 * Exporters may write only these paths inside a pack: two directories, a slug file name, and the extension that
 * belongs to the directory (`_clear` exists only for functions).
 */
export const PACK_PATH =
  /^(functions\/rsd\/[a-z0-9]+(-[a-z0-9]+)*(_clear)?\.mcfunction|structures\/rsd\/[a-z0-9]+(-[a-z0-9]+)*\.mcstructure)$/;

/** A refusal to write, reported with exit code 2. */
export class PackWriteError extends Error {}

/**
 * Writes exporter output into a pack. Nothing is written unless every path passes the checks (directories may
 * already have been created by then); a rename failing part-way leaves the files before it written. The pack root must already exist and is resolved first. Every
 * path is checked before anything is written: it must match {@link PACK_PATH}; every directory below the root is
 * created or checked one segment at a time and must not be a symlink; and each final directory, resolved, must sit
 * under the resolved root. Each file is then written to a fresh temporary file (O_EXCL, O_NOFOLLOW) in its
 * directory and renamed over the target, so an existing symlink or hard link at the target is replaced, never
 * followed, and a reader never sees half a file. Returns the absolute paths written.
 */
export async function writeIntoPack(
  packRoot: string,
  files: readonly { path: string; bytes: Uint8Array }[],
): Promise<string[]> {
  let root: string;
  try {
    root = await realpath(packRoot);
    if (!(await lstat(root)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new PackWriteError(`pack root ${packRoot} does not exist or is not a directory`);
  }
  // Check every path first, so a refusal leaves the pack untouched.
  const plans: { dir: string; name: string; bytes: Uint8Array }[] = [];
  for (const file of files) {
    if (!PACK_PATH.test(file.path))
      throw new PackWriteError(`refusing to write ${JSON.stringify(file.path)}: not an allowed pack path`);
    const segments = file.path.split("/");
    const name = segments.pop() as string;
    let dir = root;
    for (const segment of segments) {
      dir = join(dir, segment);
      const info = await lstat(dir).catch(() => null);
      if (info === null) await mkdir(dir);
      else if (info.isSymbolicLink())
        throw new PackWriteError(`refusing to follow the symlink ${dir} inside the pack`);
      else if (!info.isDirectory()) throw new PackWriteError(`${dir} is not a directory`);
    }
    const resolved = await realpath(dir);
    if (resolved !== root && !resolved.startsWith(root + sep))
      throw new PackWriteError(`${dir} resolves outside the pack root`);
    const existing = await lstat(join(resolved, name)).catch(() => null);
    if (existing && !existing.isFile() && !existing.isSymbolicLink())
      throw new PackWriteError(`${join(resolved, name)} is not a file`);
    plans.push({ dir: resolved, name, bytes: file.bytes });
  }
  const written: string[] = [];
  for (const plan of plans) {
    const target = join(plan.dir, plan.name);
    const temp = join(plan.dir, `.${plan.name}.${randomBytes(6).toString("hex")}.tmp`);
    const handle = await open(
      temp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o644,
    );
    try {
      await handle.writeFile(plan.bytes);
    } finally {
      await handle.close();
    }
    try {
      // rename replaces the directory entry: a symlink or hard link at the target is swapped out, never written through.
      await rename(temp, target);
    } catch (err) {
      await rm(temp, { force: true });
      throw err;
    }
    written.push(target);
  }
  return written;
}
