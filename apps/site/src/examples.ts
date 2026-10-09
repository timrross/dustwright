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

const patternFiles = import.meta.glob("../../../patterns/*.rsd.json", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The pattern library (patterns/), keyed by slug: known-good designs, each built and tested in game. */
export const PATTERNS: ReadonlyMap<string, string> = new Map(
  Object.entries(patternFiles)
    .map(([path, text]) => [path.replace(/^.*\//, "").replace(/\.rsd\.json$/, ""), text] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b)),
);

/** Everything the playground can open by name: the examples, then the patterns not already among them. */
export const DESIGNS: ReadonlyMap<string, string> = new Map([
  ...EXAMPLES,
  ...[...PATTERNS].filter(([k]) => !EXAMPLES.has(k)),
]);
