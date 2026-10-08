# Ideas (out of scope)

Anything outside the architecture spec lands here first, not in the code. Each entry says what it is and why it
waits.

- **Server-side storage, a gallery and accounts.** The site is static by design. Revisit only if share links and
  files prove insufficient (M10 at the earliest).
- **Pack versioning by content hash.** `.mcpack` versions stay `[1, 0, 0]` until this is designed, so a changed
  design needs the old pack removed before re-import.
- **Usage numbers.** No analytics in v1. If wanted later, a cookie-free counter is proposed here first.
- **`expectTrace` in tests.** A list of (tick, values) pairs for testing clock periods and pulse widths.
- **Lever axis on floors and ceilings.** A floor lever has a north-south or east-west axis in game; v1 places
  every floor and ceiling lever on the north-south axis. An `axis` key would need a spec change.
- **Copper bulb and other post-1.21 components.** Outside the v1 block set.
- **Container contents.** Items in hoppers and droppers would enable the classic Bedrock dropper T flip-flop, but
  containers with items are a v1 non-goal.
- **NBT writer risk.** nbtify (the `.mcstructure` writer) last released 2.2.0 in October 2024 and has one
  maintainer. If it stalls or breaks, the fallback is vendoring it (MIT, small, no dependencies but mutf-8) or a
  small reviewed little-endian writer, checked against prismarine-nbt decoding as the tests already do.
- **Byte-identical structures to the game's.** Palette state keys follow the registry's order and the container is
  `format_version` 1; the game's own saves use format 2 and its own key order. Both load the same; matching the
  bytes exactly would need the format 2 layout.
