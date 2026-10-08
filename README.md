# Dustwright

Dustwright lets a human or an LLM agent describe a Minecraft redstone build in a compact text format
(`.rsd.json`, format `rsd/1`), check it, view it as an orbitable 3D model in the browser, and load it into a
Bedrock world with one command. It ships as an npm CLI (`dustwright`, alias `rsd`), an MCP server and a static
website. MIT licensed.

> Status: under construction. See [PROGRESS.md](PROGRESS.md) for where each milestone stands.

## Install

Requires Node 22.13 or newer (22 LTS or 24+) and pnpm 10 (via corepack).

```sh
corepack enable
pnpm install
pnpm build
pnpm rsd --help
```

## Commands

| Command                                                       | Does                                 | Available                         |
| ------------------------------------------------------------- | ------------------------------------ | --------------------------------- |
| `rsd validate <file> [--json] [--strict]`                     | Check a design                       | M1                                |
| `rsd export <file> --to mcfunction\|mcstructure --pack <dir>` | Write a design into a behavior pack  | M3 (mcfunction), M4 (mcstructure) |
| `rsd bundle <file> -o <html>`                                 | Single-file viewer                   | M2                                |
| `rsd sheets <file> -o <dir>`                                  | Layer sheet SVGs                     | M7                                |
| `rsd pack <file> -o <mcpack>`                                 | One-design behavior pack             | M7                                |
| `rsd registry dump`                                           | Regenerate `docs/bedrock-mapping.md` | M1                                |
| `rsd mcp`                                                     | MCP server over stdio                | M8                                |

Exit codes: 0 ok, 1 validation errors, 2 usage or I/O error.

## 60-second example

```sh
pnpm build
pnpm rsd validate examples/not-gate.rsd.json          # human-readable diagnostics
pnpm rsd validate examples/not-gate.rsd.json --json   # {"ok": true, "diagnostics": [...]}
pnpm rsd registry dump | head                         # the Bedrock mapping table
pnpm rsd bundle examples/not-gate.rsd.json -o not-gate.html   # one self-contained HTML viewer
pnpm rsd export examples/not-gate.rsd.json --to mcfunction --pack packs/redstone-designs-bp --clear
#   then in game: /function rsd/not-gate (see deploy/test-world/README.md)
pnpm rsd export examples/not-gate.rsd.json --to mcstructure --pack packs/redstone-designs-bp
#   then in game: /structure load rsd:not-gate ~1 ~ ~
pnpm rsd pack examples/not-gate.rsd.json -o not-gate.mcpack        # one-design behavior pack, import with a double-click
pnpm rsd sheets examples/not-gate.rsd.json -o sheets               # printable A4 layer SVGs
pnpm --filter @dustwright/site dev                    # the site at http://localhost:5173/ (playground at /play/)
```

A design is layers of character rows plus a legend; see [AUTHORING.md](AUTHORING.md) and `examples/`.

## Development

```sh
pnpm lint        # ESLint + Prettier
pnpm typecheck   # tsc, strict
pnpm test        # Vitest
pnpm build       # every package and the site
pnpm gen         # regenerate packages/core/src/generated from the registry and schema
pnpm docs:gen    # regenerate docs/bedrock-mapping.md, docs/diagnostics.md, docs/verify-in-game.md
pnpm fetch:bedrock-data  # cache the pinned Mojang block metadata used by the mapping tests
pnpm e2e         # Playwright viewer tests against the built site (run pnpm build first)
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).
