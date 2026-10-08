import { zipSync } from "fflate";

/**
 * Every zip entry's timestamp. Zip stores a DOS date in local time, so the date is built from local-time parts
 * (1980-01-01 00:00): the archive is then byte-identical in every time zone.
 */
const ZIP_TIME = new Date(1980, 0, 1, 0, 0, 0);

/** Zips files in the given order with a fixed timestamp and compression level: same input, same bytes. */
export function zipDeterministic(files: Readonly<Record<string, Uint8Array>>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, data]) => [path, [data, { mtime: ZIP_TIME, level: 6 }]]),
    ),
  );
}
