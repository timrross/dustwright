import type { Edition, StateValue } from "./types.js";

/** A face of a block, as a direction from its centre. */
export type Face = "down" | "up" | "north" | "south" | "east" | "west";

/** A block's category, used by the validator and the viewer. */
export type Category = "solid" | "transparent" | "component" | "power_source" | "consumer";

/** The simulator behaviour classes. */
export type SimClass =
  "solid" | "dust" | "repeater" | "comparator" | "torch" | "source" | "consumer" | "piston" | "observer";

/** One abstract state key: its allowed values and default. */
export interface StateDef {
  values: readonly StateValue[];
  default: StateValue;
  /** True for orientation keys (`facing`, `mount`), which the direction overlay and inspector show. */
  directional?: true;
}

/** How one target-edition state is derived: from an abstract state through a value map, or a fixed value. */
export type StateMapping =
  | { from: string; map: Readonly<Record<string, StateValue | null>>; verify?: string; proven?: Verification }
  | { value: StateValue; verify?: string; proven?: Verification };

/** How an abstract block maps to one edition's block ID and states. */
export interface EditionMapping {
  /** A fixed ID, or an ID chosen by one abstract state (e.g. powered and unpowered repeaters). */
  id: string | { from: string; map: Readonly<Record<string, string>> };
  states: Readonly<Record<string, StateMapping>>;
  /** A second block placed at an offset (a door's upper half), with these state overrides. */
  upper?: { offset: readonly [number, number, number]; states: Readonly<Record<string, StateMapping>> };
  /** Java only, where it differs from the entry's `conductsPower` (measured in the Java test world). */
  conductsPower?: boolean;
  /** Java only: who proved the mapping in game, and when (Bedrock records this on the entry, `verified`). */
  verified?: Verification;
  /** The pinned data the mapping was checked against: Bedrock's vanilla-data and samples, or Java's block report. */
  checkedAgainst: { vanillaData: string; bedrockSamples: string } | { javaVersion: string };
}

/** Who proved a mapping in game, and when. */
export interface Verification {
  gameVersion: string;
  date: string;
  by: string;
}

/**
 * Where a component needs a supporting block: a fixed face, or a face chosen by a state (a torch's `mount`).
 * `anyBlock` means any block holds it (levers), not only a sturdy face.
 */
export type SupportRule =
  { face: Face } | { byState: string; map: Readonly<Record<string, Face>>; anyBlock?: true } | null;

/** Which faces of a block can hold components, as measured in game for one edition. */
export interface SturdyFaces {
  top: boolean;
  side: boolean;
  bottom: boolean;
  /**
   * Java only, when it differs from `top`: whether the top holds floor torches, levers and buttons and doors, which
   * need the centre of the face (measured: a hopper's rim holds dust, repeaters and plates, but not those).
   */
  topCenter?: boolean;
  /** Overrides for state combinations; the first match wins. */
  when?: readonly ({ states: Readonly<Record<string, StateValue>> } & Omit<SturdyFaces, "when">)[];
}

/** One registry entry, as stored in `packages/core/registry/<type>.json`. */
export interface RegistryEntry {
  type: string;
  category: Category;
  editions: readonly Edition[];
  states: Readonly<Record<string, StateDef>>;
  needsSupport: SupportRule;
  /** Sturdy faces per edition, measured in game (deploy/test-world/measure-supports.mjs). */
  faces: { bedrock: SturdyFaces; java: SturdyFaces | null };
  occupies?: readonly (readonly [number, number, number])[];
  conductsPower: boolean;
  geometry: { builder: string; color: string };
  sim: { class: SimClass; params: Readonly<Record<string, unknown>> };
  bedrock: EditionMapping;
  verified: Verification | null;
  java: EditionMapping | null;
}
