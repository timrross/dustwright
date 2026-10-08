# Authoring Dustwright designs

A guide for LLM agents (and people) writing redstone designs in the `rsd/1` format for Minecraft **Bedrock
Edition**. Read it once, then work in the loop at the end: write, validate, fix.

## The format in one minute

A design is one JSON file, `<name>.rsd.json`: horizontal **layers** of character **rows**, and a **legend** that
maps each character to a block.

```json
{
  "format": "rsd/1",
  "meta": { "name": "NOT gate", "edition": "bedrock", "gameVersion": "1.26.50" },
  "legend": { "#": "stone", "L": "lever mount=floor", "-": "dust", "t": "torch mount=west", "*": "lamp" },
  "layers": [["#####"], ["L-#t*"]],
  "ports": {
    "inputs": [{ "name": "A", "pos": [0, 1, 0] }],
    "outputs": [{ "name": "out", "pos": [4, 1, 0] }]
  },
  "tests": [
    { "set": { "A": 0 }, "afterTicks": 4, "expect": { "out": 1 } },
    { "set": { "A": 1 }, "afterTicks": 4, "expect": { "out": 0 } }
  ]
}
```

Required keys: `format` (always `"rsd/1"`), `meta.name`, `legend`, `layers`. Unknown keys are errors; put
tool-specific data under `ext`.

## Axes and grid

- +X is east, +Y is up, +Z is south. `[0,0,0]` is the north-west bottom corner.
- `layers[y]` is one horizontal slice, listed **bottom to top**.
- `layers[y][z]` is one row string, listed **north to south**.
- The character at index `x` of a row is the block at `x`, **west to east**.
- So the block at `[x, y, z]` is `layers[y][z][x]`.
- `.` and space are air.
- Every row in the design has the same length, and every layer has the same number of rows. Pad with `.`.
- Legend keys are single printable ASCII characters other than `.` and space.

## Block specs

`<type> [key=value ...]` with single spaces, all lowercase: `repeater facing=east delay=2`. Values are
lowercase words, integers or `true`/`false`. Unspecified keys take the default, but **always write orientation
keys explicitly**. A spec is at most 200 characters.

### Orientation (identical in the viewer, validator and every exporter)

| Type                       | Key              | Meaning                                                                                             |
| -------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| repeater, comparator       | `facing`         | Direction the signal **exits**                                                                      |
| torch, lever, button       | `mount`          | Where the **supporting block** is: `floor`, `ceiling`, or `north`/`south`/`east`/`west`             |
| piston, sticky_piston      | `facing`         | Direction the head **pushes**                                                                       |
| observer                   | `facing`         | Direction the face **looks** (its input side); the output is the opposite side                      |
| hopper, dropper, dispenser | `facing`         | Direction items **leave**                                                                           |
| stairs                     | `facing`, `half` | Direction you walk to **climb** them (the tall back is on that side); `half=top` is upside down     |
| slab                       | `half`           | `bottom` or `top` half of the cell                                                                  |
| door                       | `facing`         | Direction a player **looks** when placing it; `hinge` is `left` or `right`                          |
| trapdoor                   | `facing`, `half` | The hinge is on the edge **opposite** `facing`; `half` is the bottom or top of the cell when closed |

Examples: a torch on the east face of a block that sits west of it is `torch mount=west`. A repeater carrying a
signal from west to east is `repeater facing=east`. Torches have no `ceiling` mount; levers and buttons do.

### Block list

