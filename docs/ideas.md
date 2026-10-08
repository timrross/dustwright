# Ideas (out of scope)

Anything outside the architecture spec lands here first, not in the code. Each entry says what it is and why it
waits.

- **Server-side storage, a gallery and accounts.** The site is static by design. Revisit only if share links and
  files prove insufficient (M10 at the earliest).
- **Pack versioning by content hash.** `.mcpack` versions stay `[1, 0, 0]` until this is designed, so a changed
  design needs the old pack removed before re-import.
- **Usage numbers.** No analytics in v1. If wanted later, a cookie-free counter is proposed here first.
- **`expectTrace` in tests.** A list of (tick, values) pairs for testing clock periods and pulse widths.
