# Progress

Tracks the build of the architecture spec, milestone by milestone. Each milestone is reviewed by an independent
review agent before it is committed. Items that need the maintainer in person (in-game checks, screenshots,
sign-off) are listed under "Waiting on Tim" and logged in `VERIFY.md`.

| Milestone | Scope                                                      | Status                                                                               | Commit    |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| M0        | Scaffold: monorepo, CI, lint, empty packages, `rsd --help` | Done: review approved; CI on GitHub pending                                          | 06038ba   |
| M1        | Format, parser, registry, five examples, validator stage 1 | Done: review approved; mapping review and in-game checks pending Tim                 | 38fcf19   |
| M2        | Viewer MVP, playground, first single-file build            | Done: review approved; optional fps check by eye pending Tim                         | 9935384   |
| M3        | `.mcfunction` export, behavior pack, in-game proof         | Done: review approved; automated in-game check 76/0/1; Tim's visual sign-off pending | M3 commit |
| M4        | `.mcstructure` export                                      | In progress                                                                          |           |
| M5        | Validator stages 1 and 2                                   | Not started                                                                          |           |
| M6        | Simulator                                                  | Not started                                                                          |           |
| M7        | Public site, embedding, bundle, layer sheets               | Not started                                                                          |           |
| M8        | LLM authoring: AUTHORING.md, patterns, eval, MCP           | Not started                                                                          |           |
| M9        | Java edition profile                                       | Not started                                                                          |           |
| M10       | Optional extensions                                        | Not started                                                                          |           |

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
- Spec amendments to approve (they are implemented and documented in VERIFY.md): `afterTicks` above 1,000 is
  T002 rather than E013; all steps together add at most 50,000 positions; orientation meanings for stairs, door
  and trapdoor; E009 is detected while parsing; Windows device names (`con`, `nul`, ...) are not valid slugs
  (E012).
- M1: confirm the server's Bedrock version. The registry is pinned to 1.26.50.

## Notes for later milestones (from reviews)

- M5: diagnostic markers on blocks can reuse the viewer's label overlay (`labelNodes`).
- M6: the power view needs a hook that overrides block states per tick and rebuilds the affected blocks' parts
  (the geometry builders are pure, so this is cheap).
- M4: new structure files, like new function files, need a server restart before `/structure load` finds them.
- M7: build every pack manifest (the shared test pack and the per-design UUIDv5 `.mcpack`) from one builder in
  `export`, rather than the hand-written `packs/redstone-designs-bp/manifest.json`.
- M7: inbound `postMessage` commands must check `allowed-origins` and the message shape; each embedded viewer
  opens its own WebGL context, which limits how many embeds one page can hold.
