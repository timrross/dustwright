# dustwright (CLI)

The `dustwright` binary, alias `rsd`. Command logic lives in the packages; the CLI only parses arguments, reads
the file named and writes only where told.

## Commands so far

- `rsd validate <file> [--json] [--strict]`: exit 0 ok (warnings allowed unless `--strict`), 1 errors, 2 usage or
  I/O. With `--json`, stdout is exactly one JSON document `{ "ok", "diagnostics" }`.
- `rsd registry dump [-o <file>]`: prints the Bedrock mapping table (the text of `docs/bedrock-mapping.md`).

## Public API

`run(argv, io)`: runs the CLI without spawning a process (used by tests).

## Test

```sh
pnpm test packages/cli
```
