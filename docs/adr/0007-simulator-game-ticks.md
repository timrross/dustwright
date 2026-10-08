# 0007: The simulator steps in game ticks

Date: 2026-10-08. Status: accepted. Refines 0001.

## Decision

The simulator advances one **game tick** (0.05 s) per step. Every tick count it takes or reports stays a redstone
tick (ADR 0001): `afterTicks`, the 64-tick settle cap, button pulses and every diagnostic are converted at the
boundary (one redstone tick is two game ticks). Component delays live in `SimMechanics.timing`, in game ticks.

## Why

Some Bedrock delays are not whole redstone ticks. Measured in game (`deploy/test-world/measure-timing.mjs`,
`docs/ingame/2026-10-08-m6-timing.json`), two observers facing each other clock with a period of exactly 6 game
ticks (3 redstone ticks) and a 2-game-tick pulse, so each observer reacts after 3 game ticks. A simulator that
stepped in redstone ticks could only produce periods of 2 or 4.

## Consequences

- Delays that are one redstone tick (torch, repeater step, comparator, piston, lamps and doors) are 2 game ticks.
- The power view's slider moves in game ticks and labels them as redstone ticks, with halves where they occur.
- A future timing measured in game ticks needs no change to the format.
