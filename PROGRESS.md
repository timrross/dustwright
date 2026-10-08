# Progress

Tracks the build of the architecture spec, milestone by milestone. Each milestone is reviewed by an independent
review agent before it is committed. Items that need the maintainer in person (in-game checks, screenshots,
sign-off) are listed under "Waiting on Tim" and logged in `VERIFY.md`.

| Milestone | Scope                                                      | Status                                                                                                          | Commit    |
| --------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| M0        | Scaffold: monorepo, CI, lint, empty packages, `rsd --help` | Done: review approved; CI on GitHub pending                                                                     | 06038ba   |
| M1        | Format, parser, registry, five examples, validator stage 1 | Done: review approved; mapping review and in-game checks pending Tim                                            | 38fcf19   |
| M2        | Viewer MVP, playground, first single-file build            | Done: review approved; optional fps check by eye pending Tim                                                    | 9935384   |
| M3        | `.mcfunction` export, behavior pack, in-game proof         | Done: review approved; automated in-game check passes; Tim's visual sign-off pending                            | 8824fa0   |
| M4        | `.mcstructure` export                                      | Done: review approved; automated in-game proof incl. rotation and round trip; Tim's visual check pending        | 13365cb   |
| M5        | Validator stages 1 and 2                                   | Done: review approved; in-game suite re-run (116 passed, 0 failed, 6 skipped)                                   | ceeab66   |
| M6        | Simulator                                                  | Done: review approved; game cross-check matches; in-game suite 116 passed, 0 failed, 6 skipped                  | 474aef6   |
| M7        | Public site, embedding, bundle, layer sheets               | Done: review approved; .mcpack built on the test server; artifact published; phone and print checks pending Tim | M7 commit |
| M8        | LLM authoring: AUTHORING.md, patterns, eval, MCP           | Not started                                                                                                     |           |
| M9        | Java edition profile                                       | Not started                                                                                                     |           |
| M10       | Optional extensions                                        | Not started                                                                                                     |           |

## Waiting on Tim

- M0: push to GitHub and confirm CI runs (and fails on a deliberately broken test), which also proves the pinned
  action SHAs.
- M1: review `docs/bedrock-mapping.md` and the 21 assumptions in `docs/verify-in-game.md` (torch, piston,
  repeater, comparator and door were corrected from GeyserMC's mappings; all still need the M3 build).
- M2 (optional): open `/bench/?blocks=10000` (`pnpm --filter @dustwright/site dev`) and confirm 60 fps by eye; the
  automated run on this Mac measured 60 fps at 10,000 and 50,000 blocks.
- M3: run the in-game checklist `docs/verify-m3.md` in the test world (orientation test side by side with the
  viewer, the five examples, clear and rebuild), add screenshots to VERIFY.md and sign off. The automated in-game
  check already passed 76 checks (1 skipped, 0 failed) on a local BDS 1.26.52.3. The registry `verified` records it
  added name the automated check as `by`; confirm you are happy with that, or they can wait for your sign-off.
- M3: bring up `deploy/test-world` on the server host (or reuse the local run) and confirm the server version.
- M4: optional structure-block round trip from a client, and a visual check of `/structure load` (rotated too):
  `docs/verify-m4.md`. The automated run already proved placement, rotation and a saved-structure round trip.
- M7: import a `.mcpack` from the playground by double-click on a phone and a PC, enable it, run `/function rsd/<slug>`
  (the test server already loaded one and built from it); print a piston door layer sheet on A4; open the published
  bundle artifact (https://claude.ai/artifact/RHDzgcrTHX79vL8BnbVjNF) on a desktop and a phone and orbit it.
- Spec amendments to approve (implemented and documented in VERIFY.md): nbtify instead of prismarine-nbt as the
  NBT runtime dependency (CSP-safe in the browser); `Exporter.export` may return a Promise; `afterTicks` above 1,000
  is T002 rather than E013; all steps together add at most 50,000 positions; orientation meanings for stairs, door
  and trapdoor; E009 is detected while parsing; Windows device names (`con`, `nul`, ...) are not valid slugs (E012).
- M1: confirm the server's Bedrock version. The registry is pinned to 1.26.50.

## Notes for later milestones (from reviews)

- Later (simulator gaps from the M6 review): a door's upper half as a cell for pistons; comparators reading a
  container through a block; whether dispensers count as containers. The stage 2 rules could read `sim.class`
  instead of type names, as the simulator does.
- Later: measure support faces of stairs in every facing (only the default was measured; other faces are treated
  as not holding), and measure the one-redstone-tick delays the simulator assumes (torch, repeater step, comparator,
  piston, lamps) one by one with `measure-timing.mjs`.
- Before publishing to npm: `@dustwright/viewer` depends on the whole validator package, so installing it
  pulls in sim, export and nbtify even though the bundle stays clean; move the static rules into core or a small
  package.
- M4: new structure files, like new function files, need a server restart before `/structure load` finds them.
- M5+: VIG IDs are numbered by position with registry rows first; a new registry state would renumber the exporter
  rows (the ID test catches it). Move to IDs stored with the data before adding mapped states.
