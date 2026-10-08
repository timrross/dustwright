# @dustwright/core

The `rsd/1` design format: JSON Schema, parser, normaliser, block registry, Bedrock mapping, and the edition
profile interfaces. Everything downstream consumes the one `Model` that `parse` produces.

## Public API

- `parse(json)`, `parseText(text)`: never throw; return `{ model?, diagnostics }` (stage 1: E001 to E013, W106).
- `REGISTRY`, `registryEntry(type)`, `closestTypes(name)`, `toEditionBlocks(block, edition)`: registry access and
  the abstract-to-Bedrock mapping (a door yields two blocks).
- `parseSpec`, `splitSpec`, `formatSpec`, `typedValue`: the block spec grammar.
- `deriveSlug`, `isValidSlug`: slug rules (ADR 0002).
- `DIAGNOSTIC_CODES`, `diag`, `hasErrors`: the diagnostic catalogue.
- `LIMITS`, `PINS`, `RSD_1_SCHEMA`, `renderMappingDoc`, `renderVerifyLog`.
- Types: `Model`, `Block`, `Diagnostic`, `RegistryEntry`, `EditionProfile`, `Rule`, `Exporter`, `SimMechanics`, ...

Data: `schema/rsd-1.json`, `schema/registry.json`, `registry/<type>.json`. Generated: `src/generated/` (`pnpm gen`).
Hostile-input corpus: `fuzz/`.

## Test

```sh
pnpm test packages/core
```
