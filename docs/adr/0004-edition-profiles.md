# 0004: Edition profiles

Date: 2026-10-08. Status: accepted.

## Decision

`meta.edition` (`bedrock`, the default, or `java`) is the project switch. Everything that differs between editions
lives in one `EditionProfile` object per edition: validator rules, simulator mechanics, the registry field that
supplies IDs and states, exporters and the AUTHORING.md chapter. Nothing else branches on the edition.

- The interfaces (`EditionProfile`, `Rule`, `Exporter`, `SimMechanics`) live in `core`, so every package can
  implement them without depending on another.
- The profile objects live in `validator`, which depends on `sim` (mechanics) and `export` (exporters). The CLI
  and the MCP server read profiles from there.
- v1 ships the Bedrock profile. The Java profile exists from M1 as a stub whose only rule reports E015, so a Java
  design parses, validates its structure and renders, but cannot be simulated or exported until M9.
- Registry entries list the editions a block exists in (`editions`). All 28 v1 types exist in both editions; a
  type missing from one would be E004 there, with a hint naming the edition. The `java` mapping stays `null`
  until M9.

## Why

Java is a planned second edition, not an export bolted on. Designing the switch in from M1 means adding Java
touches the profile, the registry's `java` field and the patterns' verification entries, and nothing else.
