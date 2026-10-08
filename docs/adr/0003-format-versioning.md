# 0003: Format versioning

Date: 2026-10-08. Status: accepted.

## Decision

- The format id is `rsd/1`; files use the `.rsd.json` extension. Both describe a redstone design, not the brand,
  so they survived the rename to Dustwright.
- The JSON Schema is `packages/core/schema/rsd-1.json`; its `$id` names the version.
- Unknown top-level keys are errors (E001). The exception is `ext`, a reserved object carried through untouched
  for tools outside this repo.
- Additive, optional keys stay within `rsd/1`. Any breaking change bumps to `rsd/2` and adds
  `migrations/rsd-1-to-2.ts`; the parser accepts the current version and migrates older ones.
- An unsupported `format` is E010, and the hint lists the accepted versions.
- The schema is precompiled to a standalone validator (`pnpm gen`), so the parser never compiles code at runtime
  and runs under a CSP without `unsafe-eval`. CI fails if the generated file drifts from the schema.

## Why

LLMs write files from documentation; a strict schema turns a typo into a diagnostic instead of silently ignored
data.
