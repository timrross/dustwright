import { diag, LIMITS } from "@dustwright/core";
import type { Diagnostic } from "@dustwright/core";

/**
 * Share links carry the design in the URL fragment, so it never reaches a server or its logs:
 * - `#d=<base64url of deflate-raw(JSON)>`, what Share produces;
 * - `#json=<URI-encoded JSON>`, for links written by hand (an LLM can write one without compressing).
 * The fragment is capped at 64 KB (E013); larger designs travel as files. Decompression stops at the 2 MB file
 * limit, so a small fragment cannot inflate into a huge design.
 */

/** What a fragment held: design text, an error to show, or nothing to open. */
export type FragmentResult = { text: string } | { error: Diagnostic } | null;

const tooLarge = (what: string) =>
  diag("E013", `${what} is larger than the share-link limit of ${LIMITS.fragmentBytes} bytes (64 KB)`, {
    hint: "Share the design as a file instead (Download design), or open it with ?src= from an https: URL.",
  });

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function readCapped(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Encodes design text as a `d=` share fragment (without the `#`). */
export async function encodeFragment(text: string): Promise<string> {
  const stream = new Blob([new TextEncoder().encode(text)])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = (await readCapped(stream, Number.MAX_SAFE_INTEGER)) as Uint8Array;
  return `d=${toBase64Url(bytes)}`;
}

/** Reads a design from a URL fragment (`#d=` or `#json=`, with or without the `#`). */
export async function decodeFragment(hash: string): Promise<FragmentResult> {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (fragment === "") return null;
  if (fragment.length > LIMITS.fragmentBytes) return { error: tooLarge("The link's design") };
  if (fragment.startsWith("json=")) {
    try {
      return { text: decodeURIComponent(fragment.slice(5)) };
    } catch {
      return {
        error: diag("E001", "The #json= link is not valid percent-encoded text", {
          hint: "Encode the JSON with encodeURIComponent.",
        }),
      };
    }
  }
  if (fragment.startsWith("d=")) {
    try {
      const stream = new Blob([fromBase64Url(fragment.slice(2))])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      const bytes = await readCapped(stream, LIMITS.fileBytes);
      if (!bytes) {
        return {
          error: diag(
            "E013",
            `The link's design is larger than the file size limit of ${LIMITS.fileBytes} bytes (2 MB)`,
            {
              hint: "Split or simplify the design.",
            },
          ),
        };
      }
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    } catch {
      return {
        error: diag("E001", "The #d= link is damaged: it does not decompress to a design", {
          hint: "Copy the whole link again.",
        }),
      };
    }
  }
  return null;
}

/** Whether a design is small enough for a share link; the fragment it would make otherwise. */
export async function shareFragment(text: string): Promise<{ fragment: string } | { error: Diagnostic }> {
  const fragment = await encodeFragment(text);
  return fragment.length > LIMITS.fragmentBytes ? { error: tooLarge("This design") } : { fragment };
}
