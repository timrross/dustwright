/**
 * Hostile-input corpus for the parser (M1). Large inputs are generated rather than committed. Each case names the
 * limit it attacks and the codes an acceptable rejection may carry.
 */

/** One corpus case: JSON text the parser must reject quickly, without throwing. */
export interface FuzzCase {
  name: string;
  text: string;
  /** Acceptable codes for the rejection. */
  codes: string[];
}

const base = () => ({
  format: "rsd/1",
  meta: { name: "fuzz" },
  legend: { "#": "stone", L: "lever", "*": "lamp" } as Record<string, string>,
  layers: [["L*"]] as string[][],
});

const row = (n: number, ch = "#") => ch.repeat(n);
const json = (v: unknown) => JSON.stringify(v);

/** Every Limits-table row exceeded by exactly one, plus the stress inputs the spec names. */
export function limitCases(): FuzzCase[] {
  const cases: FuzzCase[] = [];
  const add = (name: string, design: unknown, codes = ["E013"]) =>
    cases.push({ name, text: json(design), codes });

  // File size: 2 MB + 1 byte of valid JSON.
  {
    const d = base();
    const filler = JSON.stringify({ ...d, ext: { pad: "" } });
    const pad = 2 * 1024 * 1024 + 1 - filler.length;
    cases.push({
      name: "file size 2 MB + 1",
      text: JSON.stringify({ ...d, ext: { pad: "x".repeat(pad) } }),
      codes: ["E013"],
    });
  }
  // JSON depth 9 (root counts as 1).
  {
    let nested: unknown = 1;
    for (let i = 0; i < 8; i++) nested = [nested];
    add("json depth 9", { ...base(), ext: { a: nested } }, ["E013"]);
  }
  // Bounding box: one past each axis.
  add("box x 65", { ...base(), layers: [[row(65)]] }, ["E007"]);
  add("box z 65", { ...base(), layers: [Array.from({ length: 65 }, () => "#")] }, ["E007"]);
  add("box y 385", { ...base(), layers: Array.from({ length: 385 }, () => ["#"]) }, ["E007"]);
  // Legend: 91 entries; a 201-character spec.
  {
    const legend: Record<string, string> = {};
    const keys = [...Array(95)].map((_, i) => String.fromCharCode(33 + i)).filter((c) => c !== ".");
    for (const k of keys.slice(0, 91)) legend[k] = "stone";
    add("legend 91 entries", { ...base(), legend });
  }
  add("spec 201 chars", { ...base(), legend: { ...base().legend, "#": `stone${" a=b".repeat(49)}` } });
  add("name 81 chars", { ...base(), meta: { name: "n".repeat(81) } });
  add("description 2001 chars", { ...base(), meta: { name: "x", description: "d".repeat(2001) } });
  add("blocks 10001", {
    ...base(),
    blocks: Array.from({ length: 10_001 }, () => ({ pos: [0, 0, 0], block: "stone" })),
  });
  add("inputs 65", {
    ...base(),
    ports: { inputs: Array.from({ length: 65 }, (_, i) => ({ name: `i${i}`, pos: [0, 0, 0] })) },
  });
  add("outputs 65", {
    ...base(),
    ports: { outputs: Array.from({ length: 65 }, (_, i) => ({ name: `o${i}`, pos: [1, 0, 0] })) },
  });
  add("tests 65", {
    ...base(),
    tests: Array.from({ length: 65 }, () => ({ set: {}, afterTicks: 1, expect: { x: 0 } })),
  });
  add("annotations 501", {
    ...base(),
    annotations: Array.from({ length: 501 }, () => ({ pos: [0, 0, 0], text: "a" })),
  });
  add("annotation text 501", { ...base(), annotations: [{ pos: [0, 0, 0], text: "a".repeat(501) }] });
  add("steps 385", { ...base(), steps: Array.from({ length: 385 }, () => ({ title: "s", layers: [0] })) });
  // Non-air blocks: 50,001 within the box (64 x 13 x 64 = 53,248 cells, trimmed to 50,001 non-air).
  {
    const layers: string[][] = [];
    let remaining = 50_001;
    for (let y = 0; y < 13; y++) {
      const rows: string[] = [];
      for (let z = 0; z < 64; z++) {
        const n = Math.max(0, Math.min(64, remaining));
        remaining -= n;
        rows.push(row(n) + ".".repeat(64 - n));
      }
      layers.push(rows);
    }
    add("non-air 50001", { ...base(), layers });
  }
  return cases;
}

