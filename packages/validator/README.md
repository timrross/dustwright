# @dustwright/validator

Runs a design through the stages of its edition profile and returns diagnostics an LLM can act on.

## Public API

- `validate(design, { strict })`, `validateText(text, { strict })`: `{ ok, diagnostics, model? }`. Stage 1 is the
  parser plus rules W107, W108 and (Java) E015; stages 2 and 3 arrive in M5 and M6.
- `RULES`: every rule, in one array. `BEDROCK_PROFILE`, `JAVA_PROFILE`, `PROFILES`, `profileFor(edition)`.
- `renderDiagnosticsDoc()`: the text of `docs/diagnostics.md`.

## Test

```sh
pnpm test packages/validator
```
