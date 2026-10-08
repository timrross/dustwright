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

## Browser tests

`pnpm build && pnpm e2e` runs the Playwright suite in `e2e/` against the built site (served by `vite preview`)
and against single-file bundles made with `rsd bundle`. Install the browser once with
`pnpm exec playwright install chromium`. WebGL runs on SwiftShader, so screenshots differ per platform: baselines
live in `e2e/__screenshots__/` with a `-darwin` or `-linux` suffix and are compared with a 2% pixel tolerance.
After an intended visual change, regenerate them with `pnpm e2e --update-snapshots` on macOS, and for Linux (CI)
inside the Playwright image:

```sh
docker run --rm --platform linux/amd64 --ipc=host -v "$PWD":/work mcr.microsoft.com/playwright:v1.63.0-noble \
  bash -c "cd /work && corepack enable && pnpm install --frozen-lockfile && pnpm build && pnpm e2e --update-snapshots"
```

(Run that from a clean copy of the repo: it reinstalls `node_modules` for Linux.)

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
4. Run `pnpm gen` (the parser reads the generated registry module) and `pnpm docs:gen`, and commit the
   regenerated `packages/core/src/generated/registry.ts`, `docs/bedrock-mapping.md` and
   `docs/verify-in-game.md`. Mark every state meaning you could not read from the pinned data with a
   `"verify": "VERIFY-IN-GAME: ..."` note.
5. Give it `faces.bedrock` (which faces hold a floor, wall or ceiling component) from a measurement, not memory:
   add the block to `deploy/test-world/measure-supports.mjs`, run it against the test world, and save the table
   under `docs/ingame/`. `packages/core/test/supports.test.ts` checks the registry against that table.

A test asserts all three parts exist for every registry type, so a half-added block fails CI.

## Add a validator rule

Write a pure `Rule` in `packages/validator/src/rules/`, register it in the rule array, add the code to
`DIAGNOSTIC_CODES` and to the enum in `packages/core/schema/diagnostics.json`, add
`packages/validator/fixtures/<code>/pass.rsd.json` and `fail.rsd.json`, and regenerate `docs/diagnostics.md`.
Codes are unique, every code has both fixtures, and the schema's enum matches the catalogue (all tested). Rules in
stages 1 and 2 must import only core: the viewer bundles them through `@dustwright/validator/static`.

## Add a pattern

Add `patterns/<name>.rsd.json` with `ports` and `tests`. It must validate with zero errors, pass its tests in the
simulator, and be verified in-game before it is listed as known-good.

## Sign-off gates

Each milestone ends with: CI green, the milestone's verification list done, its security rows tested, generated
docs without drift, a dated `VERIFY.md` entry, and the maintainer's sign-off on in-game items (with screenshots in
`VERIFY.md`). Milestone N+1 does not start before N is signed off.
