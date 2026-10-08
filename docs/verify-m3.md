# M3 in-game checklist

For the maintainer's sign-off. Everything here happens in the test world (`deploy/test-world`), never on a live
world. Record the date, the game version, results and screenshots in `VERIFY.md` under M3.

## Prepare

```sh
pnpm build
export RSD_PACK_DIR="$PWD/packs/redstone-designs-bp"
for f in examples/*.rsd.json; do pnpm rsd export "$f" --to mcfunction --clear; done
```

Restart the server after exporting (`docker compose restart`): a reload picks up edits to existing functions but does
not discover new function files. In game: creative, cheats on. Stand on open flat ground, facing north, for each
build.

## 1. Orientation test (critical)

1. `/function rsd/orientation-test`. It places 100 blocks in 14 rows (doors open and closed, trapdoors top and bottom), each on a wool square coloured by orientation
   (north red, south blue, east yellow, west lime, up white, down black, floor gray, ceiling light gray).
2. Open the same design in the viewer (`pnpm rsd bundle examples/orientation-test.rsd.json -o ot.html`, or the
   playground) and use the same angle (stand south of the build looking north; the viewer's S view).
3. For each row, compare every block with the viewer: repeaters and comparators point the way the signal leaves;
   torches, levers and buttons sit against the block their mount names; pistons, observers, hoppers, droppers and
   dispensers face their stated direction; stairs climb toward `facing`; doors and trapdoors hinge as shown.
4. Note any block that differs, by its annotation text (for example `torch mount=west`), with a screenshot.
   Each mismatch is a registry fix (and its VIG row in `docs/verify-in-game.md`).

Pass: every block matches. Screenshots of each row in game and in the viewer go in `VERIFY.md`.

## 2. The five examples work as their tests describe

For each of `not-gate`, `repeater-line`, `observer-clock`, `t-flip-flop`, `2x2-piston-door`:

1. `/function rsd/<slug>`. Pass: no block pops off (no dropped items) while it builds.
2. Exercise it:
   - NOT gate: the lamp is lit; flip the lever and it goes out.
   - Repeater line: flip the lever; the lamp lights after the repeater's delay.
   - Observer clock: the dust on the east flickers from the moment it is built; the lamp on the west stays lit (the
     pulses are too fast for a lamp to go dark).
   - T flip-flop: flip the lever on (the lamp lights), off (stays lit), on (goes out). Build this one first: its
     toggle depends on a timing race.
   - 2x2 piston door: closed when built; lever on opens it, lever off closes it.

## 3. Clear and rebuild

1. `/function rsd/<slug>_clear`, then `/function rsd/<slug>` twice. Pass: the result looks identical to a single
   build. Not for the 2x2 piston door: it moves once built (its torches extend the pistons), so building over it
   pushes its blocks again; clear it before every rebuild.
2. Build next to existing blocks and run only `/function rsd/<slug>`. Pass: nothing outside the design's cells
   disappears (the build never sets air).

## 4. The pack

`docker compose logs` shows no `ERROR` lines for `Dustwright redstone designs`, and the pack appears in the world's
behavior packs.
