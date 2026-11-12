# Security

Dustwright treats every design file as untrusted input, whoever wrote it: an LLM, a chat paste, a download or a
share link opened by a stranger. The registry, the patterns and the code in this repository are trusted through
review. The assets to protect are the Bedrock server and the worlds on it, and the people who open designs on the
public site.

## Trust model

Each control is a hard rule with a test behind it. The milestone column says when its test lands.

| Surface                | Threat                                                                      | Control                                                                                                                                                                                                                                                 | Checked in                                               |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Parser                 | Oversized or malformed input hangs or crashes a consumer                    | Hard limits and E013; the parser never throws; fuzz corpus in `packages/core/fuzz/`                                                                                                                                                                     | M1                                                       |
| Exporter paths         | A crafted `meta.name` writes outside the pack (`../../`)                    | Slug grammar; pack root check after symlink resolution; writes only under `functions/rsd/` and `structures/rsd/`                                                                                                                                        | M3                                                       |
| Function files         | A design string becomes a command (newline injection)                       | Only `setblock` and `fill`, built from registry data; no design text in files; allowlist golden test                                                                                                                                                    | M3                                                       |
| Loader pack (M10)      | A design string becomes script code in the add-on                           | The script is fixed source; designs travel as one JSON literal of slugs, registry IDs, states and integers (no names or text), checked by a test that the module holds nothing else; stable `@minecraft/server` only, no network module                 | M10                                                      |
| `--clear`              | Running a build deletes blocks                                              | Clear is a separate function, bounding box only, chunked fills                                                                                                                                                                                          | M3                                                       |
| Behavior pack          | The pack runs code on the server                                            | `rsd pack` and the exported packs are data only (the loader pack is the one script, row above): no script module, and no network module without an explicit opt-in from the maintainer                                                                  | M3                                                       |
| Viewer text            | Design text runs as script in the inspector or a layer sheet                | All design text goes through `textContent` or SVG text nodes; no `innerHTML`; no `eval` or `new Function` anywhere (enforced by ESLint)                                                                                                                 | M2, M7                                                   |
| Bundle                 | A design closes the inline script tag                                       | JSON inlined with `<`, `>`, `&`, U+2028 and U+2029 escaped; one inline script, zero remote URLs                                                                                                                                                         | M7                                                       |
| Embedding              | A hostile parent page drives the viewer, or `src` points anywhere           | Inbound messages only from `allowed-origins` and only documented shapes; `src` same-origin or `https:`, 2 MB cap, validated before render; CSP on `viewer.html`                                                                                         | M7                                                       |
| Public site            | Share links and `src=` URLs from strangers; phishing canvas                 | Design text is never a link or HTML; `src` only `https:` and 2 MB; fragment capped at 64 KB; pages frame only the site itself; CSP, nosniff, no-referrer and Permissions-Policy headers                                                                 | M7 locally; headers on a live host with the deploy stack |
| Deploy pipeline        | A compromised CI token or host account ships a tampered site                | Deploys only from CI on a protected `main`; least-privilege token; reproducible build with deployed-hash comparison                                                                                                                                     | Deploy stack                                             |
| Supply chain           | A dependency or its install script compromises the toolchain                | Exact versions; committed lockfile; `--frozen-lockfile`; dependency lifecycle scripts blocked; `pnpm audit --audit-level=high` in CI; Renovate weekly                                                                                                   | M0                                                       |
| Runtime network        | Telemetry or fetches leak data                                              | None. The CLI never opens a socket (`rsd mcp` speaks MCP over stdio only); the viewer fetches only `src`                                                                                                                                                | M2, M8                                                   |
| MCP server (`rsd mcp`) | A model, steered by a design's text, writes over a file or hangs the server | Runs locally with the user's rights; `export` uses the pack writer above; `bundle` writes only `.html` and `pack` only `.mcpack` paths; every design passes the 2 MB guard, all test cases share one simulation budget, and lines over 4 MB are refused | M8                                                       |
| Secrets and worlds     | Server paths or credentials in the repo; an export hits a live world        | No secrets in the repo; the pack root is explicit on every run; only the test world container mounts the pack                                                                                                                                           | M3                                                       |

Runtime dependencies are limited to three.js, nbtify (NBT for `.mcstructure`, with its one dependency mutf-8), the zip
writer fflate (M7: `.mcpack` and layer-sheet zips; no dependencies) and the CLI argument parser (Node's built-in
`util.parseArgs`). The site renders its docs pages with marked at build time only; it ships no Markdown code. The spec names prismarine-nbt for NBT;
it compiles code with `eval` at import, which the site's CSP forbids, so nbtify replaces it at runtime (a pending
spec amendment, see VERIFY.md M4) and prismarine-nbt is a dev dependency used only to decode files independently in
tests. ajv is a dev dependency too: the schema validator is precompiled.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting ("Report a vulnerability" on the repository's Security tab). Please do
not open a public issue for a security problem. Expect an acknowledgement within 7 days.

## Supported versions

Only the latest release on npm and the current build of the public site receive fixes. Before 1.0, there is no
backporting.
