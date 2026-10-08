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
