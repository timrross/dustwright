import { LIMITS } from "./limits.js";

/** Outcome of the pre-parse guard: ok, or the limit that was exceeded. */
export type GuardResult = { ok: true } | { ok: false; limit: "depth" | "size"; detail: string };

/**
 * Scans JSON text for nesting depth without recursion, honouring strings, so a hostile file cannot overflow the
 * stack in JSON.parse. Linear in the text length.
 */
export function scanJsonDepth(text: string, maxDepth: number = LIMITS.jsonDepth): GuardResult {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++;
      else if (c === 0x22) inString = false;
      continue;
    }
    if (c === 0x22) inString = true;
    else if (c === 0x7b || c === 0x5b) {
      depth++;
      if (depth > maxDepth) {
        return { ok: false, limit: "depth", detail: `JSON nesting is deeper than the limit of ${maxDepth}` };
      }
    } else if (c === 0x7d || c === 0x5d) depth--;
  }
  return { ok: true };
}

/**
 * Walks an already-parsed value without recursion, checking nesting depth and a node budget. Cycles exceed the
 * depth limit, so they are rejected too. Getters that throw are the caller's to catch.
 */
export function walkValue(value: unknown, maxDepth: number = LIMITS.jsonDepth): GuardResult {
  const nodeBudget = LIMITS.fileBytes;
  let nodes = 0;
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [v, d] = stack.pop() as [unknown, number];
    if (typeof v === "string") {
      // Strings count by length, so one huge string passed directly cannot slip past the size budget.
      nodes += v.length;
      if (nodes > nodeBudget) {
        return {
          ok: false,
          limit: "size",
          detail: `Design is larger than the file size limit of ${LIMITS.fileBytes} bytes`,
        };
      }
      continue;
    }
    if (typeof v !== "object" || v === null) continue;
    if (d > maxDepth)
      return { ok: false, limit: "depth", detail: `JSON nesting is deeper than the limit of ${maxDepth}` };
    const children = Array.isArray(v) ? v : Object.values(v as object);
    nodes += children.length + 1;
    if (nodes > nodeBudget) {
      return {
        ok: false,
        limit: "size",
        detail: `Design is larger than the file size limit of ${LIMITS.fileBytes} bytes`,
      };
    }
    for (const child of children) {
      if (typeof child === "string" || (typeof child === "object" && child !== null))
        stack.push([child, d + 1]);
    }
  }
  return { ok: true };
}

/** UTF-8 byte length of a string, without allocating an encoded copy. */
export function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}
