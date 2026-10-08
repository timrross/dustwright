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
  /** SHA-256 of that `mojang-blocks.json`, so the cached copy is the pinned one. */
  mojangBlocksSha256: "044d494af33347eb1f0e76bab64ce04f44261ec3dac7d1938549a41cf0a770ba",
} as const;