| Type              | Category     | States (default)                                                                                                                                           | Needs support | Port           |
| ----------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------- |
| `button`          | power source | `mount` floor/ceiling/north/south/east/west (default floor); `material` stone/wood (default stone); `pressed` false/true (default false)                   | by mount      | input          |
| `comparator`      | component    | `facing` north/south/east/west (default north); `mode` compare/subtract (default compare); `powered` false/true (default false)                            | below         | output (0..15) |
| `concrete`        | solid        | `color` 16 dye colours, e.g. white/red/light_blue (default white)                                                                                          | —             | —              |
| `daylight_sensor` | power source | `inverted` false/true (default false)                                                                                                                      | —             | —              |
| `dispenser`       | consumer     | `facing` down/up/north/south/east/west (default north)                                                                                                     | —             | —              |
| `door`            | consumer     | `facing` north/south/east/west (default north); `hinge` left/right (default left); `open` false/true (default false); `material` wood/iron (default wood)  | below         | output (0/1)   |
| `dropper`         | consumer     | `facing` down/up/north/south/east/west (default north)                                                                                                     | —             | —              |
| `dust`            | component    | `power` 0..15 (default 0)                                                                                                                                  | below         | output (0..15) |
| `glass`           | transparent  | —                                                                                                                                                          | —             | —              |
| `honey_block`     | transparent  | —                                                                                                                                                          | —             | —              |
| `hopper`          | consumer     | `facing` down/north/south/east/west (default down)                                                                                                         | —             | —              |
| `lamp`            | consumer     | `lit` false/true (default false)                                                                                                                           | —             | output (0/1)   |
| `lever`           | power source | `mount` floor/ceiling/north/south/east/west (default floor); `on` false/true (default false)                                                               | by mount      | input          |
| `note_block`      | solid        | —                                                                                                                                                          | —             | output (0/1)   |
| `observer`        | component    | `facing` down/up/north/south/east/west (default north); `powered` false/true (default false)                                                               | —             | —              |
| `piston`          | consumer     | `facing` down/up/north/south/east/west (default up)                                                                                                        | —             | output (0/1)   |
| `pressure_plate`  | power source | `material` stone/wood (default stone); `on` false/true (default false)                                                                                     | below         | input          |
| `redstone_block`  | power source | —                                                                                                                                                          | —             | —              |
| `repeater`        | component    | `facing` north/south/east/west (default north); `delay` 1/2/3/4 (default 1); `powered` false/true (default false)                                          | below         | —              |
| `slab`            | transparent  | `half` bottom/top (default bottom)                                                                                                                         | —             | —              |
| `slime`           | transparent  | —                                                                                                                                                          | —             | —              |
| `stairs`          | transparent  | `facing` north/south/east/west (default north); `half` bottom/top (default bottom)                                                                         | —             | —              |
| `sticky_piston`   | consumer     | `facing` down/up/north/south/east/west (default up)                                                                                                        | —             | output (0/1)   |
| `stone`           | solid        | —                                                                                                                                                          | —             | —              |
| `target`          | solid        | —                                                                                                                                                          | —             | —              |
| `torch`           | power source | `mount` floor/north/south/east/west (default floor); `lit` false/true (default true)                                                                       | by mount      | —              |
| `trapdoor`        | consumer     | `facing` north/south/east/west (default north); `half` bottom/top (default bottom); `open` false/true (default false); `material` wood/iron (default wood) | —             | output (0/1)   |
| `wool`            | solid        | `color` 16 dye colours, e.g. white/red/light_blue (default white)                                                                                          | —             | —              |

"Needs support" blocks must sit on a solid block (below), or on the block their `mount` names. Inputs are what a
test can drive (`set`); outputs are what it can read (`expect`), with the values they report.

- `door` occupies two cells: put it in the lower cell and leave the cell above as air (`.`); the upper half is
  placed for you.
- `wool` and `concrete` take `color=` (white, orange, magenta, light_blue, yellow, lime, pink, gray, light_gray,
  cyan, purple, blue, brown, green, red, black). Use colours to group sub-circuits.
- `powered`, `lit`, `on`, `pressed` and `power` describe the **initial** state; the game recomputes them.

## Optional sections

- `ports`: `{ "inputs": [{ "name", "pos": [x,y,z] }], "outputs": [...] }`. Names are 1 to 32 of `A-Z a-z 0-9 _ -`,
  unique across inputs and outputs. Inputs sit on a lever, button or pressure_plate; outputs on a lamp, piston,
  sticky_piston, door, trapdoor, note_block, dust or comparator.
- `tests`: truth-table cases, `{ "set": { input: 0|1 }, "afterTicks": n, "expect": { output: value } }`.
- `blocks`: overrides applied after layers, `[{ "pos": [x,y,z], "block": "<spec>" }]`, one per position.
- `annotations`: `[{ "pos": [x,y,z], "text": "..." }]`, pinned to a block, shown in the viewer.
- `steps`: build steps, `{ "title", "layers": [y, ...] }` or `{ "title", "positions": [[x,y,z], ...] }`. Default:
  one step per layer.
- `meta`: `name` (1 to 80 printable characters), `slug` (optional; `a-z0-9` runs joined by `-`, at most 48;
  derived from the name when omitted), `description` (at most 2,000), `edition` (`bedrock`, the default;
  `java` is not supported yet), `gameVersion` (e.g. `1.26.50`).

## Tests: how they run

