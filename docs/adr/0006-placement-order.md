# 0006: Fixed placement order in function exports

Date: 2026-10-08. Status: accepted.

## Decision

`.mcfunction` exports place blocks in three groups, each sorted by y, then z, then x:

1. Building blocks: registry categories `solid` and `transparent` (stone, wool, glass, slabs, stairs, slime,
   target, note blocks...).
2. Components and consumers, bottom to top: dust, repeaters, comparators, observers, lamps, pistons, doors,
   trapdoors, hoppers, droppers, dispensers.
3. Power sources last, in their authored initial state: torches, levers, buttons, pressure plates, daylight
   sensors, redstone blocks.

A door places its lower half and then its upper half in two consecutive commands.

## Why

`setblock` triggers block updates. A torch placed before its support pops off; a lever placed before the wiring it
drives fires into a half-built circuit. Building blocks first gives every component its support; sources last
means the circuit is complete when it first gets power.

## Consequences

Measured in game (BDS 1.26.52, M3 review): inside one function, a torch, dust or lever placed before its support
survives as long as the support arrives later in the same function; only a component whose support never arrives
breaks. The order is therefore a safety margin for the placement rule plus the real protection against circuits
firing half-built, not the only thing keeping components attached.

The order is part of the golden files, so any change to it shows up as a reviewed diff. `/structure load` (M4)
places everything at once and mostly avoids the problem.
