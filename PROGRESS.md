# Progress

Tracks the build of the architecture spec, milestone by milestone. Each milestone is reviewed by an independent
review agent before it is committed. Items that need the maintainer in person (in-game checks, screenshots,
sign-off) are listed under "Waiting on Tim" and logged in `VERIFY.md`.

| Milestone | Scope                                                      | Status                                      | Commit    |
| --------- | ---------------------------------------------------------- | ------------------------------------------- | --------- |
| M0        | Scaffold: monorepo, CI, lint, empty packages, `rsd --help` | Done: review approved; CI on GitHub pending | M0 commit |
| M1        | Format, parser, registry, five examples, validator stage 1 | In progress                                 |           |
| M2        | Viewer MVP, playground, first single-file build            | Not started                                 |           |
| M3        | `.mcfunction` export, behavior pack, in-game proof         | Not started                                 |           |
| M4        | `.mcstructure` export                                      | Not started                                 |           |
| M5        | Validator stages 1 and 2                                   | Not started                                 |           |
| M6        | Simulator                                                  | Not started                                 |           |
| M7        | Public site, embedding, bundle, layer sheets               | Not started                                 |           |
| M8        | LLM authoring: AUTHORING.md, patterns, eval, MCP           | Not started                                 |           |
| M9        | Java edition profile                                       | Not started                                 |           |
| M10       | Optional extensions                                        | Not started                                 |           |

## Waiting on Tim

- M0: push to GitHub and confirm CI runs (and fails on a deliberately broken test).
