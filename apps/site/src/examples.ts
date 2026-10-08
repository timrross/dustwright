/** The example designs from the repo's examples/ directory, keyed by slug (file name without .rsd.json). */
const files = import.meta.glob("../../../examples/*.rsd.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const EXAMPLES: ReadonlyMap<string, string> = new Map(
  Object.entries(files)
    .map(([path, text]) => [path.replace(/^.*\//, "").replace(/\.rsd\.json$/, ""), text] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b)),
);
