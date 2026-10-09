# Verification log

One dated entry per milestone: what was checked, how, the result, and any deviation from the spec. In-game
items need the maintainer's screenshots before sign-off.

## M0: Scaffold (2026-10-08)

Environment: macOS (Darwin 25.6), Node 22.13.0, pnpm 10.34.5 via corepack.

| Item                                                                                                  | How                                                                                                                                                                                                           | Result                                                                                                 |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fresh clone: `pnpm i && pnpm test && pnpm build`                                                      | Copied the tracked and unignored files to an empty directory (equivalent of a clone before the first commit), ran `pnpm i --frozen-lockfile`, `pnpm test`, `pnpm build`, then `rsd --help` from the built CLI | Pass: all three exit 0, help prints                                                                    |
| CI runs on push and fails on a deliberately broken test                                               | `.github/workflows/ci.yml` runs on `push` and `pull_request`. Added a failing test in the fresh copy and ran `pnpm test`                                                                                      | Pass locally: exit 1. **Pending:** confirm on GitHub after the first push (the repo has no remote yet) |
| CI installs with `--frozen-lockfile`, runs `pnpm audit --audit-level=high`, lifecycle scripts blocked | Workflow steps; `pnpm audit --audit-level=high` locally; `strictDepBuilds: true` in `pnpm-workspace.yaml` made install fail on esbuild's unreviewed script until it was listed in `ignoredBuiltDependencies`  | Pass: audit clean (after moving from Vitest 3 to 4.1.11, which dropped a vulnerable tinypool)          |
| `LICENSE` (MIT) and the licence allowlist                                                             | `pnpm check:licenses` over all 136 installed packages; unit test of the allowlist (accepts MIT, Apache-2.0, ISC…; rejects GPL, AGPL, SSPL, UNLICENSED)                                                        | Pass                                                                                                   |
| `SECURITY.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md` skeleton, `.nvmrc`, `engines`                     | Present in the root. Root `engines.node` allows Node 22.13 or later on the 22 line, or 24 and later (what the toolchain actually installs on); every package and the site declare `>=22`; `.nvmrc` is 22.13   | Pass                                                                                                   |
| Security row "Supply chain"                                                                           | Exact versions (`save-exact`), committed lockfile, frozen install, blocked scripts, audit in CI, `renovate.json` weekly with a 14-day minimum release age; GitHub Actions pinned to commit SHAs               | Pass                                                                                                   |
| ESLint bans `eval`, `new Function`, `innerHTML`                                                       | `test/lint-rules.test.ts` lints probe snippets with the repo config                                                                                                                                           | Pass                                                                                                   |

Deviations:

- Node 23 (the machine default) is rejected by `eslint-visitor-keys` and is not LTS; development uses Node 22.13.
- The CLI argument parser is Node's built-in `util.parseArgs`, so it adds no runtime dependency.
- The CI workflow has not run on GitHub yet; the first push will prove it, and should confirm that the pinned
  action SHAs match their tags (checkout v7.0.1, pnpm/action-setup v6.1.0, setup-node v7.0.0; resolved with
  `git ls-remote` on 2026-10-08).
- Review (independent agent) found three blockers, all fixed before commit: root `test/` not typechecked, wrong
  per-package test command, and an `engines` range wider than what installs.

## M1: Format, parser and registry (2026-10-08)

Environment: as M0. Pinned data: game 1.26.50, `@minecraft/vanilla-data` 1.26.50, `bedrock-samples` v1.26.50.4
(`mojang-blocks.json` SHA-256 `044d494a…70ba`). Full CI sequence re-run in a fresh copy: install, audit,
licences, lint, typecheck, `gen:check`, `docs:check`, build, fetch, tests: all pass. Independent review: one
blocker (step expansion could exhaust memory) and one doc error (piston power in AUTHORING.md), both fixed;
four mappings corrected from its spot-checks.

| Item                                                                                                                                              | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Result                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| All five examples parse and normalise; snapshot tests of the normalised model                                                                     | `packages/core/test/parse.test.ts` snapshots (blocks listed per position with full states) for not-gate, repeater-line, observer-clock, t-flip-flop, piston-door-2x2; `rsd validate` on each: zero errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Pass                                                                                                 |
| Ragged grid, unknown character, unknown type and bad state each fail with the right code and position                                             | Unit tests for E002 (row and layer, with `pos` and `path`), E003 (first position, once per character), E004 (closest names in the hint), E005 (value, key, repeated key, tab, torch `ceiling`, `delay` on a lever); also E001, E007 to E012 and W106                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pass                                                                                                 |
| A design with `edition: java` parses and renders but reports E015; only the Bedrock profile is registered                                         | `validate()` returns a model and exactly `[E015]`; the Java profile's only rule is E015                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Pass for parse and validate. "Renders" is checked in M2, when the viewer exists                      |
| Fuzz corpus: 10 MB garbage, 100-deep nesting, every Limits row exceeded by one; each rejected in under a second with E013 or E001, nothing throws | `packages/core/fuzz/corpus.ts` (generated cases) and `seeds/`; `fuzz.test.ts` times each case. Every case took at most 21 ms. Also cyclic and throwing objects, and 2,000 seeded mutations of the examples                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Pass. The bounding-box rows report E007, as the Limits table specifies                               |
| Registry files validate against the registry schema in CI; the three-parts test passes for every v1 type                                          | `test/registry.test.ts`: schema plus cross-checks (every value of every state mapped, defaults in domain) for 28 types; geometry builder in `GEOMETRY_BUILDERS`, class in `SIM_CLASSES`, and a Bedrock mapping for every state combination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Pass. The builders and classes are name lists until M2 and M6 implement them; the test tightens then |
| Bedrock IDs and states from pinned data                                                                                                           | Every emitted ID is in vanilla-data 1.26.50's `MinecraftBlockTypes`; every emitted state set equals the block's states in `mojang-blocks.json`, with values in domain. CI sets `RSD_REQUIRE_BEDROCK_DATA=1` so the check cannot skip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pass                                                                                                 |
| `docs/bedrock-mapping.md` is generated from the registry and lists the pinned vanilla-data version                                                | `rsd registry dump` and `pnpm docs:gen` render the same text; drift test and `pnpm docs:check`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Pass                                                                                                 |
| Security row "Parser"                                                                                                                             | Limits and E013; the parser never throws (fuzz); size and depth are checked before `JSON.parse`; the schema validator is precompiled, so no runtime code generation. After review: step expansion is budgeted before any array is built (E013 above 50,000 positions; step layers unique and at most 384), the grid scan stops at 50,001 non-air blocks, and strings count against the budget when an object is passed directly. Regression cases in `expansionCases()` (`packages/core/fuzz/corpus.ts`): the review's 71 KB steps bomb (was 2.3 s and 1.6 GB, now 28 ms), a 300-index variant (was an out-of-memory abort, now E001 in 8 ms), and full 64 × 384 × 64 boxes of stone and doors (were about 1 s, now about 40 ms) | Pass                                                                                                 |
| Tim reviews the mapping table                                                                                                                     | `docs/bedrock-mapping.md` and `docs/verify-in-game.md` (21 assumptions, VIG-01 to VIG-21)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Waiting on Tim**                                                                                   |

Deviations and decisions:

- **`afterTicks` above 1,000:** the spec lists it as an E013 limit and as a T002 test failure. The parser accepts it
  and the simulator will report T002 (M6), so the M6 check holds; every other Limits row is E013. See ADR 0001.
