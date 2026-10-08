# dustwright (CLI)

The `dustwright` binary, alias `rsd`. Command logic lives in the packages; the CLI only parses arguments, reads
the file named and writes only where told.

## Commands so far

- `rsd validate <file> [--json] [--strict]`: exit 0 ok (warnings allowed unless `--strict`), 1 errors, 2 usage or
  I/O. With `--json`, stdout is exactly one JSON document `{ "ok", "diagnostics" }`.
- `rsd registry dump [-o <file>]`: prints the Bedrock mapping table (the text of `docs/bedrock-mapping.md`).
- `rsd bundle <file> -o <html>`: one self-contained offline HTML viewer.
- `rsd export <file> --to mcfunction|mcstructure --pack <dir> [--clear] [--origin x y z] [--command-limit n] [--json]`: writes
  `functions/rsd/<slug>.mcfunction` (and `<slug>_clear`) into the pack and prints every path written. The pack root
  comes from `--pack` or `RSD_PACK_DIR`; there is no default. `rsd export --list` lists exporters.

Path safety lives here (`src/pack-write.ts`): only `functions/rsd/` and `structures/rsd/` with a slug file name,
the pack root resolved first, every directory below it checked so no symlink is followed, and files opened with
`O_NOFOLLOW`.

## Public API

`run(argv, io)`: runs the CLI without spawning a process (used by tests).

## Test

```sh
pnpm test packages/cli
```
