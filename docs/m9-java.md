# M9 scope: the Java edition profile

The spec leaves M9 "scoped in detail when M8 is done". This is that scope, written on 2026-10-09 before the work.
The format does not change: a design picks its edition with `meta.edition`, and everything that differs lives in
the Java `EditionProfile`, the registry's `java` fields and the patterns' Java verification entries.

## Targets and pinned data

- **Java Edition 26.3** (released 2026-09-15), the current release. `PINS.javaVersion`.
- **Block data:** the block report from that version's own data generator (`reports/blocks.json`), built by
  `pnpm fetch:java-data` from the server jar (SHA-1 pinned from Mojang's manifest) in a Java 25 container and
  checked against a pinned SHA-256. Like the Bedrock metadata it is Mojang's, so it is cached in `.cache/` and never
  committed. A registry test checks every Java ID, every state the game defines and every value against it.
- **Test world:** `deploy/test-world-java/`, a Fabric 26.3 server (Fabric keeps the game logic vanilla) with
  WorldEdit 7.4.6 only to load Sponge `.schem` files from the console. Flat, creative, never paused when empty, with
  the check area force-loaded. Commands go over RCON inside the container; answers come back directly.

## What is built

1. **Registry `java` mappings** for all 28 types. Orientation mappings carry VERIFY-IN-GAME until Java probes prove
   them (as M1 and M3 did for Bedrock). Neighbour-dependent shapes the format does not store (dust connections,
   stair corners) are computed by the Java exporters and checked against the shape the game gives the same build.
   `faces.java` (which faces hold components) is measured in the Java world, as M5 measured Bedrock's.
2. **Java mechanics** in the simulator: quasi-connectivity (a piston also counts power at the block above it, and
   only acts when it is updated), and Java timings measured in game with the M6 method. Where Java differs in ways
   the simulator does not model (update order), cases stay approximate and the game wins, as for Bedrock.
3. **Java rules:** the stage 1 and 2 rules that are edition-neutral run for Java with Java's measured faces; W105
   (relies on quasi-connectivity) stays Bedrock-only, since QC is a feature on Java. W107 compares with the Java pin
   and W108 reads the Java mapping's verification. E015 is retired.
4. **Exporters:** Sponge Schematic v3 (`.schem`, gzipped big-endian NBT) and Litematica (`.litematic`). Both are
   deterministic and golden-tested; the `.schem` is decoded back and compared block by block.
5. **CLI, MCP and site:** `rsd export --to schem|litematic` (into a directory, not a behavior pack), the same in the
   MCP `export` tool, and the playground's downloads follow the design's edition.
6. **AUTHORING.md** gains a short Java chapter (what changes: quasi-connectivity, timings, the export targets), kept
   within the 3,000-word budget.

## Acceptance (the spec's three items, and how each is shown)

- **Every v1 pattern has a Java verification entry or a documented reason it differs.** Each pattern is built in
  the Java world from its `.schem` (WorldEdit) and its tests run there, logged per pattern; a pattern that behaves
  differently on Java gets a reason in its Java entry.
- **The M3 orientation test design round-trips through `.schem` into a Java world.** Exported, pasted with
  WorldEdit, every block checked by ID and state with `execute if block`, then copied back out with WorldEdit and
  compared with the export.
- **The M8 eval re-run in Java mode reaches the same 8 of 10.** The same ten prompts, the agent told the design is
  for Java Edition, through the CLI.

## Out of scope

- A Java datapack (`.mcfunction` for Java); the spec names `.schem` and Litematica. Commands are only used by the
  in-game check.
- Litematica loading in game: it is a client mod, so its exporter is proven by decoding, not by a Java world.
- Java-only blocks outside the v1 set.
