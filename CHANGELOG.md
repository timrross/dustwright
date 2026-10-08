# Changelog

All notable user-facing changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow semantic versioning.

## [Unreleased]

### Added

- M1: the `rsd/1` format (JSON Schema), a parser that never throws, hard limits with a fuzz corpus, the block
  registry for the 28 v1 types with Bedrock mappings checked against pinned Mojang data, `rsd validate` (stage 1)
  and `rsd registry dump`, five example designs, `AUTHORING.md`, and generated `docs/bedrock-mapping.md`,
  `docs/diagnostics.md` and `docs/verify-in-game.md`.

- M0: monorepo scaffold (`core`, `validator`, `sim`, `viewer`, `export`, `cli`, `mcp`, app `site`), CI, lint,
  licence allowlist and `rsd --help`.
