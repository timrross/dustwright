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

| Command                                                       | Does                                 | Available |
| ------------------------------------------------------------- | ------------------------------------ | --------- |
| `rsd validate <file> [--json] [--strict]`                     | Check a design                       | M1        |
| `rsd export <file> --to mcfunction\|mcstructure --pack <dir>` | Write a design into a behavior pack  | M3, M4    |
| `rsd bundle <file> -o <html>`                                 | Single-file viewer                   | M2        |
| `rsd sheets <file> -o <dir>`                                  | Layer sheet SVGs                     | M7        |
| `rsd pack <file> -o <mcpack>`                                 | One-design behavior pack             | M7        |
| `rsd registry dump`                                           | Regenerate `docs/bedrock-mapping.md` | M1        |
| `rsd mcp`                                                     | MCP server over stdio                | M8        |

Exit codes: 0 ok, 1 validation errors, 2 usage or I/O error.

## Development

```sh
pnpm lint        # ESLint + Prettier
pnpm typecheck   # tsc, strict
pnpm test        # Vitest
pnpm build       # every package and the site
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).
