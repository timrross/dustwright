# Progress

Tracks the build of the architecture spec, milestone by milestone. Each milestone is reviewed by an independent
review agent before it is committed. Items that need the maintainer in person (in-game checks, screenshots,
sign-off) are listed under "Waiting on Tim" and logged in `VERIFY.md`.

| Milestone | Scope                                                      | Status                                                                                                                                            | Commit  |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| M0        | Scaffold: monorepo, CI, lint, empty packages, `rsd --help` | Done: review approved; CI on GitHub pending                                                                                                       | 06038ba |
| M1        | Format, parser, registry, five examples, validator stage 1 | Done: review approved; mapping review and in-game checks pending Tim                                                                              | 38fcf19 |
| M2        | Viewer MVP, playground, first single-file build            | Done: review approved; optional fps check by eye pending Tim                                                                                      | 9935384 |
| M3        | `.mcfunction` export, behavior pack, in-game proof         | Done: review approved; automated in-game check passes; Tim's visual sign-off pending                                                              | 8824fa0 |
| M4        | `.mcstructure` export                                      | Done: review approved; automated in-game proof incl. rotation and round trip; Tim's visual check pending                                          | 13365cb |
| M5        | Validator stages 1 and 2                                   | Done: review approved; in-game suite re-run (116 passed, 0 failed, 6 skipped)                                                                     | ceeab66 |
| M6        | Simulator                                                  | Done: review approved; game cross-check matches; in-game suite 116 passed, 0 failed, 6 skipped                                                    | 474aef6 |
| M7        | Public site, embedding, bundle, layer sheets               | Done: review approved; .mcpack built on the test server; artifact published; phone and print checks pending Tim                                   | 461e821 |
| M8        | LLM authoring: AUTHORING.md, patterns, eval, MCP           | Done: review approved; CLI eval 10/10 (9/10 by the brief: the toggle lamp fails its sequence), MCP 10/10; patterns and 3 eval builds pass in game | d9497a5 |
| M9        | Java edition profile                                       | Done: review approved; patterns 13/13 and 63 probes in a Java world, .schem round trip 230/230, Java eval 9/10                                    | 11c12ed |
| M10       | Optional extensions                                        | Done: review approved; include (in game 9/9) and Script API loader (all patterns 60/0/6 in game); storage/gallery not built                       | 30f951c |

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
- M8: nothing in person is required; optionally build one of the eval designs (`docs/eval/2026-10-09-cli/`) in a
  world with a real button and confirm it, since the automated check emulates button presses with `/setblock`.
- M9 (optional): open one `.litematic` export in Litematica, and look at a door and a trapdoor in the Java test
  world (`deploy/test-world-java`, localhost:25566) to confirm their `facing` (the only Java orientations not
  probed).
- M10: optional: import the loader `.mcpack` on a client and run `/scriptevent rsd:build <slug> <x> <y> <z>` from
  chat. Spec amendments: `include` (schema: the pattern slugs, `legend` may be empty with `include`), `rsd loader`
  in the CLI contract, `PINS.scriptApiServer`.
- Spec amendments to approve (implemented and documented in VERIFY.md): nbtify instead of prismarine-nbt as the
  NBT runtime dependency (CSP-safe in the browser); `Exporter.export` may return a Promise; `afterTicks` above 1,000
  is T002 rather than E013; all steps together add at most 50,000 positions; orientation meanings for stairs, door
  and trapdoor; E009 is detected while parsing; Windows device names (`con`, `nul`, ...) are not valid slugs (E012).
- M9 spec amendments to approve: a CLI contract row for `rsd export --to schem|litematic -o <dir>`; the spec's
  edition-profile section still describes the E015 stub (E015 is now retired, kept in the catalogue); M9 touched more
  than "the profile, the registry's java field and the patterns' entries": the registry gained `faces.topCenter`,
  a Java `conductsPower` override and Java `verified`, `SimMechanics` gained `lampOff`, and the Java pins sit with
  the Bedrock ones. Edition checks outside the profile (W107's pin, W108's verification, the Bedrock-only lever
  rule in `isSupported`, conductivity by edition) are small lookups; they could move into the profile later.
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
