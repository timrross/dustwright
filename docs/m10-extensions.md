# M10 scope: optional extensions

The spec's M10 holds three optional extensions, each to go through `docs/ideas.md` first. This is that pass,
written on 2026-10-09 before the work: what each would be, and whether it is built.

## 1. Pattern `include` (built)

The spec (LLM authoring deliverables) names it: "an `include` section to stamp a pattern at an offset with
rotation, so agents build from parts instead of raw grids". It is an additive key in `rsd/1`; a design without it
is unchanged, and the format version stays `rsd/1`.

```json
"include": [{ "pattern": "not-gate", "at": [0, 0, 6], "rotate": 90 }]
```

- `pattern`: the name of a pattern in the built-in library: its file name in `patterns/`, as MCP's
  `list_patterns` and `get_pattern` use it (`piston-door-2x2`; its `meta.slug`, which exporters and the loader use,
  is `2x2-piston-door`), which core carries as generated data, so
  every tool (CLI, MCP, site, viewer) resolves the same patterns without file access.
- `at`: the cell where the stamped pattern's lowest corner lands.
- `rotate`: 0, 90, 180 or 270 degrees clockwise seen from above. Positions turn about the vertical axis, and every
  orientation state turns with them (`facing` and `mount` north to east to south to west for 90); `hinge`, `half`
  and vertical `facing`/`mount` values stay.
- Only blocks are stamped. The design declares its own ports and tests, using the stamped positions; a pattern's
  ports, tests and annotations are not imported. Patterns contain no `include`, so there is no recursion.
- Every stamped block must fall inside the design's box (the layers' size) on an air cell of the layers; an
  unknown pattern, a stamp outside the box, or a stamp onto a block is an error. (As built: no new code. An
  unknown pattern is a schema error, E001, since the schema lists the library; outside the grid is E008 and onto a
  block E009, the codes the grid and the overrides already use.) At most 64
  includes, and stamped blocks count towards the 50,000-block limit.
- The parser expands includes into the model, so the validator, simulator, viewer, sheets and every exporter see
  ordinary blocks; nothing downstream changes.
- Proven by unit tests (rotation of every orientation state against the registry's directional keys; a stamped
  pattern passes its own tests in the simulator at every rotation, with ports moved with it) and in game: a design
  built only from includes is exported and its tests run in the Bedrock test world.

## 2. Script API loader (built)

The spec (exporters): "an addon that reads design JSON from the pack and places blocks via `BlockPermutation`.
Stable modules only."

- `rsd loader <design.rsd.json ...> -o <file.mcpack>`: one behavior pack holding the loader script and the given
  designs. Each design is stored as data already mapped to Bedrock by the registry (block IDs and states, in the
  `.mcfunction` exporter's placement order), so the script does no mapping and evaluates nothing from a design:
  the data file is one JSON literal. (As built: plain `JSON.stringify`, which is a valid JavaScript literal; it
  holds only slugs, registry IDs, states and integers, never a design's free text.)
- In game: `/scriptevent rsd:build <slug> <x> <y> <z>` builds a design with its origin at x y z in the overworld
  (from chat or the console); `/scriptevent rsd:list` lists the designs in the pack. Blocks are placed with
  `BlockPermutation.resolve` and `Block.setPermutation`, spread over ticks with `system.runJob`, so a large design
  does not trip the watchdog and has no command limit.
- Only stable `@minecraft/server`, at the version the test server offers (measured with a probe pack, pinned).
  `@minecraft/server-net` (fetching designs over HTTP) is beta and dedicated-server only: not built, as the spec
  says, unless Tim opts in.
- Proven in the Bedrock test world: the pack is installed, every pattern is built through `rsd:build`, and the
  in-game check's truth tables run on those builds.

## 3. Server-side storage or a gallery (not built)

The spec builds these only "if the site turns out to need them". Nothing so far shows a need: the site is static,
share links carry the design in the URL fragment, and files download. Building either means a backend, accounts or
moderation, which the spec's non-goals rule out for v1. It stays in `docs/ideas.md` until a need shows.
