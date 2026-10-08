# 0002: The slug is the only design string that becomes a file name

Date: 2026-10-08. Status: accepted.

## Decision

- A slug is runs of `[a-z0-9]` joined by single `-`, 1 to 48 characters (`/^[a-z0-9]+(-[a-z0-9]+)*$/`).
- `meta.slug` is used when given; an invalid one is E012.
- Otherwise the slug is derived from `meta.name`: lowercase, every character outside `[a-z0-9]` becomes `-`, runs
  of `-` collapse, both ends are trimmed, and the result is cut to 48 characters and trimmed again. Empty after
  derivation (for example a name made only of emoji) is E012.
- `meta.name` is a label only (1 to 80 printable characters, no control characters). It never reaches a path,
  a command or HTML.
- Exporters validate the slug again before building a path.

## Why

A design is untrusted input. `../../evil` must not escape the pack, and a newline in a name must not become a
command. Funnelling every file name through one strict grammar makes that a property of the grammar, not of each
exporter.

## Consequences

`../../evil` becomes `evil`; a 200-character name is E013 (the name limit is 80); an 80-character name yields a
48-character slug.
