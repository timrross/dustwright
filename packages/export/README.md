# @dustwright/export

Exporters: .mcfunction, .mcstructure, .mcpack and layer sheets.

## Public API

- `mcfunctionExporter` (M3): `export(model, { clear, origin, commandLimit })` returns
  `functions/rsd/<slug>.mcfunction` (and `<slug>_clear`). Lines are `setblock` with explicit Bedrock states,
  in the fixed placement order (ADR 0006); E014 above the command limit; deterministic bytes.
- `mcstructureExporter` (M4): `structures/rsd/<slug>.mcstructure`, little-endian NBT written with nbtify
  (no runtime code generation, so it also runs in the browser): cells z fastest, then y, then x; air as -1
  (structure void, so loading never removes blocks); one palette entry per distinct block, stamped with the
  measured block-state version; E007 above the structure limit. Also `structureLayout`, `encodeStructure`,
  `cellIndex`, `blockVersion`.
- `buildLines`, `clearLines`, `placementOrder`, `formatStates`, `LINE_ALLOWLIST`, `EXPORTER_ASSUMPTIONS`.
- `buildBundleHtml(viewerScript, designText)`: the single-file viewer page (M2).
- `EXPORTERS`: every exporter; edition profiles take theirs from here.

Golden files: `test/golden/` (regenerate with `UPDATE_GOLDEN=1 pnpm test packages/export` and review the diff).

## Test

```sh
pnpm test packages/export
```
