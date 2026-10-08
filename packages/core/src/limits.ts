/**
 * Hard limits that keep the parser, simulator and viewer bounded on hostile input. Exceeding one is E013 (the
 * bounding box is E007), and the message names the limit.
 */
export const LIMITS = {
  /** Design file size in bytes (2 MB). */
  fileBytes: 2 * 1024 * 1024,
  /** JSON nesting depth; the root object counts as 1. */
  jsonDepth: 8,
  /** Bounding box `[x, y, z]`, the Bedrock structure cap. */
  boundingBox: [64, 384, 64] as const,
  legendEntries: 90,
  specChars: 200,
  nameChars: 80,
  descriptionChars: 2000,
  blockOverrides: 10_000,
  inputPorts: 64,
  outputPorts: 64,
  tests: 64,
  /** Redstone ticks per test case; the simulator fails a case beyond this with T002. */
  afterTicks: 1000,
  annotations: 500,
  annotationChars: 500,
  steps: 384,
  /** Positions across all steps together: each block is added by at most one step, so this equals nonAirBlocks. */
  stepPositions: 50_000,
  nonAirBlocks: 50_000,
  /** The viewer guarantees 60 fps up to this many blocks. */
  smoothBlocks: 10_000,
  /** Share-link fragment size in bytes (64 KB). */
  fragmentBytes: 64 * 1024,
  /** Default `functioncommandlimit` gamerule: commands per .mcfunction file (E014). */
  functionCommands: 10_000,
  /** Most blocks one `fill` command may touch. */
  fillBlocks: 32_768,
  /** The parser stops collecting after this many diagnostics and says so in a final E013. */
  diagnostics: 200,
} as const;
