/** A block position `[x, y, z]`: +X east, +Y up, +Z south, origin at the north-west bottom corner. */
export type Pos = readonly [x: number, y: number, z: number];

/** A block state value: a lowercase string, an integer or a boolean. */
export type StateValue = string | number | boolean;

/** The editions a design can target. `meta.edition` picks one. */
export type Edition = "bedrock" | "java";

/** A normalised block: an abstract registry type with every state filled in (defaults applied). */
export interface Block {
  type: string;
  states: Record<string, StateValue>;
}

/** Design metadata after normalisation. `slug` is always present (derived from `name` when omitted). */
export interface Meta {
  name: string;
  slug: string;
  description?: string;
  edition: Edition;
  gameVersion?: string;
}

/** A named input or output on a block position. */
export interface Port {
  name: string;
  pos: Pos;
}

/** One truth-table case: drive inputs, wait `afterTicks` redstone ticks, read outputs. */
export interface TestCase {
  set: Record<string, number>;
  afterTicks: number;
  expect: Record<string, number>;
}

/** A build step for instruction mode, normalised to the positions it adds. */
export interface Step {
  title: string;
  positions: Pos[];
}

/** A text pin on a block position. */
export interface Annotation {
  pos: Pos;
  text: string;
}

/** The single normalised model every consumer reads. Air is omitted; positions are keyed as `"x,y,z"`. */
export interface Model {
  format: "rsd/1";
  meta: Meta;
  /** Bounding box `[sizeX, sizeY, sizeZ]`, from the grid. */
  size: Pos;
  /** `"x,y,z"` to block, air omitted. */
  blocks: ReadonlyMap<string, Block>;
  ports: { inputs: Port[]; outputs: Port[] };
  tests: TestCase[];
  steps: Step[];
  annotations: Annotation[];
  /** The pinned vanilla-data version used to normalise. */
  registryVersion: string;
  /** The reserved `ext` object, carried through untouched. */
  ext?: Readonly<Record<string, unknown>>;
}

/** Diagnostic severity. */
export type Severity = "error" | "warning" | "info";

/** A machine-readable finding with a position (or JSON Pointer path) and a fix hint. */
export interface Diagnostic {
  code: string;
  severity: Severity;
  /** The cell to blame, when there is one. */
  pos?: Pos;
  /** A JSON Pointer into the design, for schema-level findings. */
  path?: string;
  /** Other cells involved, when two cells conflict. */
  related?: Pos[];
  message: string;
  hint?: string;
}

/** Result of parsing: a model when there are no errors, and every diagnostic found. */
export interface ParseResult {
  model?: Model;
  diagnostics: Diagnostic[];
}
