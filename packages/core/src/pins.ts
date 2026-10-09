/**
 * Pinned external versions. Every Bedrock ID, state name and value domain in the registry was checked against
 * exactly these. Bump them together on a game update, re-run the mapping checks and re-verify in game.
 */
export const PINS = {
  /** The Bedrock game version the registry targets (W107 compares `meta.gameVersion` with it). */
  gameVersion: "1.26.50",
  /** `@minecraft/vanilla-data`: block IDs and per-block state names. */
  vanillaData: "1.26.50",
  /** Mojang `bedrock-samples` tag: `metadata/vanilladata_modules/mojang-blocks.json` for state value domains. */
  bedrockSamples: "v1.26.50.4",
  /**
   * The block-state version Bedrock stamps on structure palette entries, as `major.minor.patch.revision`. Not
   * derivable from the pinned data: measured from a structure saved with `/structure save` by BDS 1.26.52.3
   * (`docs/ingame/2026-10-08-m4-roundtrip.txt`). Re-measure on a game update.
   */
  blockStateVersion: "1.21.60.33",
  /** SHA-256 of that `mojang-blocks.json`, so the cached copy is the pinned one. */
  mojangBlocksSha256: "044d494af33347eb1f0e76bab64ce04f44261ec3dac7d1938549a41cf0a770ba",
  /**
   * The stable `@minecraft/server` the Script API loader (M10) declares. Measured: BDS 1.26.52.3 offers 0.1.0,
   * 1.19.0, 2.10.0, 2.11.0-beta and 3.0.0-alpha (a probe pack asking for 99.0.0, 2026-10-09); 2.10.0 is the stable 2.x.
   */
  scriptApiServer: "2.10.0",
  /** The Java Edition version the registry's `java` mappings target (M9). */
  javaVersion: "26.3",
  /** SHA-1 of that version's server jar, from Mojang's version manifest; its data generator makes the block report. */
  javaServerJarSha1: "33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c",
  /** The data version of that release (`world_version` in the jar's version.json), written into .schem and .litematic. */
  javaDataVersion: 5023,
  /** SHA-256 of the generated `reports/blocks.json` (Java block IDs, state names and value domains). */
  javaBlocksSha256: "7a0de8aaf7b04d00c40b8ffdc4cfe75184cff2e821d336a020573201867105a4",
} as const;