/** Inputs that are small on disk but expensive to expand (found in the M1 review). */
export function expansionCases(): FuzzCase[] {
  const full = (n: number) => Array.from({ length: n }, () => Array.from({ length: 64 }, () => row(64)));
  const twelve = Array.from({ length: 12 }, (_, i) => i);
  return [
    {
      name: "steps naming 12 full layers 384 times",
      text: json({
        ...base(),
        legend: { "#": "stone" },
        layers: full(12),
        steps: Array.from({ length: 384 }, () => ({ title: "s", layers: twelve })),
      }),
      codes: ["E013"],
    },
    {
      name: "steps repeating one layer index 300 times",
      text: json({
        ...base(),
        legend: { "#": "stone" },
        layers: full(12),
        steps: Array.from({ length: 384 }, () => ({
          title: "s",
          layers: Array.from({ length: 300 }, () => 0),
        })),
      }),
      codes: ["E001", "E013"],
    },
    {
      name: "full 64 x 384 x 64 box of stone",
      text: json({
        ...base(),
        legend: { "#": "stone" },
        layers: Array.from({ length: 384 }, () => Array.from({ length: 64 }, () => row(64))),
      }),
      codes: ["E013"],
    },
    {
      name: "full box of doors",
      text: json({
        ...base(),
        legend: { "#": "stone", D: "door" },
        layers: Array.from({ length: 384 }, (_, y) =>
          Array.from({ length: 64 }, () => row(64, y % 2 ? "." : "D")),
        ),
      }),
      codes: ["E013"],
    },
  ];
}

/** Stress inputs: 10 MB of garbage, 100-deep nesting, and malformed shapes. */
export function stressCases(): FuzzCase[] {
  let seed = 0x2545f491;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x1_0000_0000;
  };
  const garbage = Array.from({ length: 10 * 1024 * 1024 }, () =>
    String.fromCharCode(32 + Math.floor(rand() * 95)),
  ).join("");
  return [
    { name: "10 MB garbage", text: garbage, codes: ["E013"] },
    { name: "10 MB of open brackets", text: "[".repeat(10 * 1024 * 1024), codes: ["E013"] },
    { name: "100-deep arrays", text: `${"[".repeat(100)}${"]".repeat(100)}`, codes: ["E013"] },
    { name: "100-deep objects", text: `${'{"a":'.repeat(100)}1${"}".repeat(100)}`, codes: ["E013"] },
    { name: "truncated JSON", text: '{"format":"rsd/1","meta":{', codes: ["E001"] },
    { name: "top-level array", text: "[]", codes: ["E001"] },
    { name: "top-level string", text: '"rsd/1"', codes: ["E001"] },
    { name: "null", text: "null", codes: ["E001"] },
    { name: "empty", text: "", codes: ["E001"] },
    { name: "wrong format", text: '{"format":"rsd/2"}', codes: ["E010"] },
    { name: "format number", text: '{"format":1}', codes: ["E010"] },
    {
      name: "proto key",
      text: '{"format":"rsd/1","meta":{"name":"x"},"legend":{"#":"stone"},"layers":[["#"]],"__proto__":{"x":1}}',
      codes: ["E001"],
    },
  ];
}

/** A seeded mutator: produces many malformed variants of a valid design. */
export function* mutations(designText: string, count: number, seed = 12345): Generator<string> {
  let s = seed >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
  const pool = [
    '"',
    "{",
    "}",
    "[",
    "]",
    ",",
    ":",
    "-1",
    "1e309",
    "null",
    "true",
    '"\\u0000"',
    '"..."',
    "\u2028",
    " ",
    "\t",
    "x",
  ];
  for (let i = 0; i < count; i++) {
    const chars = [...designText];
    const edits = 1 + Math.floor(rand() * 4);
    for (let e = 0; e < edits; e++) {
      const at = Math.floor(rand() * chars.length);
      const op = rand();
      if (op < 0.33) chars.splice(at, 1);
      else if (op < 0.66) chars.splice(at, 0, pool[Math.floor(rand() * pool.length)] as string);
      else chars[at] = pool[Math.floor(rand() * pool.length)] as string;
    }
    yield chars.join("");
  }
}