- **E009 is detected while parsing** (repeated overrides, a door's upper half on a block), so it reports with the
  stage 1 errors although the spec lists it in stage 2.
- **Edition and game version are optional** in `meta` (only `name` is required by the Meta table); `edition`
  defaults to `bedrock`.
- **Door:** one block in the model, in the lower cell; the cell above must be air and the exporter places the
  upper half (registry `occupies` and mapping `upper`).
- **Lever axis:** floor and ceiling levers always map to the north-south axis (VIG-08; an `axis` key is in
  `docs/ideas.md`).
- **Mojang data not committed:** `mojang-blocks.json` is fetched into `.cache/` (ADR 0005).
- **Step positions limit:** all steps together may add at most 50,000 positions (the non-air limit), and a
  step's `layers` must be unique. The spec's Limits table has only "Steps 384"; this closes the expansion hole the
  review found. Proposed spec amendment.
- **Orientation semantics defined for door, trapdoor and stairs** (the spec says "standard building semantics"
  or nothing): stairs `facing` is the climbing direction, door `facing` the direction a player looks when placing
  it, trapdoor hinge opposite `facing`, all as Java's `facing`. Proposed spec amendment.
- **Mappings corrected after review**, with evidence from GeyserMC's mappings-generator: torch, piston and sticky
  piston, repeater and comparator, door (ADR 0005). All 21 assumptions remain VERIFY-IN-GAME.
- **Default steps:** one per layer, including empty layers, as the spec says.
- **`rsd validate --json` on an unreadable file** prints `{"ok":false,"diagnostics":[],"error":"..."}` so stdout
  always holds one JSON document; exit code 2.
- **Example circuits are unproven in game.** The NOT gate, repeater line, observer clock and 2x2 door were
  reasoned block by block; the T flip-flop transcribes the Bedrock piston T flip-flop from minecraft.wiki's
  schematic, with a lever and lamp added (and an air layer on top, so the block its pulse limiter lifts stays inside
  the bounding box). Its toggle depends on a timing race (see its annotation); build it first at M3.
- **The observer clock has no `tests`:** v1 tests read one value at one tick, which cannot express a clock's
  period (`expectTrace` is in `docs/ideas.md`). Its period is cross-checked in game at M6.

## M2: Viewer MVP (2026-10-08)

Environment: as M0; Playwright 1.63.0 with headless Chromium (SwiftShader WebGL) for the automated checks; the
same Mac (Apple M3) for the performance run.

| Item                                                                                                                                  | How                                                                                                                                                                                                                                                                        | Result                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| All five examples render; Playwright screenshot per example at fixed camera angles, committed as baselines                            | `e2e/viewer.spec.ts` "examples render": iso and top views of each example, baselines in `e2e/__screenshots__/` per OS (`-darwin`, `-linux`), 2% pixel tolerance                                                                                                            | Pass                                                                                     |
| Clicking each directional block in the NOT gate and piston door shows the states written in the design                                | The test isolates the block's layer, looks from the top, clicks the block with the real mouse, and compares the `select` event's position, type and states with core's parse of the same file (levers, torches, sticky pistons)                                            | Pass                                                                                     |
| Layer slider at each Y shows exactly the blocks of layers 0..Y                                                                        | Moves the real range input through every Y of the piston door and T flip-flop and compares `visibleBlockCount()` with the model's block count for y ≤ Y                                                                                                                    | Pass                                                                                     |
| Hostile name `</script><img onerror=alert(1)>` in the name and an annotation renders as literal text in the inspector and the pins    | Playground test: title bar, inspector heading and the opened pin note equal the literal string; no `<img>` in the document or shadow root; no dialog                                                                                                                       | Pass                                                                                     |
| Performance: 10,000-block design holds 60 fps on Tim's Mac                                                                            | `/bench/?blocks=10000` (orbits continuously and counts frames), run on this Mac in headless Chromium on the Apple M3 GPU (ANGLE Metal): 60 fps at 10,000 blocks and at 50,000                                                                                              | Pass (automated). **Optional:** Tim opens `/bench/` in his own browser to confirm by eye |
| The single-file build opens with networking disabled and renders the NOT gate, and the hostile-name design without executing anything | `rsd bundle` output opened from `file://` with the browser offline: no non-file request, the model's block count matches; the hostile bundle shows the literal name, has one script element, no `<img>`, no dialog                                                         | Pass                                                                                     |
| Security row "Viewer text"                                                                                                            | All design text goes through `textContent`; ESLint bans HTML sinks, `eval` and `new Function`; hostile-name tests above                                                                                                                                                    | Pass                                                                                     |
| Security row "Runtime network"                                                                                                        | `test/no-network.test.ts`: no network API in core, validator, sim, export, cli or mcp; the viewer's one `fetch` is `loadSrc` (same-origin or https:, 2 MB cap, parsed before render). E2E: loading every example in the playground requests nothing outside its own origin | Pass                                                                                     |
| M1 leftover: a Java design renders                                                                                                    | Playground test: E015 in the diagnostics, blocks drawn                                                                                                                                                                                                                     | Pass                                                                                     |

Also checked (e2e unless noted): a design with stage 1 errors shows its diagnostics in place of the canvas; `[`
and `]` change the layer; keyboard alone selects and moves between blocks (Enter, Shift with arrows and Page
Up/Down); instructions mode steps through every step and emits `step` events with the right block counts;
reduced motion jumps straight to the explode position; inline JSON loads when the viewer script runs in `<head>`;
at 320 × 640 (playground) and 320 × 480 (bundle) the inspector is a bottom sheet, the 3D stage keeps at least 35%
of the element, nothing scrolls sideways, and every block projects inside the canvas in the reset and top views;
every example is fully framed at desktop size; theme text, outline, port-label, selection and hover colours pass
4.5:1 (unit test); every block type builds geometry for every state combination, and direction arrows (including
up and down, drawn on the south face) point the way the orientation semantics say (unit tests).

After review: the narrow layout no longer collapses the stage (it measured 0 to 16 px before), framing uses the
narrower of the two fields of view and re-frames after the first layout and after explode, the camera matrix is
updated before projecting or picking, `src` redirects are re-checked, the bundle passes the design as text through
the same parser guards as a file, and `n`/`b` act only in instructions mode.

Bundle: 655 KB for the NOT gate (target under 1.5 MB), one inline script, no `src` or `href`; the only URL-like
string left is the XHTML namespace three.js passes to `createElementNS` (a three.js shader-comment citation is
stripped at build).

Deviations:

- The spec lists explode and instructions mode as viewer features without a milestone; both shipped in M2.
  Inbound `postMessage` commands (`setStep`, `setLayer`, `setMode` with `allowed-origins`) are M7 work.
- The playground has the editor, live diagnostics and viewer; its Share and Download buttons are M7.
- Below 520 px wide the toolbar hides the N/E/S/W snap buttons and the explode slider to keep the 3D stage usable;
  the reset and top views, arrow-key orbit and touch gestures remain, and wider screens show everything.
- Picking selects whole cells rather than the drawn parts, so thin wall torches and dust are clickable.
- The viewer package exports three entry points rather than one `index.ts`: `.` (Node-safe geometry and types),
  `./browser` (the custom element; it touches `HTMLElement`) and `./bundle` (the prebuilt IIFE). Each is a
  documented public API.
- Block edges are thin dark lines judged against the block faces they outline, not the background, so they are
  outside the 4.5:1 check; selection and hover outlines, which sit against the background, pass it.
- Linux baselines were generated in the official `mcr.microsoft.com/playwright:v1.63.0-noble` image (amd64,
  emulated on Apple Silicon) and then re-checked in compare mode there: 22 of 22 pass. CI's first run on GitHub
  confirms them on native amd64.
- Screenshot comparison allows 300 differing pixels (SwiftShader anti-aliasing noise); orientation is checked
  exactly by the geometry unit tests and the select test.

## M3: `.mcfunction` export and in-game proof (2026-10-08)

Environment: as M0. In-game checks ran on a local Bedrock Dedicated Server **1.26.52.3** (the current release on
the registry's 1.26.50 line), in Docker (`itzg/minecraft-bedrock-server:2026.9.0`, arm64), flat creative world
with cheats on and the pack mounted read-only: a throwaway test world on this Mac, driven through the server
console, never a live world. Raw results: `docs/ingame/2026-10-08-m3.json`: **76 passed, 0 failed, 1 skipped**.
Every check fails when the server does not answer (a timeout or a rejected command is a failure, not a "no"), and
every negative control confirms its block was placed before concluding anything.

| Item                                                                                                                                   | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Result                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Golden-file tests for all five examples                                                                                                | `packages/export/test/golden/` holds the build and clear functions of every example and the orientation test; deterministic bytes; a missing golden file fails in CI                                                                                                                                                                                                                                                                                                                                                | Pass                                                                                                          |
| Every line of every golden file starts with `setblock` or `fill`                                                                       | Every line must match the allowlist (`setblock` with `["name"=value]` states, `fill ... minecraft:air`, one comment line of the exact form `# dustwright <slug> registry <version>`) **and** name only block IDs the registry can produce (so no command block, ever). Enforced in tests and at export time                                                                                                                                                                                                         | Pass (see deviation)                                                                                          |
| `../../evil`, 200 characters and emoji names give a safe slug inside `functions/rsd/` or E012; a `--pack` escaping the root is refused | `../../evil` writes `functions/rsd/evil.mcfunction`; emoji is E012; Windows device names (`con`, `nul`, ...) are E012; a 200-character name is E013 (see deviation); nothing is written on refusal. Symlinked directories inside the pack are refused; a symlink or hard link at the target is replaced by an atomic rename, never written through; a missing root is refused; only `functions/rsd/*.mcfunction` and `structures/rsd/*.mcstructure` slug paths are writable, all checked before any file is written | Pass                                                                                                          |
| Orientation test design built in game and compared with the viewer                                                                     | `examples/orientation-test.rsd.json` (generated, 100 blocks: every directional block in every orientation, doors open and closed with both hinges, trapdoors top and bottom, open and closed). In game it builds with nothing dropped and every block stands with the right ID. What each value means was checked by probes (below)                                                                                                                                                                                 | Probes pass. **Waiting on Tim:** the visual side-by-side comparison with screenshots (`docs/verify-m3.md` §1) |
| Each of the five examples builds without popping and works as its tests describe                                                       | Each example built with its own function, no item entities afterwards; every truth-table case on a fresh build: NOT gate 2/2, repeater line 2/2, 2x2 door 2/2, T flip-flop 2/2, plus the T flip-flop sequence on, off, on, off giving 1, 1, 0, 0; the observer clock's dust flickers                                                                                                                                                                                                                                | Pass (automated). **Waiting on Tim:** in-game screenshots                                                     |
| `rsd/<slug>_clear` then `rsd/<slug>` twice gives an identical result; `rsd/<slug>` alone never removes a block                         | `testforblocks`: equal for the NOT gate (10 blocks), repeater line (38) and T flip-flop (144); the 2x2 door is skipped (see deviation). A build into glass filling its box and a one-block margin leaves every unused cell as glass (NOT gate 53 cells, repeater line 151). Also modelled at the command level for every example (unit test)                                                                                                                                                                        | Pass, door excepted                                                                                           |
| Security rows "Exporter paths", "Function files", "--clear", "Behavior pack", "Secrets and worlds"                                     | Path tests above; allowlist plus registry IDs at export time; a hostile-text test (no design text in any function file); clear is a separate function of chunked `fill`s inside the box, top first; the pack manifest test (one data module, no scripts or dependencies); the pack loads with no content-log errors (Pack Stack); no secrets in the repo; no default pack root; the compose file mounts the pack into the test container only                                                                       | Pass                                                                                                          |
| Test world container                                                                                                                   | `deploy/test-world/compose.yaml` brought up on this Mac with BDS 1.26.52.3: NetherNet transport, 19142/tcp, health check `healthy`, `/v1/join` 200 from the host; `enable-pack.mjs` then a restart puts the pack in the Pack Stack                                                                                                                                                                                                                                                                                  | Pass locally. **Waiting on Tim:** bring it up on the server host                                              |

Mapping proofs in game (`docs/ingame/2026-10-08-m3.json`): torch, lever and button supports for every mount,
both button materials (VIG-20, VIG-11, VIG-01); the unlit torch ID is accepted; levers turned on at every mount
and a pressed button light a lamp (VIG-12, VIG-01); repeater and comparator input side for every facing (VIG-16,
VIG-02); piston and sticky piston push direction for all six facings (VIG-14, VIG-19); `setblock` state syntax
(VIG-22), function paths (VIG-24) and the pack manifest (VIG-26) by every build. Negative controls: the mappings
used before the M1 review fail the same probes (the torch breaks on its first neighbour update, the repeater
carries no signal, the facing=2 piston pushes south). Registry entries now carry `verified` records only where
every state's meaning was exercised (stone, lamp, dust, redstone block, torch, lever, button, piston, sticky
piston); the repeater and comparator `cardinal_direction` rows carry a per-state `proven` record while their delay
and modes stay open; every other row stays VERIFY-IN-GAME (W108). The `by` field names the automated check; Tim's
sign-off is separate.

Deviations and findings:

- **Comment line in function files.** The spec says every line starts with `setblock` or `fill`, and that comments
  carry the slug and registry version. Both hold: the one allowed comment line has a fixed shape.
- **A 200-character name is E013** (the name limit is 80), not a derived slug; the checklist item allows E012 or a
  safe slug, and E013 is the stricter outcome that the parser reaches first.
- **A design that moves at rest cannot be rebuilt in place.** The 2x2 door's torches extend its pistons once built,
  so building again over it pushes its blocks a second time. The check is skipped for it; `AUTHORING.md`, the
  design's description and the checklist say to run the clear function first. A stage 3 warning for designs that
  move at rest is noted for M6.
- **Observer clock output.** In game the pulses come too fast for a lamp to go dark, so the east output is now
  dust; the west lamp stays lit, and the description says so.
- **New function files need a server restart.** A reload picks up edits to existing functions but does not find
  new files; the README and checklist say so.
- **NetherNet.** BDS 1.26.5x accepts players only over NetherNet (TCP); the compose file uses it.
- **Placement order** (ADR 0006): in game a component placed before its support survives if the support arrives
  later in the same function; the order remains as the protection against circuits firing half-built.
- **In-game evidence is automated.** Tim's visual and in-game sign-off (`docs/verify-m3.md`) remains the gate.

## M4: `.mcstructure` export (2026-10-08)

Environment: as M3 (local BDS 1.26.52.3 test world in Docker, console only). Raw results:
`docs/ingame/2026-10-08-m4.json` (the full in-game suite, M3 and M4 checks: **116 passed, 0 failed, 6 skipped**, each skip with its reason) and
`docs/ingame/2026-10-08-m4-roundtrip.txt`.

| Item                                                                                                               | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Result                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round trip: build the orientation test in game, save it, export it; parse both and diff palettes and block indices | Built with `/function rsd/orientation-test`, saved with `/structure save dustwright:roundtrip ... disk` (the storage a structure block also uses), extracted from the world database with `deploy/test-world/extract-structure.py` (amulet-leveldb), compared with `deploy/test-world/compare-structure.mjs` (prismarine-nbt, raw tags, fails on any difference): **all 230 blocks of the 6,048 cells have the same name, states and tag types** (booleans as bytes, integers as ints). Repeated with the T flip-flop, which contains dust: all 88 blocks identical, `redstone_signal` an int. This proves the semantics: cell order, palette, state names and tag types, block-state version. It does not prove the container encoding, which differs: the game writes `format_version` 2 with one layer as an int array, Dustwright writes `format_version` 1 with two layers as int lists (the second all -1); the game's block entities (33 and 3) are absent from ours. That encoding is proven by `/structure load` reading it correctly (next row) | Pass. **Waiting on Tim (optional):** the same comparison against a structure block's client Export (`docs/verify-m4.md` §1), which may differ in container again                               |
| `/structure load rsd:<slug>` places all five examples correctly, including with 90° rotation                       | Every example, and the orientation test, loaded unturned and with `90_degrees`: every block in place by ID and orientation state (the turned load checked against the model turned in code: cell (x, y, z) to (sizeZ - 1 - z, y, x), facings and wall mounts turned clockwise, floor and ceiling lever axes not checked); nothing dropped; every truth-table test passes on both loads. A negative control in review: the unturned states fail the turned check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Pass; the 2x2 door's exact-placement check is skipped both ways (it moves at rest), and its tests pass both ways. **Waiting on Tim:** a visual check with screenshots (`docs/verify-m4.md` §2) |
| Exporter refuses designs over the size limit with E007                                                             | Unit test with a 65-wide model; the parser already refuses larger grids                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Pass                                                                                                                                                                                           |

Also checked: air cells are structure void, so loading leaves existing blocks alone (orientation test 5,818
cells, 2x2 door 47, T flip-flop 56); the palette has one entry per distinct block; outputs are deterministic
(binary golden files); the cell order is z fastest, then y, then x.

Deviations and findings:

- **NBT library: nbtify, not prismarine-nbt.** prismarine-nbt compiles its protocol with `eval` (protodef) when it
  is imported and needs Node's `zlib` and `Buffer`, so it cannot run in the site under the CSP (no `unsafe-eval`), and
  M7 builds structures in the browser. nbtify (MIT, TypeScript, no code generation, DataView only) writes the
  files; prismarine-nbt stays as a dev dependency that independently decodes them in tests and in the comparison
  tool. Proposed spec amendment to the runtime dependency list.
- **The `Exporter` interface may return a Promise** (`ExportResult | Promise<ExportResult>`), because nbtify's
  writer is asynchronous. Callers always await. Proposed spec amendment.
- **Block-state version.** Palette entries carry `PINS.blockStateVersion` (1.21.60.33, packed as 18168865), measured
  from the structure the game saved, not the game version: the game stamps its block-state version.
- **`format_version` 1**, as before; the game writes 2 and loads 1 correctly.
- **Air is structure void (-1)**, so `/structure load`, like `/function`, never removes blocks; the spec does not
  say which, and this keeps both exporters consistent.
- **New structure files need a server restart**, like new function files.
- **A freshly started server can accept commands before its chunks tick**, so circuits do not react; the in-game
  check now waits until a redstone block lights a canary lamp, and stops instead of reporting false failures.

## M5: Validator stages 1 and 2 (2026-10-08)

Environment: as M3 (local BDS 1.26.52.3 test world in Docker, console only). Support faces measured in game:
`docs/ingame/2026-10-08-supports.json`. Full in-game suite re-run after the console helpers moved into
`deploy/test-world/console.mjs`: `docs/ingame/2026-10-08-m5.json`, **116 passed, 0 failed, 6 skipped** (the same as M4).

| Item                                                                 | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Result |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Each diagnostic code has a passing and a failing fixture, all tested | `packages/validator/fixtures/<code>/{pass,fail}.rsd.json` for the 22 codes of stages 1 and 2 plus the exporter's E014 (23 directories) (T codes arrive with the simulator in M6). `packages/validator/test/fixtures.test.ts` checks the fixture set equals the catalogue, the failing fixture reports its code, the passing one does not and has no errors at all                                                                                                                                                                                                                                                                                                                                                                                                              | Pass   |
| All examples and patterns validate with zero errors                  | `rsd validate` on every example: 0 errors. Warnings: W108 (blocks not yet verified in game), W102 on the orientation test's repeaters and comparators (they point at air by design) and on the T flip-flop's repeater at [3,2,4] (it outputs into the cell a pushed block moves into, which is air as written). No patterns exist yet (M8)                                                                                                                                                                                                                                                                                                                                                                                                                                     | Pass   |
| `--json` output matches a published JSON Schema for diagnostics      | `packages/core/schema/diagnostics.json` (exported as `@dustwright/core/schema/diagnostics.json`). `packages/cli/test/diagnostics-schema.test.ts` validates with ajv the `rsd validate --json` output for every example and every fixture, an unreadable file, bad arguments, and `rsd export --json` on success and failure; the schema's code enum must equal the catalogue                                                                                                                                                                                                                                                                                                                                                                                                   | Pass   |
| `--strict` exits 1 on a warnings-only design                         | `packages/cli/test/validate.test.ts` (observer clock: W108 only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Pass   |
| `docs/diagnostics.md` is generated and has no diff                   | `pnpm docs:check` in CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Pass   |
| Diagnostics show in the viewer as markers on the affected blocks     | The viewer runs the stage 1 and 2 rules on load (`@dustwright/validator/static`, core only, so the bundle grows 10 kB to 673 kB and carries no exporter) and puts one marker per blamed cell in the label overlay, coloured by the worst severity; clicking it selects the block and the inspector lists the findings with hints. The playground passes the full validator's diagnostics with `setDiagnostics`. e2e: a W102 fixture marks exactly [2,1,0] and the marker opens the repeater with W102; an E006 fixture renders with one error marker per blamed cell; the T flip-flop's markers equal its list; a clean NOT gate has none; `setDiagnostics` replaces them; a single-file bundle shows the markers offline. Screenshot baselines regenerated on macOS and Linux | Pass   |

Deviations and findings:

- **Support faces are measured, not remembered.** `supportsTop`/`supportsTopWhen` became `faces` (top, side,
  bottom, with state overrides), filled from an in-game table: every registry block (and the half, open and facing
  variants that change its shape) against floor, wall and ceiling components, a component counting as held when it
  survives a neighbour update and breaks when the support is removed. Glass holds on every face; honey and hoppers
  only on top; bottom slabs, bottom stairs, closed bottom trapdoors and daylight sensors only underneath; top slabs,
  stairs and trapdoors only on top; open trapdoors on none. `packages/core/test/supports.test.ts` keeps the registry
  equal to the table.
- **Levers attach to any block that stands by itself** (they held on every such block, on every face), recorded
  as `needsSupport.anyBlock`. E006 fires for a lever only when there is no block, or the block is a component
  (dust, a torch, a repeater...): the game would not place those as supports in the measurement, so they are
  unproven and treated as not holding.
- **Stair sides are treated as not holding.** Only the default facing was measured (the wall component on its
  side face, which broke), so other faces, such as the full back, are unproven. Being conservative can only add a
  false E006, never hide a broken build. Measuring each facing is a follow-up.
- **The stage 2 rules are static approximations** of power flow (no ticks), and the mechanics they assume carry a
  VERIFY-IN-GAME note in `packages/validator/src/rules/power.ts` until the simulator's game cross-check (M6):
  W101 counts dust steps from the nearest fed dust (a torch is a source whatever its initial `lit`); W102 accepts
  a diode's back and sides (subtract and lock inputs) but not its front; W103 counts a conducting block only when
  the dust lies on it or points into it and something beyond takes the power (a consumer, a diode input, a torch);
  W104 needs the torch's dust network to lie on its support or point into it; W105 looks for power at the cell
  above a piston that has none of its own. The simulator is the authority on behaviour; these point at likely
  mistakes. The rules are linear in the design size: a 48,768-block torch-and-dust design that took 6.2 s in review
  (W104 was quadratic) now validates in 0.25 s, and a unit test holds a 50,000-block case under 3 s.
- **Evidence file annotated by hand.** At the time of the run `measure-supports.mjs` printed `when`, `container` and `table` (it now also prints `tool`); the saved `docs/ingame/2026-10-08-supports.json` keeps `when` and `table` as printed and replaces `container` with `server` and `tool` descriptions written after the run.
- **New package entry points:** `@dustwright/validator/static` (stage 1 and 2 rules on a parsed model, importing
  only core) and `@dustwright/core/schema/*.json`. The viewer now depends on the validator, which is still inward.

## M6: Simulator (2026-10-08)

Environment: as M3 (local BDS 1.26.52.3 test world in Docker, console only). Timing cross-check:
`docs/ingame/2026-10-08-m6-timing.json`. Full in-game suite re-run (the console helper changed): `docs/ingame/2026-10-08-m6.json`, **116 passed, 0 failed, 6 skipped** (the same as M5), run on a cold start
with the timing probe removed.

| Item                                                                                                                                          | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Result                     |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Every example's `tests` pass                                                                                                                  | `rsd validate` on every example runs stage 3: no T diagnostics. `packages/sim/test/mechanics.test.ts` runs every case and also flips every expectation, which must then fail, so the tests are not vacuous. The T flip-flop also toggles through four presses (1, 0, 1, 0)                                                                                                                                                                                                                                                                                                                                                                                | Pass                       |
| Unit tests: dust decay over 15 blocks, repeater delays 1 to 4, comparator subtract, torch inversion, observer pulse length, piston push limit | `packages/sim/test/mechanics.test.ts`: dust 15 down to 0 over 16 blocks; a repeater of delay d lights the lamp d + 1 redstone ticks after the lever; locking from the side; subtract 14 - 6 = 8 and compare; NOT gate lamp off 2 ticks after the lever; observer pulse 2 game ticks, 3 after the change; 12 blocks pushed, 13 not; no quasi-connectivity                                                                                                                                                                                                                                                                                                  | Pass                       |
| A clock with `afterTicks` of 1,001 reports T002 within the budget; a comparator reading a container reports T003 and is skipped               | Unit tests, and fixtures T001 to T003 in `packages/validator/fixtures/`. The 1,001-tick case reports T002 without running (under 1 s). The budget counts cell updates, not time (a dust cell weighs 8, a consumer's or piston's power check 10, any other cell 1). The worst cases found end in T002 for every case after about 5 s and at most 260 MB, each with 64 cases of 1,000 ticks: a 49,152-block observer-clock design, 6 pairs of 64 x 64 stone and dust layers, and 6 pairs of 64 x 64 lamp and dust layers, both driven by an observer clock (the review measured 20 s and 8.5 s for the last two before dust and power checks were weighted) | Pass                       |
| **Game cross-check:** observer clock period and T flip-flop toggle measured in game match the simulator (logged)                              | `deploy/test-world/measure-timing.mjs` probes at game-tick resolution with a function run every game tick. Observer clock: every gap between rises 6 game ticks (44 of 44) and every pulse 2 (47 of 47); simulator 6 and 2. Lone observer: pulse 2 (8 of 8), simulator 2; delay 4 or 5 game ticks from a console-set lever, simulator 3. T flip-flop: toggles 1, 0, 1, 0 in both; latency 7, 10, 8, 10 game ticks from a console-set lever, simulator 8                                                                                                                                                                                                   | Pass, with the slack below |
| Power view in the viewer shows the simulated state for a chosen test and tick                                                                 | Toolbar "Power": Off, Free run, or a test case, and a tick slider. e2e: the NOT gate's lamp lit at the moment A=1 is set and out at the end, with the lever on and the dust at 15; the inspector shows simulated power; the T flip-flop's redstone block is drawn where the piston pushed it; the observer clock's free run pulses. Screenshot baselines regenerated (the toolbar changed) on macOS and Linux                                                                                                                                                                                                                                             | Pass                       |

Deviations and findings:

- **The simulator steps in game ticks** (ADR 0007), because the measured observer clock period, 6 game ticks, is
  not a whole number of redstone ticks for a pair. Every tick count in the format and the diagnostics is still a
  redstone tick. The first in-game run with redstone-tick steps disagreed (period 3 redstone ticks in game, 2 in the
  simulator); the observer timing changed to the measured values and a regression test holds them.
- **Console slack.** An input set from the console lands at an arbitrary point of a game tick, so latencies measured
  from it carry up to two game ticks of slack, and the check allows that. The lone observer was consistently one to
  two game ticks later in game than in the simulator; the observer clock, which is internal to the game, matches
  exactly. The other delays (torch, repeater step, comparator, piston, lamps and doors: one redstone tick each)
  are assumptions, marked VERIFY-IN-GAME in `packages/sim/src/mechanics.ts`; the T flip-flop latency is consistent
  with them but does not prove each one.
- **The probe breaks ticking.** With the probe's tick function installed, redstone stopped ticking in most of the
  test world's ticking area (a redstone block no longer lit a lamp), and the in-game suite failed; with it removed,
  every spot ticked again. The tool now has `uninstall`, and the README says to remove the probe straight after a
  run. The timing results stand: the tool checks that each of its build sites ticks before it measures.
- **Build-time observer pulses** follow the export placement order (ADR 0006): an observer fires once at build
  time only when the block it watches is placed after it, as in the game.
- **Not modelled (T003):** comparators reading containers, daylight sensors, pistons moving containers, slime and
  honey. Pistons break components in their way, as their registry `needsSupport` says they need support.
- **Known gaps, not reported:** a door's upper half is not a cell, so a piston can push a block into it; a
  comparator reading a container through a solid block is not detected; dispensers are `container: false` in the
  registry, so a comparator reading one gets 0. All are rare in redstone designs and listed for later.
- **Registry-driven:** the simulator dispatches on `sim.class` and `sim.params`, and the core topology helpers it
  shares with the stage 2 rules (moved from the validator into core) read `sim.class` too. The stage 2 rules still
  name types in places. Unproven assumptions are a VERIFY-IN-GAME block at the top of `simulation.ts`.
- **Review fixes:** one piston moving another on the tick it fires crashed the simulator (a design could make
  `rsd validate` exit 2); pistons now act as cells, a moved one acts next tick, and a regression test checks every
  extended piston has its head. A simulator error is now a T003 naming it, and in the viewer a message, not a crash.
- **The viewer bundle now carries the simulator** for the power view (687 kB, up from 673 kB); it still carries no
  exporter (`test/static-rules.test.ts`).

## M7: Public site, embedding, bundle and layer sheets (2026-10-09)

Environment: as M6. Browser tests run against the built site (`vite preview`) on two ports, which are two origins,
in Chromium on macOS and in the Linux Playwright image (45 passed on each before the review fixes, 47 after). In-game: `docs/ingame/2026-10-09-mcpack.json`.

| Item                                                                                                                                                                                  | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Result                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `<redstone-viewer>` works in a plain HTML page with `src` and with inline JSON                                                                                                        | `apps/site/public/plain-example.html` loads only `/redstone-viewer.js` (the single-file script, no modules) and shows the NOT gate twice, by `src` and from an inline `<script type="application/json">`; e2e checks both render, with no CSP violations                                                                                                                                                                                                                             | Pass                                                                                                  |
| `viewer.html?src=` works inside an iframe on a page on another origin, the shape a MediaWiki embed extension produces                                                                 | e2e: `embed-example.html` served from port 4320 frames `viewer.html?src=...` from port 4319; the viewer loads the T flip-flop and its `ready` and `step` events arrive at the host                                                                                                                                                                                                                                                                                                   | Pass                                                                                                  |
| `postMessage` events fire and are documented with an example host page                                                                                                                | `docs/embedding.md` (also on the site at `/docs/embedding.html`) documents the outbound events and inbound commands; `embed-example.html` logs every event and drives the viewer                                                                                                                                                                                                                                                                                                     | Pass                                                                                                  |
| A `setStep` message from an origin not in `allowed-origins` is ignored; from an allowed origin it moves the step (Playwright, two origins)                                            | e2e: with the host's origin allowed, Next moves the viewer to step 2 and Previous back; with only `https://example.org` allowed, the host's `setStep` leaves the viewer on its first step (index 0) and no events reach the host, and a positive control then steps it directly to show it was ready; a malformed command from an allowed origin (an extra key, a string step) is ignored. Unit tests cover the exact shapes, prototype tricks, and `*` refused in `allowed-origins` | Pass                                                                                                  |
| `rsd bundle` output is under 1.5 MB, works offline, and publishes as a Claude artifact that renders and orbits on desktop and phone                                                   | The bundle is 675 KB (piston door); the M2 offline e2e (networking disabled) still passes. Published unchanged (`rsd bundle examples/piston-door-2x2.rsd.json`, 691 KB, one inline script, no remote URLs; read in full before publishing) as a private Claude artifact: https://claude.ai/artifact/RHDzgcrTHX79vL8BnbVjNF                                                                                                                                                           | Size and offline: pass. **Waiting on Tim:** open the artifact on a desktop and a phone and orbit it   |
| `apps/site` builds and runs locally; `/view#d=`, `/view#json=`, `?src=` and a dropped file each open the NOT gate (Playwright against the local build)                                | `pnpm build` builds 12 pages; e2e opens the NOT gate from a Share link (`#d=`), `#json=`, `?src=/examples/not-gate.rsd.json` and a dropped file                                                                                                                                                                                                                                                                                                                                      | Pass                                                                                                  |
| Playground: breaking the NOT gate shows the diagnostic within a second; Download pack yields a `.mcpack` that imports on a phone and a PC and builds via `/function` (manual, logged) | e2e: E003 shows within 1 s of the edit. The playground's `.mcpack` is byte-identical to `rsd pack`'s (e2e). That pack, installed on the test server like an import, loads ("Pack Stack [01] Dustwright: mcpack-check"); `/function` builds a NOT gate whose lamp is lit and goes out when the lever is on, and `/structure load` builds it too (5 of 5)                                                                                                                              | Pass for the server. **Waiting on Tim:** import by double-click on a phone and a PC, then `/function` |
| The `_headers` file, the nginx snippet and the meta CSP fallback exist and CI checks their content                                                                                    | `apps/site/csp.ts` is the source; `apps/site/test/headers.test.ts` checks `public/_headers`, `deploy/nginx/dustwright.conf` (also that no location drops the headers) and the meta CSP in every built page and the plain page, and that no built script uses `eval` or `new Function`. e2e loads every page with no CSP violation. Live-host verification is deploy-stack work                                                                                                       | Pass                                                                                                  |
| A 64 KB fragment opens; a 65 KB one is refused with E013                                                                                                                              | Unit test at exactly 64 KB and one byte over; e2e: a 64 KB `#json=` opens the NOT gate, a 65 KB one shows E013 and no design. A `#d=` that would inflate past 2 MB is refused with E013 too                                                                                                                                                                                                                                                                                          | Pass                                                                                                  |
| The layer sheet SVG and the bundle for the hostile-name design (M2) contain its text only as escaped data (golden + Playwright)                                                       | Golden sheets for the hostile design (`packages/export/test/golden/sheets/`); the test also checks that only the renderer's own elements appear. e2e opens the sheet: its title text is the name verbatim, with no `img`, `script` or `foreignObject` and no dialog. The bundle's M2 golden and e2e still pass, and a hostile `#json=` link renders the name as text                                                                                                                 | Pass                                                                                                  |
| Layer sheet SVGs for the piston door print legibly on A4 (manual check)                                                                                                               | Sheets are A4 (210 × 297 mm), cells up to 9 mm, numbered with a legend, arrows for facing; checked on screen at A4 size, and the orientation test's long legend continues on a second sheet instead of being cut off                                                                                                                                                                                                                                                                 | **Waiting on Tim:** print one                                                                         |

Deviations and findings:

- **The legend of a busy layer no longer fits one page**: the first draft silently dropped entries past the page
  end (the orientation test's layer 1 has 80 specs). The legend now continues on extra sheets
  (`<slug>-layer-NNN-legend-2.svg`), and a test checks every block's spec appears in its layer's sheets.
- **Zip timestamps**: zip entries carry a DOS date in local time, so every zip (`.mcpack` and the playground's sheet
  zip) goes through one helper, `zipDeterministic`, with a date made from local parts (1980-01-01 00:00). A test
  builds the pack under five time zones and compares it with the golden; two sheet downloads a second apart are
  identical (e2e). The review caught the sheet zip using the current time before the helper existed.
- **The CSP is stricter than the spec's** for every page, `viewer.html` included: `frame-src 'self'` (no page frames
  another site), `object-src 'none'; base-uri 'none'; form-action 'none'`. The review found the first draft allowed
  `frame-src https:` and the embedding example framed any `?viewer=` URL, which made the site a phishing canvas;
  `viewer=` now accepts only this site or a loopback build (e2e: a foreign one falls back to `/viewer.html`), and
  only the example's meta CSP adds loopback frames, for trying it against a local build. `frame-ancestors` is not
  set: framing `viewer.html` is the point, and the site has no state to clickjack.
- **Outbound events** go to `*` without `allowed-origins` (as before) and only to the listed origins with it.
- **nbtify loads on demand** in the browser (first structure written), and the structure golden files are unchanged.
- **Pack manifests** come from one builder (`packages/export/src/manifest.ts`); the committed test-pack manifest is
  tested equal to its output. Design packs use UUIDv5 of the slug under a fixed namespace (`PACK_NAMESPACE`).
- **Dependencies**: fflate 0.8.3 (zip and nothing else at runtime; MIT, no dependencies) and marked 18.0.14 (site
  build only).
- **Drafts** persist in the playground per browser (`localStorage`, every access guarded): a reload without
  `?example=` brings the last draft back (e2e). The bench page (M2) is served by the dev server only and is no longer
  in the public build.
- Not done: very large designs exported in the browser may be slow (a 64 × 384 × 64 structure takes about 224 MB of
  heap, measured in M4); the site does not guard against it beyond the 50,000-block limit.

## M8: LLM authoring (2026-10-09)

Environment: as M6 (local BDS 1.26.52.3 test world in Docker, console only). Eval agents: Claude Code 2.1.295 in print
mode (`claude -p`), a fresh session per prompt with no settings, memory or other MCP servers, run by
`scripts/eval/run.mjs`. In-game evidence:

- `docs/ingame/2026-10-09-m8.json`: the full suite on a cold start, **181 passed, 0 failed, 13 skipped** (probes 54,
  examples 22, patterns 59, orientation 2, structures 44; every skip logged with its reason).
- `docs/ingame/2026-10-09-patterns.json`: the patterns again after the review's RS latch fix, **60 passed, 0 failed,
  6 skipped**.
- `docs/ingame/2026-10-09-eval-builds.json`: the eval outputs (below).

The in-game script changed between these runs: the full suite predates the RS latch sequence, the `--dir` layout
and the pack check; the patterns rerun predates only `--dir` changes; the CLI eval-builds run used the final script.

Checks: `pnpm build`, `lint`, `typecheck`, `test` (636 passed), `gen:check`, `docs:check` and `check:licenses` pass;
e2e 48 passed on macOS and in the Linux Playwright image, with the screenshot baselines unchanged.

| Item                                                                                                                                                                                     | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Result                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTHORING.md` and `patterns/` complete; every pattern verified in-game and passing its tests                                                                                            | `AUTHORING.md` is 2,796 words (under the spec's 3,000): axes, grid rules, orientation, the block list, common mistakes, the loop with the CLI and MCP, the share-link recipe and two worked examples. 13 patterns (`patterns/`, listed in AUTHORING.md and on `/patterns`): NOT, AND, OR, XOR, RS latch, T flip-flop, repeater line, observer clock, repeater clock, pulse extender, pulse limiter, 2x2 piston door, hopper sorter. `test/patterns.test.ts`: each has ports, tests and a description, validates with no errors, only the hopper sorter skips its tests (T003), the five copied from `examples/` stay equal to them, and the RS latch goes through set, hold, reset, hold and set again in one simulation. In game every test case runs on a fresh build, with sequences for the RS latch and T flip-flop, rebuilds, the clocks running and the hopper sorter sorting | Pass: 60 passed, 0 failed, 6 skipped (rebuild in place, reason logged)                                                                                                                                                                                                                      |
| **Eval (CLI):** 10 fixed prompts through the authoring loop by a fresh agent given only `AUTHORING.md` and the CLI; at least 8 of 10 reach zero errors and passing tests within 6 rounds | `scripts/eval/prompts.json` (3-input AND, hidden 2x2 door with a button on each side, NOR, XNOR, toggle lamp, switched clock, 40-block line, 3 s pulse extender, memory cell, exactly one of two). Each agent works in an empty directory holding only `AUTHORING.md`; `rsd` is its only pre-approved shell command and the file tools are limited to that directory. The harness validates the final file itself. `docs/eval/2026-10-09-cli/` holds, per prompt, the design and the full transcript, plus `results.json`                                                                                                                                                                                                                                                                                                                                                            | **10 of 10** reach zero errors and passing tests, within 1 to 3 rounds. One of them does not do what was asked (the toggle lamp, below)                                                                                                                                                     |
| **Eval (MCP):** the same prompts through `@dustwright/mcp`, with the tool descriptions as the only extra prompt                                                                          | `rsd mcp` (stdio JSON-RPC: `authoring_guide`, `validate`, `simulate`, `list_patterns`, `get_pattern`, `bundle`, `export`, `pack`, `sheets`); the agent gets no file or shell tools, only the server. A round is a `validate` or `simulate` call. `docs/eval/2026-10-09-mcp/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **10 of 10**, within 1 to 5 rounds (7 in one round, 2 in two, 1 in five). 9 of 10 started from a pattern (`get_pattern`)                                                                                                                                                                    |
| An agent with no tools writes a `/view#json=` link for the NOT gate from `AUTHORING.md` alone, and it opens correctly                                                                    | `scripts/eval/link.mjs`: a fresh agent with no tools gets `AUTHORING.md` in the prompt and replies with one link (`docs/eval/2026-10-09-link.json`). `e2e/eval-link.spec.ts` opens that link against the local build: the NOT gate loads with no diagnostics, and the power view shows the lamp lit with the lever off and out with it on. AUTHORING.md contains the NOT gate and the start of its link, so this is close to a copy task, as the spec intends                                                                                                                                                                                                                                                                                                                                                                                                                        | Pass                                                                                                                                                                                                                                                                                        |
| The 3 best eval outputs are built in-game and work                                                                                                                                       | Four CLI outputs: the three most involved that work (hidden 2x2 door, memory cell, switched clock) and the toggle lamp, the largest. Each is exported with `rsd export` and run with `ingame-check.mjs --dir <dir> --pack <pack>`, which first checks that the pack's functions are that design's export. Then every truth-table case runs on a fresh build, and the memory cell goes through set, reset, set, reset in one build. The switched clock's lamp keeps changing while its lever is on. The toggle lamp gets four presses. The MCP toggle lamp was built too. All in `docs/ingame/2026-10-09-eval-builds.json`                                                                                                                                                                                                                                                            | **Pass** for the door, the memory cell and the switched clock: 43 passed, 1 failed, 4 skipped across the four CLI designs. The one failure is the CLI toggle lamp: 1, 1, 0, 0 over four presses, and the simulator shows the same. The MCP toggle lamp toggles in game (7 passed, 0 failed) |

Deviations and findings:

- **An eval output can pass its tests and miss the brief.** The format's tests start every case from a fresh build,
  so they cannot express a sequence. The CLI toggle lamp tests only the first press, and its second press does not
  turn the lamp off, in the simulator and in game. Counted by the spec's measure (zero errors, passing tests) the
  CLI eval is 10 of 10; counted by the brief it is 9 of 10. Still within the target. Both memory cells hold set and
  reset over a sequence in the simulator, and the MCP toggle lamp toggles. A sequence form for tests would close
  this gap; it is a format change, for `docs/ideas.md`.
- **Eval method, as run:**
  - `results.json` was rescored from the transcripts (`--rescore`), so its `seconds` and `exit` fields are empty.
  - A CLI round counts every Bash call that contains `rsd validate`, denied ones too, so the counts are
    conservative. Counting only validate runs, 8 of 10 CLI agents were clean on their first and 2 on their second.
  - Besides `rsd`, Claude Code ran a few read-only commands on its own (`ls`, `cat`, `which`).
  - `rsd mcp` was not blocked in the CLI run. One CLI agent (toggle lamp) tried to call `get_pattern` through it;
    the attempt failed (no `timeout` command on macOS) and its retry was denied. So no CLI agent saw a pattern, but
    the harness did not guarantee it. It now does: in CLI mode the `rsd` wrapper refuses `mcp`, and
    `Bash(rsd mcp:*)` is disallowed.
  - One run per prompt (no repeats), on one model. The prompts were fixed before the runs. AUTHORING.md as the
    agents read it was the file at the time; it has changed since only in the share-link size note (below).
- **The MCP server is part of the CLI** (`rsd mcp`), with the transport-free core in `@dustwright/mcp`: tools and a
  JSON-RPC line handler, tested with an in-memory host.
  - Tool results are JSON text. Argument errors are tool errors (`isError`), not protocol errors.
  - Every design goes through the same 2 MB guard as the CLI.
  - `simulate` uses the validator's own run, so all cases share one simulation budget, as in `rsd validate`. The
    review found it gave each case a fresh budget and simulated twice: a hostile 64-case design took about
    5 minutes and blocked the server. The same design now takes 4.2 s, the time `rsd validate` takes. A test holds
    the shared budget.
  - `export` writes through the same pack writer as `rsd export` (only `functions/rsd` and `structures/rsd`, never
    through a symlink). `bundle` writes only `.html` paths and `pack` only `.mcpack` paths. `sheets` writes SVGs
    named from the slug into the directory given.
  - The server runs with the user's rights, like any local MCP server. SECURITY.md has a row for it.
- **The RS latch is built reset (Q off).** As first authored it rested set, so its "S sets Q" test passed even with
  S wired to nothing (found by the review). Built reset, the S test means something. A sequence (simulator unit test
  and in game) checks set, hold, reset and hold.
- **Measured in game while testing patterns.** These are new findings, added as comments in `ingame-check.mjs`:
  - `/setblock` replacing a block with the same block in another state does not notify its neighbours (dust,
    buttons). So a button set pressed over a released one powers nothing; the check goes through air.
  - A button or lever placed by `/setblock` does not update the neighbours of the block it hangs on, so a torch on
    that block stays lit. The check swaps that block for another full block that conducts power, and back one tick
    later. The first stand-in, glass, unpowered the block for that tick. A latch that holds its own button's block
    powered (the eval memory cell, through a repeater) then lost its state on release. With a conducting stand-in
    it holds.
  - A button set pressed by `/setblock` never releases itself. The registry's pulse lengths (stone 10, wood 15
    redstone ticks) therefore cannot be measured from the console. They are assumed, marked VERIFY-IN-GAME in
    `packages/sim/src/mechanics.ts`, and the check releases the button after that length. Tim's optional
    real-button check (PROGRESS) covers it.
  - A design rebuilt in place over itself keeps dust that is powered at rest at a stale 0 (the same notification
    gap). Such designs are rebuilt only after their clear function. The check finds them from the simulator's
    settled state and logs the skip with its reason.
  - The hopper sorter sorts, but the sorted item waits in the bottom hopper until the next one arrives. Its tests
    are T003, because comparators reading containers are not simulated. Instead, the in-game check sends a
    cobblestone (it passes through: lamp off) and two iron ingots (lamp lit).
  - A torch left under the floor by an earlier run powered a build placed over it. Builds in the air band now clear
    a one-block margin first.
- **The test server's state broke power in some chunks.**
  - After long runs, a lever stopped powering its block in 9 of the 20 chunks of the check area (dust beside it
    read 0), while the lamp that `worldTicks` watches kept working. A cold start cleared it.
  - Twice, a cold start came up with one chunk not loaded at all ("Cannot test for block outside of the world"),
    and ticking areas added over it did not load it.
  - Once, half the area stayed unpowered after a start until the build bands, full of clocks left running by
    earlier runs, were cleared.
  - The check now probes every chunk before a run (waiting up to a minute for loading) and after it: a lever, its
    block and dust beside it, in the sky. Any failure makes the run invalid.
- **Reading the game more carefully.**
  - What follows a button press is a pulse, so tests that press a button are read from just before `afterTicks`,
    like the pulse patterns. The door, open for about 1.5 s, was shut again by the first piston read.
  - Emulated presses are timed from when the press landed, less one command's latency. Timed from the start of the
    press, a stone button stayed pressed about 14 ticks, which filled the repeater clock's 16-tick loop.
  - The observer clock gained tests in M8, which brought it into checks it skipped before. Its rebuild-in-place
    comparison is meaningless on a free-running clock and is skipped with that reason. Its exact dust level, read
    one query per level, was outrun by the clock. Dust reads now ask the expected level first and repeat a scan
    that matched nothing, and a timed test on dust polls the expected level alone until its deadline (eight copies
    of the clock then passed every test).
  - The clock check samples for up to 8 seconds, until it sees both off and on, and samples dust with one query.
  - These change when a value is read, not what counts as a pass: a reading must still match the expected value
    exactly. Compared with M6's evidence, no earlier check changed status.
- `--dir` places designs in one column by their real size and refuses a design that does not fit. The eval designs'
  sequences and clock inputs are named in the script (`SEQUENCES`, `CLOCK_START`).
- AUTHORING.md's share-link note was wrong about size: the site's 64 KB applies to the fragment as the browser
  sends it, and browsers encode `"`, `<` and `>` again. It now says to keep the JSON under about 20 KB.
- `examples/observer-clock.rsd.json` gained two tests (pulse timing, measured in M6) so the pattern carries tests.
- Not done: the eval was not re-run after the harness change (it spends model calls, and the run above is honest
  about what happened).

## M9: Java edition profile (2026-10-09)

Scope: `docs/m9-java.md`. Environment: two local Java 26.3 servers in Docker (`deploy/test-world-java/`): Fabric with
no gameplay mods (vanilla logic) for probes, supports, timings and patterns, and Paper with WorldEdit only to load
and save `.schem` files. Commands over RCON, answers read directly. Evidence in `docs/ingame/`:
`2026-10-09-java.json` (probes and patterns), `2026-10-09-java-supports.json`, `2026-10-09-java-timing.json`,
`2026-10-09-java-schem-roundtrip.json`, `2026-10-09-java-conductivity.json`. The full Java check (probes and
patterns): **114 passed, 0 failed** (63 probes, 51 pattern checks).

Checks: `pnpm build`, `lint`, `typecheck`, `test` (731 passed), `gen:check`, `docs:check` and `check:licenses` pass;
e2e 50 passed on macOS and in the Linux Playwright image (screenshot baselines unchanged). The first Linux run
crashed Chromium for want of memory while both Java servers ran in the same Docker VM; with them stopped, all passed. The Bedrock side is unchanged (its mappings, generated registry and orientation test are byte-identical;
`gen:check`), so the Bedrock in-game suite was not re-run.

| Item                                                                             | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every v1 pattern has a Java verification entry or a documented reason it differs | Each pattern, as a Java design, is built in the Fabric world with `/setblock` from the registry's Java mapping; every test case runs on a fresh build, the RS latch and T flip-flop run their sequences, the clocks must keep changing and the hopper sorter sorts real items. Every wire with air above it (105 of the 106 in the patterns) must have the connections our `dustShape` gives it (what the `.schem` and `.litematic` carry) after an update that makes the game work them out again. Entries per pattern: `docs/patterns-java.md` | **Pass:** 13 of 13, 51 checks passed, 0 failed. None needed a Java change; the observer clock runs faster on Java (noted)                                                                                                                                                                                                                                                                                                                         |
| The M3 orientation test design round-trips through `.schem` into a Java world    | `deploy/test-world-java/schem-roundtrip.mjs`: our `.schem` of the orientation test is loaded by WorldEdit on the Paper server and pasted from the console (block updates off, so the world holds exactly the file); every block is checked by ID and full state with `execute if block`; WorldEdit then copies the area and saves its own `.schem`, which is decoded (prismarine-nbt) and compared block by block with ours                                                                                                                      | **Pass:** 230 of 230 blocks in the world; WorldEdit's file equals ours (Sponge v3, data version 5023)                                                                                                                                                                                                                                                                                                                                             |
| The M8 eval re-run in Java mode reaches the same 8 of 10                         | `scripts/eval/run.mjs --java`: the same ten prompts and harness, the agent told the design is for Java Edition; a design counts only if its `meta.edition` is `java`. `docs/eval/2026-10-09-java-cli/`                                                                                                                                                                                                                                                                                                                                           | **9 of 10** (target 8), clean within 1 to 3 rounds; every design is a Java design. The failure (NOR) wrote a valid design but never validated it: its first command bundled writing the file with `rsd validate`, which the harness's allow-list denied, and the agent gave up instead of retrying `rsd validate` alone. Beyond their tests, the Java toggle lamp toggles on every press and the memory cell holds set and reset in the simulator |

How the Java profile was proven, piece by piece:

- **Block data.** The registry's 28 `java` mappings are checked by a test against the block report from 26.3's own
  data generator (`pnpm fetch:java-data`: server jar by pinned SHA-1, report by pinned SHA-256, built twice with the
  same hash; data version 5023 read from the jar). Every ID exists, every state the game defines is set and nothing
  else, every value is in its domain. Like Bedrock's metadata, the report is never committed.
- **Orientation**, 63 probes in game, each with a negative control (the opposite orientation must fail the same
  probe): wall torches turn off when their support is powered (4); levers and buttons on walls, floors and ceilings
  power the block they hang on (12); repeaters and comparators exit on `facing` (8); stairs hold a wall torch on
  their tall back only (4); pistons and sticky pistons push to `facing` (12); observers pulse the opposite side (6, a copper bulb as the
  latch); droppers and dispensers act on `facing` (12); hoppers feed the chest on `facing` (5). Java's `facing` is
  the input side for repeaters and comparators and points away from the support for wall-mounted blocks; both are
  now proven. Door and trapdoor `facing` are not probed and stay VERIFY-IN-GAME (W108 on Java).
- **Support faces** (`faces.java`), measured like M5's: most blocks hold everything, as on Bedrock. Differences
  found: honey blocks hold nothing; a hopper's top holds dust, repeaters, comparators and plates but not floor
  torches, levers, buttons or doors (the registry gained `topCenter` for this); Java levers need a sturdy face like
  buttons (on Bedrock any standing block holds a lever). A test replays every measured row through the support
  rule and must agree with all of them (`test/java-measured.test.ts`; it caught a floor lever counted as held on a
  hopper, found by the review).
- **Conductivity** (`2026-10-09-java-conductivity.json`): a repeater powers the block and a lamp beyond it must
  light, with an unpowered control (a redstone block and a daylight sensor light the lamp alone, so they are not
  judged). Every block matches the registry except slime, which conducts on Java; the Java mapping now overrides it
  (`conductsPower`), and the validator, simulator and dust shapes ask by edition. A test pins the table.
- **Timings**, measured with the game frozen (`/tick freeze`) and stepped one game tick at a time, so with no
  console slack (five runs each, all equal): torch 2, repeater 2 per delay step, comparator 2, observer 2 with a
  2-tick pulse (Bedrock 3), piston 3 until its head stands, doors and trapdoors 0, lamps 0 to light and 4 to go dark
  (the simulator gained `lampOff`). These are `JAVA_MECHANICS`; a test checks them against the table, and unit
  tests pin quasi-connectivity (fires on Java, not on Bedrock), the lamp and the piston. The simulator applies a
  change at the end of a game tick, so a 0-tick delay shows as 1 there.
- **Quasi-connectivity** is in the simulator (a piston also counts power at the block above it, not from its own
  cell). VERIFY-IN-GAME: the game fires such a piston only on a block update, the simulator at once; no pattern
  relies on it (W105 finds none).

Deviations and findings:

- **Two Java servers.** WorldEdit on Fabric offers the console no world (`//world` accepted no name, and commands
  run through a Carpet fake player had no effect), so `.schem` loading runs on Paper, where `//world world` works
  from the console. Paper is used only to load and save files, with WorldEdit's neighbour and block updates off.
  Carpet was tried and removed.
- **Java's `/setblock` differs from Bedrock's, measured:** it updates neighbours, so dust works its shape out as it
  is placed; but a powered lever or button set by `/setblock` does not update the neighbours of the block it hangs
  on (as on Bedrock), and a lamp set by `/setblock` checks its power only when a neighbour changes. Dust checks its
  support as it is placed (in mid-air it pops at once) while torches, buttons, levers and diodes are checked only
  on an update from their support's side, and a diode with nothing under it is removed on its first neighbour
  update. Each probe and measurement is built around these, and the first versions that were not (a support
  measurement where a wall torch "held" on a bottom slab, probes that failed both ways) were discarded.
- **Java exporters write dust connections**, which Java stores in the block and structure tools place as stored.
  `dustShape` follows the game's wire logic as understood and is checked in game against the game's own shape for
  every wire with air above it (105 of 106). The one wire with a block above it (in the T flip-flop) is not checked, so the
  branch for a conducting block above a wire is not proven in game. Stair corner shapes are not computed (`straight`); designs with
  touching stairs may show a different corner until the game updates them.
- **Litematica** is a client mod, so its exporter is proven by decoding with an independent reader (prismarine-nbt),
  not in a world. **Waiting on Tim (optional):** open one `.litematic` in Litematica.
- **Patterns are built with `/setblock`, not from their `.schem`** as the scope first said: WorldEdit on Fabric
  cannot load from the console, and Paper is not trusted for redstone behaviour. The `.schem` is proven by the
  round trip instead.
- **Goldens:** the Java exporters have golden files for two patterns, holding the NBT inside the gzip (the gzip
  header names the OS, so the compressed bytes differ between macOS and Linux while the content is identical).
- **Review fixes:** the viewer's power view simulated Java designs with Bedrock mechanics (now by edition, e2e:
  the observer clock runs at 6 game ticks as Bedrock, 4 as Java); `rsd pack` and the MCP `pack` tool turned a Java
  design into a Bedrock `.mcpack` (now refused, as is `buildMcpack`); slime's Java conductivity (also where dust links a step up, found in round two, with a unit test) and the hopper
  lever above; AUTHORING.md's Java section gained the measured delays and support differences (2,955 words).
- **E015 is retired**: kept in the catalogue (codes are stable), reported by nothing, with no fixture.
- The `javaVersion`, data version, jar and report pins live with the Bedrock pins in `packages/core/src/pins.ts`;
  CI builds the report too (`RSD_REQUIRE_JAVA_DATA`).
- **Eval method:** as M8 (one run per prompt, one model, Claude Code 2.1.295), with `rsd mcp` refused in CLI mode
  from the start. AUTHORING.md gained a short Java section (2,884 words) before the run; the review's additions came after it.
