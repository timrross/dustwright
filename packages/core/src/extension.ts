import type { Diagnostic, Edition, Model } from "./types.js";

/** Context handed to every validator rule. */
export interface RuleContext {
  /** The edition profile the design is validated under. */
  edition: Edition;
}

/** A pure validator rule. Rules are registered in one array; their codes are unique. */
export interface Rule {
  code: string;
  stage: 1 | 2 | 3;
  severity: "error" | "warning";
  editions: Edition[];
  run(model: Model, ctx: RuleContext): Diagnostic[];
}

/** Options every exporter accepts. */
export interface ExportOptions {
  /** Also produce a clear function (mcfunction only). */
  clear?: boolean;
  /** Offset of the build from the executor or load position. */
  origin?: readonly [number, number, number];
  /** Command budget per .mcfunction file (the server's functioncommandlimit gamerule). */
  commandLimit?: number;
}

/** Files an exporter produces. Paths are relative to the pack root; only the CLI writes them to disk. */
export interface ExportResult {
  files: { path: string; bytes: Uint8Array }[];
  diagnostics: Diagnostic[];
}

/**
 * An exporter: turns a model into files for one edition. It may finish asynchronously (the NBT writer for
 * structures is async); callers always await the result.
 */
export interface Exporter {
  id: string;
  target: Edition;
  export(model: Model, opts: ExportOptions): ExportResult | Promise<ExportResult>;
}

/** The edition-specific mechanics the simulator runs with. Filled in at M6. */
export interface SimMechanics {
  id: Edition;
  /** False on Bedrock: pistons are not powered by quasi-connectivity. */
  quasiConnectivity: boolean;
  /** Most blocks a piston can push. */
  pushLimit: number;
  /**
   * Delays in game ticks (20 per second; a redstone tick is 2). The simulator steps in game ticks because some
   * Bedrock delays are not whole redstone ticks (an observer reacts after 3). A component reacts to the power it
   * sees at game tick t from tick t + delay; a repeater waits `repeater` x its own delay setting.
   */
  timing: Readonly<{
    torch: number;
    repeater: number;
    comparator: number;
    observer: number;
    /** How long an observer's output stays on. */
    observerPulse: number;
    piston: number;
    /** Lamps, doors, trapdoors and note blocks. */
    consumer: number;
    /** A lamp going dark, when it differs from `consumer` (Java: a lamp lights at once and goes dark later). */
    lampOff?: number;
  }>;
}

/**
 * Everything that differs between editions, in one object per edition. Nothing else in the codebase branches on
 * the edition: rules, mechanics, the registry field that supplies IDs, exporters and the AUTHORING.md chapter all
 * come from here.
 */
export interface EditionProfile {
  id: Edition;
  /** Edition-specific validator rules. */
  rules: Rule[];
  mechanics: SimMechanics;
  /** Which registry field supplies IDs and states. */
  mapping: Edition;
  exporters: Exporter[];
  /** The edition chapter of AUTHORING.md. */
  docs: string;
}
