import { diag } from "./diagnostics.js";
import { LIMITS } from "./limits.js";
import { closestTypes, registryEntry, valueText } from "./registry.js";
import type { Block, Diagnostic, Edition, StateValue } from "./types.js";

const TOKEN = /^[a-z0-9_]{1,32}$/;
const VALUE = /^[a-z0-9_-]{1,32}$/;
const INTEGER = /^-?[0-9]+$/;

/** A block spec split into its type and raw `key=value` pairs, before registry checks. */
export interface RawSpec {
  type: string;
  pairs: [key: string, value: StateValue][];
}

/** Converts a grammar value to its typed form: digits are integers, `true`/`false` booleans, else a string. */
export function typedValue(raw: string): StateValue {
  if (INTEGER.test(raw)) return Number(raw) + 0; // + 0 turns -0 into 0
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

/** Splits a spec by the grammar (`<type> [key=value ...]`, single spaces). Returns diagnostics on failure. */
export function splitSpec(spec: string): { raw?: RawSpec; diagnostics: Diagnostic[] } {
  if ([...spec].length > LIMITS.specChars) {
    return {
      diagnostics: [
        diag("E013", `Block spec is longer than the limit of ${LIMITS.specChars} characters`, {
          hint: "Shorten the spec; unspecified states take registry defaults.",
        }),
      ],
    };
  }
  const bad = (message: string, hint: string) => ({ diagnostics: [diag("E005", message, { hint })] });
  if (/[\t\n\r]/.test(spec))
    return bad(
      `Block spec "${printable(spec)}" contains a tab or newline`,
      "Separate parts with single spaces.",
    );
  const parts = spec.split(" ");
  if (parts.some((p) => p === "")) {
    return bad(
      `Block spec "${printable(spec)}" has leading, trailing or double spaces`,
      "Separate parts with single spaces.",
    );
  }
  const [type, ...rest] = parts as [string, ...string[]];
  if (!TOKEN.test(type)) {
    return bad(
      `Block type "${printable(type)}" is not a lowercase name`,
      "Types are 1 to 32 characters of a-z, 0-9 and _.",
    );
  }
  const pairs: [string, StateValue][] = [];
  const seen = new Set<string>();
  for (const part of rest) {
    const eq = part.indexOf("=");
    const key = eq < 0 ? part : part.slice(0, eq);
    const value = eq < 0 ? "" : part.slice(eq + 1);
    if (eq < 0 || !TOKEN.test(key) || !VALUE.test(value)) {
      return bad(
        `"${printable(part)}" in "${printable(spec)}" is not key=value`,
        "Write states as key=value, lowercase, for example facing=east.",
      );
    }
    if (seen.has(key))
      return bad(`State key "${key}" is repeated in "${printable(spec)}"`, "Give each key once.");
    seen.add(key);
    pairs.push([key, typedValue(value)]);
  }
  return { raw: { type, pairs }, diagnostics: [] };
}

/** Parses a block spec into a normalised block (registry defaults applied), checking type, keys and domains. */
export function parseSpec(spec: string, edition: Edition): { block?: Block; diagnostics: Diagnostic[] } {
  const { raw, diagnostics } = splitSpec(spec);
  if (!raw) return { diagnostics };
  const entry = registryEntry(raw.type);
  if (!entry) {
    const near = closestTypes(raw.type);
    return {
      diagnostics: [
        diag("E004", `Unknown block type "${raw.type}"`, {
          hint:
            near.length > 0
              ? `Did you mean ${near.map((n) => `"${n}"`).join(", ")}?`
              : "See the block list in AUTHORING.md.",
        }),
      ],
    };
  }
  if (!entry.editions.includes(edition)) {
    return {
      diagnostics: [
        diag("E004", `Block type "${raw.type}" does not exist in ${edition}`, {
          hint: `It exists only in ${entry.editions.join(" and ")}.`,
        }),
      ],
    };
  }
  const states: Record<string, StateValue> = {};
  for (const [key, def] of Object.entries(entry.states)) states[key] = def.default;
  const out: Diagnostic[] = [];
  for (const [key, value] of raw.pairs) {
    const def = Object.hasOwn(entry.states, key) ? entry.states[key] : undefined;
    if (!def) {
      const keys = Object.keys(entry.states);
      out.push(
        diag("E005", `"${raw.type}" has no state "${key}"`, {
          hint: keys.length > 0 ? `Allowed keys: ${keys.join(", ")}.` : `"${raw.type}" takes no states.`,
        }),
      );
      continue;
    }
    if (!def.values.some((v) => v === value)) {
      out.push(
        diag("E005", `${key}=${valueText(value)} is not allowed on "${raw.type}"`, {
          hint: `Allowed values for ${key}: ${def.values.map(valueText).join(", ")}.`,
        }),
      );
      continue;
    }
    states[key] = value;
  }
  if (out.length > 0) return { diagnostics: out };
  return { block: { type: raw.type, states }, diagnostics: [] };
}

/** Writes a block back as a canonical spec (every state, registry key order). */
export function formatSpec(block: Block): string {
  const entry = registryEntry(block.type);
  const keys = entry ? Object.keys(entry.states) : Object.keys(block.states);
  const parts = keys
    .filter((k) => block.states[k] !== undefined)
    .map((k) => `${k}=${valueText(block.states[k] as StateValue)}`);
  return [block.type, ...parts].join(" ");
}

/** Makes untrusted text safe to quote in a one-line message: control characters escaped, length capped. */
export function printable(text: string, max = 60): string {
  const chars = [...text];
  const clipped = chars.length > max ? [...chars.slice(0, max), "…"] : chars;
  return clipped
    .map((c) => {
      const code = c.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f ? `\\u${code.toString(16).padStart(4, "0")}` : c;
    })
    .join("");
}
