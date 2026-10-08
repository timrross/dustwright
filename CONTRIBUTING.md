# Contributing

## Run and test

```sh
corepack enable          # pnpm 10, pinned by packageManager in package.json
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm check:licenses      # every dependency must be MIT-compatible
```

Use Node 22 LTS or newer (`.nvmrc`). Dependency lifecycle scripts are blocked; a new dependency that wants an
install script fails `pnpm install` until it is reviewed in `pnpm-workspace.yaml`. Dependencies are pinned to
exact versions.

## Ground rules

- The architecture spec is the source of truth. Format, orientation semantics and diagnostic codes change only
  together with the spec, the schema, `AUTHORING.md` and the examples.
- No Mojang assets: no textures, models, sounds or extracted game files.
- No remembered Bedrock facts in code: every Bedrock ID, state name and value comes from the pinned
  `@minecraft/vanilla-data` version or is marked `// VERIFY-IN-GAME`.
- Outputs are deterministic so golden-file tests work.
- Anything out of scope goes in `docs/ideas.md`, not the code.
- `eval`, `new Function` and HTML sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`)
  are banned by ESLint.

## Add a block

1. Add `packages/core/registry/<type>.json` (validated against `packages/core/schema/registry.json`).
2. Add a geometry builder in `packages/viewer`.
3. Add or reuse a sim behaviour class in `packages/sim`.
4. Run `pnpm rsd registry dump` and commit the regenerated `docs/bedrock-mapping.md`.

A test asserts all three parts exist for every registry type, so a half-added block fails CI.

## Add a validator rule

Write a pure `Rule` in `packages/validator/src/rules/`, register it in the rule array, add a passing and a failing
fixture in `packages/validator/fixtures/`, and regenerate `docs/diagnostics.md`. Codes are unique (tested).

## Add a pattern

Add `patterns/<name>.rsd.json` with `ports` and `tests`. It must validate with zero errors, pass its tests in the
simulator, and be verified in-game before it is listed as known-good.

## Sign-off gates

Each milestone ends with: CI green, the milestone's verification list done, its security rows tested, generated
docs without drift, a dated `VERIFY.md` entry, and the maintainer's sign-off on in-game items (with screenshots in
`VERIFY.md`). Milestone N+1 does not start before N is signed off.
