import { PINS } from "@dustwright/core";

/**
 * Behavior pack manifests: one builder for the shared test pack (`packs/redstone-designs-bp`) and every per-design
 * `.mcpack`, so the two cannot drift. Data only: one `data` module, no scripts, no dependencies.
 */

/** What a manifest needs: a name, a description and the two UUIDs (pack header and data module). */
export interface ManifestInput {
  name: string;
  description: string;
  headerUuid: string;
  moduleUuid: string;
}

/** The pack version: fixed until pack versioning by content hash is designed (docs/ideas.md). */
export const PACK_VERSION = [1, 0, 0] as const;

/** The manifest text, formatted the way the committed test-pack manifest is. */
export function buildManifest(input: ManifestInput): string {
  const engine = PINS.gameVersion.split(".").map(Number);
  const inline = (xs: readonly number[]) => `[${xs.join(", ")}]`;
  return [
    "{",
    '  "format_version": 2,',
    '  "header": {',
    `    "name": ${JSON.stringify(input.name)},`,
    `    "description": ${JSON.stringify(input.description)},`,
    `    "uuid": "${input.headerUuid}",`,
    `    "version": ${inline(PACK_VERSION)},`,
    `    "min_engine_version": ${inline(engine)}`,
    "  },",
    '  "modules": [',
    "    {",
    '      "type": "data",',
    `      "uuid": "${input.moduleUuid}",`,
    `      "version": ${inline(PACK_VERSION)}`,
    "    }",
    "  ]",
    "}",
    "",
  ].join("\n");
}

/** The shared test pack, `packs/redstone-designs-bp/manifest.json` (its UUIDs were generated once, M3). */
export const TEST_PACK_MANIFEST: ManifestInput = {
  name: "Dustwright redstone designs",
  description: "Redstone designs exported by Dustwright. Data only: functions and structures, no scripts.",
  headerUuid: "528f5772-da6b-4496-b443-e23a2fe3e732",
  moduleUuid: "35082e34-dc4e-4772-a683-12e61d110011",
};

/** The fixed namespace for per-design pack UUIDs (UUIDv5). Never change it: it is every design pack's identity. */
export const PACK_NAMESPACE = "baf2b517-e8ac-4acd-b91d-81c80dde0c43";

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A UUIDv5 (RFC 9562): SHA-1 of the namespace bytes and the name, with the version and variant bits set. */
export async function uuidV5(name: string, namespace: string = PACK_NAMESPACE): Promise<string> {
  const ns = Uint8Array.from(namespace.replace(/-/g, "").match(/../g) ?? [], (h) => parseInt(h, 16));
  const data = new Uint8Array([...ns, ...new TextEncoder().encode(name)]);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-1", data)).slice(0, 16);
  digest[6] = ((digest[6] as number) & 0x0f) | 0x50;
  digest[8] = ((digest[8] as number) & 0x3f) | 0x80;
  const h = hex(digest);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The manifest of one design's pack: its UUIDs are UUIDv5 of the slug (and of the slug plus "/data" for the module)
 * under PACK_NAMESPACE, so one design always has one pack identity. Only the validated slug reaches the manifest.
 */
export async function designManifest(slug: string): Promise<string> {
  return buildManifest({
    name: `Dustwright: ${slug}`,
    description: `The redstone design "${slug}", exported by Dustwright. Data only: a function and a structure.`,
    headerUuid: await uuidV5(slug),
    moduleUuid: await uuidV5(`${slug}/data`),
  });
}
