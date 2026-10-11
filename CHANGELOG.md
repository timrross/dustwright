# Changelog

All notable user-facing changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow semantic versioning.

## [Unreleased]

### Added

- Example: `examples/jeb-door.rsd.json`, a hidden 2x2 Jeb door. Closed, the outside is plain stone; a pressure plate
  on either side opens it in two stages (front pistons pull the stone blocks back, then side pistons pull them and
  the front pistons aside) and leaving reverses it. Built and tested in game with a mob held on each plate.

- M10: pattern `include` (stamp library patterns into a design at an offset with rotation) and the Script API
  loader (`rsd loader <file...> -o <mcpack>`: one behavior pack that builds its designs with
  `/scriptevent rsd:build <slug> <x> <y> <z>`, stable `@minecraft/server` only). Server-side storage and a gallery
  were considered and not built (`docs/m10-extensions.md`).

- M9: the Java edition profile. Java designs (`"edition": "java"`) validate with Java's measured support faces and
  without W105, simulate with quasi-connectivity and Java timings, and export as Sponge `.schem` and Litematica
  `.litematic` (`rsd export --to schem|litematic -o <dir>`, the MCP `export` tool, and the playground's downloads).
  The registry carries Java mappings for every block, checked against the pinned Java 26.3 block report
  (`pnpm fetch:java-data`). E015 is retired.

- M8: the pattern library (`patterns/`, 13 designs: NOT, OR, AND, XOR, repeater line, pulse extender and limiter,
  observer and repeater clocks, T flip-flop, RS latch, 2x2 piston door, hopper sorter), each passing its tests in
  the simulator and in game; `rsd mcp`, an MCP server over stdio with the authoring guide, validate, simulate, the
  patterns, bundle, export, pack and sheets; AUTHORING.md with a second worked example, the pattern list and a
  recipe for share links written by hand; and the authoring eval (`scripts/eval/`).

- M7: the public site, built and run locally: landing, `/view` (share links `#d=` and `#json=`, `?src=`, dropped
  files), the playground with Share and downloads (design, `.mcfunction`, `.mcstructure`, `.mcpack`, layer sheets),
  patterns, docs, `viewer.html` for iframes with origin-checked `postMessage` commands, an embedding example, and a
  CSP in every page plus `_headers` and an nginx snippet. `rsd pack` (one-design `.mcpack`, UUIDv5 identity) and
  `rsd sheets` (A4 layer SVGs). An `.mcpack` built this way installs on the test server and builds by `/function`
  and `/structure load`.

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

### Fixed

- Viewer: an annotation note closes on a press anywhere outside it (in the viewer or on the page) or on Escape,
  and no longer covers its own pin.

### Changed

- M6: the redstone topology helpers (directions, dust connections, diode faces, support) moved into core, shared
  by the stage 2 rules and the simulator. Dust is drawn brighter with more power.

- M5: the registry's `supportsTop` is replaced by `faces` (`top`, `side`, `bottom`, with state-dependent
  overrides), measured in game by `deploy/test-world/measure-supports.mjs`.
