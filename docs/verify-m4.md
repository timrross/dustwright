# M4 in-game checklist

For the maintainer's sign-off, in the test world (`deploy/test-world`). Record results and screenshots in
`VERIFY.md` under M4.

## Prepare

```sh
pnpm build
export RSD_PACK_DIR="$PWD/packs/redstone-designs-bp"
for f in examples/*.rsd.json; do pnpm rsd export "$f" --to mcstructure; done
```

Restart the server (`docker compose restart`): new structure files, like new function files, are found only at
start-up.

## 1. Round trip with a structure block

1. Build the orientation test with `/function rsd/orientation-test` (see `docs/verify-m3.md`).
2. Place a structure block in Save mode over the build's box (48 × 3 × 42, starting one block east of where you
   stood), and press Export to save a `.mcstructure` file on your device.
3. Compare it with the exported file:
   `node deploy/test-world/compare-structure.mjs <exported-from-game>.mcstructure packs/redstone-designs-bp/structures/rsd/orientation-test.mcstructure`

Pass: "N blocks identical (name, states, tag types)" and exit code 0. Container fields may differ and are printed
for information: the server writes `format_version` 2 with one int-array layer, Dustwright writes format 1 with two
int-list layers (the second all -1), and the game adds block entities (`block_position_data`) for pistons, hoppers
and so on. A client Export may differ in container again.

## 2. Load the examples

For each example, stand in open space and run `/structure load rsd:<slug> ~1 ~ ~`, then again a few blocks away
with `/structure load rsd:<slug> ~1 ~ ~ 90_degrees`. Pass: every example looks like the viewer (rotated a quarter
turn clockwise, seen from above, for the second), and works as in `docs/verify-m3.md` §2.
