/**
 * The viewer's `postMessage` contract, for embedding in an iframe (`viewer.html?src=...`).
 *
 * Outbound, to the parent window: `{ source: "dustwright-viewer", type, detail }` for `ready`, `select`, `step`,
 * `power` and `error`. Inbound commands are accepted only from the parent window, only from an origin listed in
 * `allowed-origins`, and only in exactly these shapes; anything else is ignored:
 *
 *   { "type": "setStep", "step": <integer> }
 *   { "type": "setLayer", "layer": <integer> }
 *   { "type": "setMode", "mode": "explore" | "instructions" }
 */

/** A command a parent page may send. */
export type ViewerCommand =
  | { type: "setStep"; step: number }
  | { type: "setLayer"; layer: number }
  | { type: "setMode"; mode: "explore" | "instructions" };

const isInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= 100_000;

/** Parses an inbound message: the command when the data has exactly a documented shape, else null. */
export function parseCommand(data: unknown): ViewerCommand | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (Object.getPrototypeOf(data) !== Object.prototype) return null;
  const keys = Object.keys(data).sort().join(",");
  const d = data as Record<string, unknown>;
  if (d.type === "setStep" && keys === "step,type" && isInt(d.step)) return { type: "setStep", step: d.step };
  if (d.type === "setLayer" && keys === "layer,type" && isInt(d.layer))
    return { type: "setLayer", layer: d.layer };
  if (d.type === "setMode" && keys === "mode,type" && (d.mode === "explore" || d.mode === "instructions")) {
    return { type: "setMode", mode: d.mode };
  }
  return null;
}

/**
 * The origins in an `allowed-origins` value (space- or comma-separated), normalised; entries that are not an
 * http(s) origin, `*` included, are dropped, so a typo never opens the viewer to everyone.
 */
export function parseAllowedOrigins(value: string | null): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.split(/[\s,]+/)) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.origin !== "null" &&
        !out.includes(url.origin)
      ) {
        out.push(url.origin);
      }
    } catch {
      // Not a URL: ignored.
    }
  }
  return out;
}
