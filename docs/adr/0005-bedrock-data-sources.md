# 0005: Bedrock IDs and states come from pinned Mojang data

Date: 2026-10-08. Status: accepted.

## Decision

- Block IDs come from `@minecraft/vanilla-data` (MIT), pinned to an exact version (`PINS.vanillaData`).
- State names and value domains come from Mojang's `bedrock-samples`
  `metadata/vanilladata_modules/mojang-blocks.json` at a pinned tag (`PINS.bedrockSamples`), checked by SHA-256.
  That file is under Mojang's licence, not MIT, so it is **not committed**: `pnpm fetch:bedrock-data` caches it in
  `.cache/`, and CI runs that before the tests with `RSD_REQUIRE_BEDROCK_DATA=1` so the check cannot be skipped.
- The registry tests assert, for every abstract state combination, that the emitted ID exists in vanilla-data
  and that the emitted states are exactly the block's states with values in their domains.
- What a value **means** (which number is which direction) is not in either source. Those mappings carry a
  `verify: "VERIFY-IN-GAME: ..."` note, are listed in `docs/verify-in-game.md`, and stay unverified (W108) until
  the M3 orientation test proves them.
- Where a meaning can be checked against a maintained translator, it is: every orientation and state-meaning
  note cites GeyserMC's `mappings-generator` (`BlockMappers.java`, MIT), which maps Java block states to the
  Bedrock states real Bedrock clients render. The M1 review used it to correct four mappings before they reached
  a world: torches (Bedrock names the support side), pistons (north 3, south 2, east 4, west 5), repeaters and
  comparators (Bedrock names the input side), and doors (a quarter turn from Java's facing). These stay
  VERIFY-IN-GAME until the M3 build: a translator is evidence, not proof.
- The pinned game version is 1.26.50 (vanilla-data 1.26.50, bedrock-samples v1.26.50.4, both released for that
  version). Bump all three together.

## Why

The spec bans remembered Bedrock facts in code. Pinned, checksummed sources make every ID and state name
checkable, and the VERIFY-IN-GAME list makes the remaining assumptions explicit.
