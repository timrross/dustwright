# Security

Dustwright treats every design file as untrusted input, whoever wrote it: an LLM, a chat paste, a download or a
share link opened by a stranger. The registry, the patterns and the code in this repository are trusted through
review. The assets to protect are the Bedrock server and the worlds on it, and the people who open designs on the
public site.

## Trust model

Each control is a hard rule with a test behind it. The milestone column says when its test lands.

| Surface            | Threat                                                                 | Control                                                                                                                                                         | Checked in   |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Parser             | Oversized or malformed input hangs or crashes a consumer               | Hard limits and E013; the parser never throws; fuzz corpus in `packages/core/fuzz/`                                                                             | M1           |
| Exporter paths     | A crafted `meta.name` writes outside the pack (`../../`)               | Slug grammar; pack root check after symlink resolution; writes only under `functions/rsd/` and `structures/rsd/`                                                | M3           |
| Function files     | A design string becomes a command (newline injection)                  | Only `setblock` and `fill`, built from registry data; no design text in files; allowlist golden test                                                            | M3           |
| `--clear`          | Running a build deletes blocks                                         | Clear is a separate function, bounding box only, chunked fills                                                                                                  | M3           |
| Behavior pack      | The pack runs code on the server                                       | Data only: no script module, and no network module without an explicit opt-in from the maintainer                                                               | M3           |
| Viewer text        | Design text runs as script in the inspector or a layer sheet           | All design text goes through `textContent` or SVG text nodes; no `innerHTML`; no `eval` or `new Function` anywhere (enforced by ESLint)                         | M2, M7       |
| Bundle             | A design closes the inline script tag                                  | JSON inlined with `<`, `>`, `&`, U+2028 and U+2029 escaped; one inline script, zero remote URLs                                                                 | M7           |
| Embedding          | A hostile parent page drives the viewer, or `src` points anywhere      | Inbound messages only from `allowed-origins` and only documented shapes; `src` same-origin or `https:`, 2 MB cap, validated before render; CSP on `viewer.html` | M7           |
| Public site        | Share links and `src=` URLs from strangers; phishing canvas            | Design text is never a link or HTML; `src` only `https:` and 2 MB; fragment capped at 64 KB; CSP, nosniff, no-referrer and Permissions-Policy headers           | M7           |
| Deploy pipeline    | A compromised CI token or host account ships a tampered site           | Deploys only from CI on a protected `main`; least-privilege token; reproducible build with deployed-hash comparison                                             | Deploy stack |
| Supply chain       | A dependency or its install script compromises the toolchain           | Exact versions; committed lockfile; `--frozen-lockfile`; dependency lifecycle scripts blocked; `pnpm audit --audit-level=high` in CI; Renovate weekly           | M0           |
| Runtime network    | Telemetry or fetches leak data                                         | None. The CLI never opens a socket; the viewer fetches only `src`                                                                                               | M2           |
| Secrets and worlds | Server paths or credentials in the repo; an export hits a live world | No secrets in the repo; the pack root is explicit on every run; only the test world container mounts the pack                                                   | M3           |

Runtime dependencies are limited to three.js, prismarine-nbt, ajv, a zip writer and the CLI argument parser
(the CLI uses Node's built-in `util.parseArgs`).

## Reporting a vulnerability

The repository is private while it is being built. Report a problem directly to the maintainer, Tim Ross, by
email (the address on the GitHub profile that owns the repository). Once the repository is public, use GitHub's
private vulnerability reporting ("Report a vulnerability" on the Security tab). Please do not open a public issue
for a security problem. Expect an acknowledgement within 7 days.

## Supported versions

Only the latest release on npm and the current build of the public site receive fixes. Before 1.0, there is no
backporting.