- Ticks are **redstone ticks**: 1 redstone tick = 2 game ticks = 0.1 s.
- Each case starts from the design as written, runs until stable (at most 64 ticks), applies `set`, runs
  `afterTicks` more ticks (at most 1,000), then reads `expect`. Cases are independent.
- Levers and pressure plates hold the value (`0` off, `1` on). A button value of `1` is one press (stone 10 ticks,
  wood 15).
- Lamps, pistons, doors, trapdoors and note blocks report `0` or `1`. Dust and comparators report their power
  level, `0` to `15`.
- Write `ports` and `tests` **before** placing blocks, from the brief.

## Bedrock rules that bite

- **No quasi-connectivity.** A piston is powered only by power at the piston itself: an adjacent powered block
  (above it too, unless it faces up), dust pointing into it, a torch beside it, a repeater facing into
  it. Power two blocks above it, or diagonally above, does nothing (that is Java's quasi-connectivity). Each
  piston in a stack needs its own power.
- Dust loses one level per block; after 15 blocks it is dead. Insert a repeater.
- A torch turns off when the block it hangs on is powered, and strongly powers the block above it.
- A redstone block powers components and dust next to it, not solid blocks.
- Patterns from Java tutorials often fail on Bedrock. If unsure, keep the circuit simple and test it.

## Limits

2 MB file; JSON nesting depth 8; bounding box 64 × 384 × 64 (E007); 90 legend entries; 50,000 non-air blocks;
10,000 `blocks` overrides; 64 inputs and 64 outputs; 64 tests; 500 annotations of at most 500 characters; 384
steps. Exceeding a limit is E013.

## The loop

1. **Brief:** restate the job as named inputs, outputs and a truth table; write `ports` and `tests` first.
2. **Draft:** write `layers` and `legend`. Spread the circuit out; compact layouts come later.
3. **Check:** `rsd validate design.rsd.json --json`. It prints `{ "ok": bool, "diagnostics": [...] }` and exits 0
   (ok, warnings allowed), 1 (errors) or 2 (usage or file problem).
4. **Fix:** each diagnostic has a `code`, a `pos` `[x,y,z]` (or a JSON Pointer `path`), a `message` and a `hint`
   naming the edit. Apply it and go to 3. Stop after 6 rounds and report what still fails. **Never edit ports or
   tests to make a failure go away**; if the brief was wrong, say so.
5. **Show:** `rsd bundle design.rsd.json -o design.html` writes one self-contained HTML viewer (publish it as an
   artifact or open it offline).

Common codes: E002 ragged grid, E003 character not in legend, E004 unknown type (hint has the closest names),
E005 bad key or value (hint lists the allowed ones), E008 position outside the grid or on air, E011 port or test
reference, E012 slug, E013 limit. W108 means a block's in-game mapping is not verified yet; it is safe to ignore
while authoring. The full list is in `docs/diagnostics.md`.

## Common mistakes

- Rows of different lengths, or a layer with a missing row (E002). Count characters.
- Reading layers top-down. `layers[0]` is the **bottom**.
- Mixing up `mount` and `facing`: torches, levers and buttons use `mount` (where the support is).
- A component with nothing under it: dust, repeaters, comparators, pressure plates and floor torches need a
  solid block below.
- A port on air, or an output port on stone (E008, E011).
- Relying on quasi-connectivity for a piston (see above).

## Worked example: repeater line

A lever drives 15 dust; a repeater refreshes the signal for a lamp further on.

```json
{
  "format": "rsd/1",
  "meta": { "name": "Repeater line", "edition": "bedrock" },
  "legend": {
    "#": "stone",
    "L": "lever mount=floor",
    "-": "dust",
    ">": "repeater facing=east delay=2",
    "*": "lamp"
  },
  "layers": [["###################"], ["L--------------->-*"]],
  "ports": {
    "inputs": [{ "name": "A", "pos": [0, 1, 0] }],
    "outputs": [{ "name": "out", "pos": [18, 1, 0] }]
  },
  "tests": [
    { "set": { "A": 1 }, "afterTicks": 6, "expect": { "out": 1 } },
    { "set": { "A": 0 }, "afterTicks": 6, "expect": { "out": 0 } }
  ]
}
```

Layer 0 is a stone floor; layer 1 holds the circuit. The lever is `[0,1,0]`, the repeater `[16,1,0]` facing east
(the direction the signal leaves), and the lamp `[18,1,0]`.

More examples live in `examples/`: a NOT gate, an observer clock, a T flip-flop and a 2x2 piston door.
