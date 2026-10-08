# Changelog

All notable user-facing changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow semantic versioning.

## [Unreleased]

### Added

- M6: the simulator (`@dustwright/sim`). It runs every test case in `rsd validate` (stage 3: T001, T002, T003), in
  game ticks, with the observer timing measured in game. The viewer's power view shows any test case or a free run
  tick by tick. `deploy/test-world/measure-timing.mjs` cross-checks the simulator against the game.

- M5: validator stage 2. E006 (a component with nothing that holds it, from support faces measured in game), W101
  (dust too long), W102 (a diode pointing at nothing), W103 (dust that connects nothing), W104 (a torch that powers
  its own support) and W105 (a piston only quasi-connectivity would power). Every diagnostic code has a passing and
  a failing fixture. The `--json` output is described by `packages/core/schema/diagnostics.json`. The viewer marks
  the blocks each finding blames, in the playground and in single-file bundles.

- M4: `rsd export --to mcstructure`, proven in game: every example loads, also turned 90 degrees, and passes its
  tests (the 2x2 door's exact placement is not checked, as it moves at rest); structures saved by the game match the
  exports block for block (the container encoding differs).
  `deploy/test-world/compare-structure.mjs` diffs a structure saved in game against an export.

- M3: `rsd export --to mcfunction` with a fixed placement order, a separate `--clear` function, `--origin` and
  `--command-limit`; safe writes into a pack (no symlinks, two directories only); the data-only behavior pack
  `packs/redstone-designs-bp`; the orientation test design; a Docker Compose test world; and an automated in-game
  check (`deploy/test-world/ingame-check.mjs`) that proves mappings and example behaviour through the server console.

- M2: the `<redstone-viewer>` web component (orbit, pan, zoom, hover and click inspector with the Bedrock mapping,
  layer slider with isolate and ghosting, explode, direction arrows, instructions mode, port labels and
  annotation pins, keyboard control, light and dark themes, bottom-sheet inspector on narrow screens), the
  playground page, a benchmark page, and `rsd bundle` for a single-file offline viewer.

- M1: the `rsd/1` format (JSON Schema), a parser that never throws, hard limits with a fuzz corpus, the block
  registry for the 28 v1 types with Bedrock mappings checked against pinned Mojang data, `rsd validate` (stage 1)
  and `rsd registry dump`, five example designs, `AUTHORING.md`, and generated `docs/bedrock-mapping.md`,
  `docs/diagnostics.md` and `docs/verify-in-game.md`.

- M0: monorepo scaffold (`core`, `validator`, `sim`, `viewer`, `export`, `cli`, `mcp`, app `site`), CI, lint,
  licence allowlist and `rsd --help`.

### Changed

- M6: the redstone topology helpers (directions, dust connections, diode faces, support) moved into core, shared
  by the stage 2 rules and the simulator. Dust is drawn brighter with more power.

- M5: the registry's `supportsTop` is replaced by `faces` (`top`, `side`, `bottom`, with state-dependent
  overrides), measured in game by `deploy/test-world/measure-supports.mjs`.
