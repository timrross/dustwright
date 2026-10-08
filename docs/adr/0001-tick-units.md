# 0001: Every tick count is a redstone tick

Date: 2026-10-08. Status: accepted.

## Decision

Every tick count in the format (`afterTicks`), the simulator and diagnostics is a **redstone tick**: 1 redstone
tick = 2 game ticks = 0.1 s. Repeater delays 1 to 4, button pulses (stone 10, wood 15) and the 64-tick settle cap
are all redstone ticks.

## Why

Redstone builders and the in-game repeater count in redstone ticks. Mixing units is the classic off-by-two bug,
and an LLM cannot tell which one a bare number means.

## Consequences

- `afterTicks` is at most 1,000 redstone ticks. The spec lists this in the Limits table (E013) and in Test
  semantics (the case fails with T002). The parser does **not** reject a larger value: the simulator reports T002
  for that case (M6), so one over-long case does not hide the rest of the design. The other Limits rows are E013
  at parse time.
- Anything measured in game ticks (game-side timings) is converted at the boundary.
