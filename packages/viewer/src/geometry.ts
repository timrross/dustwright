import { registryEntry } from "@dustwright/core";
import type { Block, Pos, StateValue } from "@dustwright/core";

/** An axis-aligned box in block-local units: 0..1 per axis (a door reaches y = 2). */
export interface Box {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/** What a part shows: the block body, a marked face, or a direction arrow (toggled by the overlay). */
export type PartRole = "body" | "face" | "arrow";

/** One coloured box of a block's procedural model. `color` is a palette token. */
export interface Part extends Box {
  color: string;
  role: PartRole;
}

/** Looks up the block at a neighbouring position (for dust connections). */
export type NeighbourLookup = (pos: Pos) => Block | undefined;

type Dir = "north" | "south" | "east" | "west" | "up" | "down";
const H: readonly Dir[] = ["north", "south", "east", "west"];
const OFFSET: Record<Dir, Pos> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};
const OPPOSITE: Record<Dir, Dir> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
  up: "down",
  down: "up",
};

const box = (
  min: [number, number, number],
  max: [number, number, number],
  color: string,
  role: PartRole = "body",
): Part => ({
  min,
  max,
  color,
  role,
});

/** Maps a point of a model drawn facing north (front at z = 0) to the given facing. */
function rotatePoint(p: readonly [number, number, number], facing: Dir): [number, number, number] {
  const [x, y, z] = p;
  switch (facing) {
    case "north":
      return [x, y, z];
    case "south":
      return [1 - x, y, 1 - z];
    case "east":
      return [1 - z, y, x];
    case "west":
      return [z, y, 1 - x];
    case "up":
      return [x, 1 - z, y];
    case "down":
      return [x, z, 1 - y];
  }
}

/** Rotates a part drawn facing north to `facing`, keeping min below max on every axis. */
function rotate(part: Part, facing: Dir): Part {
  const a = rotatePoint(part.min, facing);
  const b = rotatePoint(part.max, facing);
  return {
    ...part,
    min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
    max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])],
  };
}

const str = (v: StateValue | undefined, fallback: string) => (typeof v === "string" ? v : fallback);

/** A flat arrow drawn facing north, just above `y`, from the back of the cell to the front. */
function arrow(y: number, color = "arrow"): Part[] {
  const h = 0.02;
  return [
    box([0.45, y, 0.36], [0.55, y + h, 0.88], color, "arrow"),
    box([0.28, y, 0.28], [0.72, y + h, 0.36], color, "arrow"),
    box([0.34, y, 0.2], [0.66, y + h, 0.28], color, "arrow"),
    box([0.4, y, 0.12], [0.6, y + h, 0.2], color, "arrow"),
    box([0.46, y, 0.05], [0.54, y + h, 0.12], color, "arrow"),
  ];
}

/**
 * An arrow pointing along `dir`. Horizontal arrows lie just above the block (`top`); up and down arrows stand on the
 * block's south face, which the default view looks at, so the two read differently (a top-down view shows the
 * block's coloured face instead).
 */
function directionArrow(dir: Dir, top = 1): Part[] {
  if (dir === "up" || dir === "down") {
    // The flat arrow drawn facing north, stood up on the south face: its tip (z = 0) becomes the top (or bottom).
    const height = Math.min(top, 1);
    return arrow(0).map((p) => {
      const flip = (z: number) => (dir === "up" ? (1 - z) * height : z * height);
      const y0 = flip(p.min[2]);
      const y1 = flip(p.max[2]);
      return { ...p, min: [p.min[0], Math.min(y0, y1), 1.01], max: [p.max[0], Math.max(y0, y1), 1.03] };
    });
  }
  return arrow(top + 0.02).map((p) => rotate(p, dir));
}

/** The support face a mount names, as a direction from the block (floor = down). */
function mountDir(mount: string): Dir {
  if (mount === "floor") return "down";
  if (mount === "ceiling") return "up";
  return mount as Dir;
}

/** Whether a neighbouring block makes a dust arm point at it. */
function dustConnects(block: Block | undefined, dirFromDust: Dir): boolean {
  if (!block) return false;
  switch (block.type) {
    case "dust":
    case "lever":
    case "button":
    case "pressure_plate":
    case "daylight_sensor":
    case "redstone_block":
    case "torch":
    case "target":
      return true;
    case "repeater": {
      // Only the input and output ends connect.
      const f = str(block.states.facing, "north") as Dir;
      return f === dirFromDust || f === OPPOSITE[dirFromDust];
    }
    case "comparator":
      return true;
    case "observer":
      // The output (back) side connects: it faces the dust when the observer looks away from it.
      return str(block.states.facing, "north") === dirFromDust;
    default:
      return false;
  }
}

/** Dust arms: toward connected neighbours on the same level, or one block up or down a step. */
function dustArms(pos: Pos, at: NeighbourLookup): Dir[] {
  const arms = H.filter((d) => {
    const o = OFFSET[d];
    const side: Pos = [pos[0] + o[0], pos[1], pos[2] + o[2]];
    if (dustConnects(at(side), d)) return true;
    const up = at([side[0], side[1] + 1, side[2]]);
    const down = at([side[0], side[1] - 1, side[2]]);
    return up?.type === "dust" || (down?.type === "dust" && at(side) === undefined);
  });
  // An unconnected dust is a cross; a dust with one arm extends straight through.
  if (arms.length === 0) return [...H];
  if (arms.length === 1) return [arms[0] as Dir, OPPOSITE[arms[0] as Dir]];
  return arms;
}

const DUST_Y = 0.0625;

type Builder = (block: Block, pos: Pos, at: NeighbourLookup) => Part[];

/** Colour token from a material state (wood, stone, iron) or a dye colour. */
function materialColor(block: Block, base: string): string {
  const m = block.states.material ?? block.states.color;
  return typeof m === "string" ? `${base}.${m}` : base;
}

/** The procedural geometry builders, keyed by registry `geometry.builder`. */
export const BUILDERS: Readonly<Record<string, Builder>> = {
  cube: (block) => [box([0, 0, 0], [1, 1, 1], colorFor(block))],
  cube_faced: (block) => {
    const facing = str(block.states.facing, "north") as Dir;
    return [
      box([0, 0, 0], [1, 1, 1], colorFor(block)),
      rotate(box([0.25, 0.25, -0.01], [0.75, 0.75, 0.0], `${colorFor(block)}.face`, "face"), facing),
      ...directionArrow(facing),
    ];
  },
  slab: (block) =>
    block.states.half === "top"
      ? [box([0, 0.5, 0], [1, 1, 1], colorFor(block))]
      : [box([0, 0, 0], [1, 0.5, 1], colorFor(block))],
  stairs: (block) => {
    const facing = str(block.states.facing, "north") as Dir;
    const top = block.states.half === "top";
    const c = colorFor(block);
    const parts = top
      ? [box([0, 0.5, 0], [1, 1, 1], c), box([0, 0, 0], [1, 0.5, 0.5], c)]
      : [box([0, 0, 0], [1, 0.5, 1], c), box([0, 0.5, 0], [1, 1, 0.5], c)];
    return [...parts.map((p) => rotate(p, facing)), ...directionArrow(facing)];
  },
  dust: (block, pos, at) => {
    // Brighter with more power: dust.p1 (dim) to dust.p15 (the same as dust.on); the power view relies on it.
    const power = typeof block.states.power === "number" ? block.states.power : 0;
    const c = power > 0 ? `dust.p${Math.min(15, power)}` : "dust.off";
    const parts: Part[] = [box([0.3125, 0, 0.3125], [0.6875, DUST_Y, 0.6875], c)];
    for (const d of dustArms(pos, at)) parts.push(rotate(box([0.375, 0, 0], [0.625, DUST_Y, 0.3125], c), d));
    return parts;
  },
  repeater: (block) => {
    const facing = str(block.states.facing, "north") as Dir;
    const delay = typeof block.states.delay === "number" ? block.states.delay : 1;
    const on = block.states.powered === true;
    const t = on ? "torch.on" : "torch.off";
    const back = 0.5 + (delay - 1) * 0.1;
    const parts = [
      box([0, 0, 0], [1, 0.125, 1], "component.base"),
      box([0.4375, 0.125, 0.1875], [0.5625, 0.4375, 0.3125], t),
      box([0.4375, 0.125, back], [0.5625, 0.4375, back + 0.125], t),
      box([0.375, 0.125, 0.02], [0.625, 0.16, 0.12], "notch", "face"),
    ];
    return [...parts.map((p) => rotate(p, facing)), ...directionArrow(facing, 0.45)];
  },
  comparator: (block) => {
    const facing = str(block.states.facing, "north") as Dir;
    const subtract = block.states.mode === "subtract";
    const on = block.states.powered === true;
    const parts = [
      box([0, 0, 0], [1, 0.125, 1], "component.base"),
      box([0.1875, 0.125, 0.75], [0.3125, 0.375, 0.875], on ? "torch.on" : "torch.off"),
      box([0.6875, 0.125, 0.75], [0.8125, 0.375, 0.875], on ? "torch.on" : "torch.off"),
      box([0.4375, 0.125, 0.125], [0.5625, 0.3125, 0.25], subtract ? "torch.on" : "torch.off"),
    ];
    return [...parts.map((p) => rotate(p, facing)), ...directionArrow(facing, 0.4)];
  },
  torch: (block) => {
    const mount = str(block.states.mount, "floor");
    const c = block.states.lit === false ? "torch.off" : "torch.on";
    if (mount === "floor") {
      return [
        box([0.4375, 0, 0.4375], [0.5625, 0.5, 0.5625], "wood"),
        box([0.40625, 0.5, 0.40625], [0.59375, 0.6875, 0.59375], c),
        ...directionArrow("down", 0.75),
      ];
    }
    // Drawn against a support to the north, leaning away from it.
    const parts = [
      box([0.4375, 0.1875, 0], [0.5625, 0.6875, 0.25], "wood"),
      box([0.40625, 0.6875, 0.1875], [0.59375, 0.875, 0.375], c),
    ];
    return [...parts.map((p) => rotate(p, mount as Dir)), ...arrow(0.9).map((p) => rotate(p, mount as Dir))];
  },
  lever: (block) => leverOrButton(block, true),
  button: (block) => leverOrButton(block, false),
  plate: (block) => [
    box([0.0625, 0, 0.0625], [0.9375, block.states.on === true ? 0.03 : 0.0625, 0.9375], colorFor(block)),
  ],
  daylight_sensor: (block) => [
    box([0, 0, 0], [1, 0.375, 1], "wood"),
    box(
      [0.125, 0.375, 0.125],
      [0.875, 0.38, 0.875],
      block.states.inverted === true ? "daylight.inverted" : "daylight",
      "face",
    ),
  ],
  piston: (block) => {
    const facing = str(block.states.facing, "up") as Dir;
    const sticky = block.type === "sticky_piston";
    const head = sticky ? "piston.sticky" : "piston.head";
    // `extended` is not a registry state: the simulator's power view sets it, and the head then sits one cell out.
    const parts =
      block.states.extended === true
        ? [
            box([0, 0, 0.25], [1, 1, 1], "piston.body"),
            box([0.375, 0.375, -0.75], [0.625, 0.625, 0.25], "piston.body"),
            box([0, 0, -1], [1, 1, -0.75], head, "face"),
          ]
        : [box([0, 0, 0.25], [1, 1, 1], "piston.body"), box([0, 0, 0], [1, 1, 0.25], head, "face")];
    return [...parts.map((p) => rotate(p, facing)), ...directionArrow(facing)];
  },
  door: (block) => {
    const facing = str(block.states.facing, "north") as Dir;
    const open = block.states.open === true;
    const hingeRight = block.states.hinge === "right";
    const c = colorFor(block);
    // Closed: a thin panel on the side the door faces away from. Open: swung against the hinge side.
    const panel = open
      ? hingeRight
        ? box([0.8125, 0, 0], [1, 2, 1], c)
        : box([0, 0, 0], [0.1875, 2, 1], c)
      : box([0, 0, 0.8125], [1, 2, 1], c);
    return [rotate(panel, facing), ...directionArrow(facing, 2)];
  },
  trapdoor: (block) => {
    const facing = str(block.states.facing, "north") as Dir;
    const c = colorFor(block);
    const top = block.states.half === "top";
    if (block.states.open === true)
      return [rotate(box([0, 0, 0.8125], [1, 1, 1], c), facing), ...directionArrow(facing)];
    return [
      top ? box([0, 0.8125, 0], [1, 1, 1], c) : box([0, 0, 0], [1, 0.1875, 1], c),
      ...directionArrow(facing),
    ];
  },
  observer: (block) => {
    const facing = str(block.states.facing, "north") as Dir;
    const parts = [
      box([0, 0, 0], [1, 1, 1], "observer"),
      box([0.125, 0.125, -0.01], [0.875, 0.875, 0], "observer.face", "face"),
      box(
        [0.375, 0.375, 1],
        [0.625, 0.625, 1.01],
        block.states.powered === true ? "torch.on" : "observer.back",
        "face",
      ),
    ];
    return [...parts.map((p) => rotate(p, facing)), ...directionArrow(facing)];
  },
  hopper: (block) => {
    const facing = str(block.states.facing, "down") as Dir;
    const parts = [
      box([0, 0.625, 0], [1, 1, 1], "iron"),
      box([0.25, 0.25, 0.25], [0.75, 0.625, 0.75], "iron"),
    ];
    if (facing === "down") parts.push(box([0.375, 0, 0.375], [0.625, 0.25, 0.625], "iron"));
    else parts.push(rotate(box([0.375, 0.25, 0], [0.625, 0.5, 0.25], "iron"), facing));
    return [...parts, ...directionArrow(facing)];
  },
};

function leverOrButton(block: Block, lever: boolean): Part[] {
  const support = mountDir(str(block.states.mount, "floor"));
  // Drawn on a floor (support below), then turned so the base sits against the support face.
  const on = block.states.on === true || block.states.pressed === true;
  const parts = lever
    ? [
        box([0.3125, 0, 0.25], [0.6875, 0.1875, 0.75], "component.base"),
        on
          ? box([0.4375, 0.1875, 0.25], [0.5625, 0.625, 0.375], "lever.handle")
          : box([0.4375, 0.1875, 0.625], [0.5625, 0.625, 0.75], "lever.handle"),
      ]
    : [box([0.3125, 0, 0.375], [0.6875, on ? 0.0625 : 0.125, 0.625], colorFor(block))];
  const placed = parts.map((p) => toSupport(p, support));
  return [
    ...placed,
    ...(support === "down" ? directionArrow("down", 0.7) : arrow(1.02).map((p) => rotate(p, support))),
  ];
}

/** Turns a part drawn on a floor so that its bottom face sits against `support`. */
function toSupport(part: Part, support: Dir): Part {
  if (support === "down") return part;
  if (support === "up")
    return {
      ...part,
      min: [part.min[0], 1 - part.max[1], part.min[2]],
      max: [part.max[0], 1 - part.min[1], part.max[2]],
    };
  // Wall: the floor (y = 0) becomes the wall at the support side; y maps to distance from the wall.
  const wall: Part = {
    ...part,
    min: [part.min[0], part.min[2], part.min[1]],
    max: [part.max[0], part.max[2], part.max[1]],
  };
  return rotate(wall, support);
}

/** The palette token for a block's main colour. */
export function colorFor(block: Block): string {
  const entry = registryEntry(block.type);
  const token = entry?.geometry.color ?? "stone";
  if (token === "by_color" || token === "by_material") return materialColor(block, block.type);
  if (block.type === "lamp") return block.states.lit === true ? "lamp.on" : "lamp.off";
  return token;
}

/** Builds the parts of one block at `pos`. Unknown builders fall back to a plain cube. */
export function buildBlock(block: Block, pos: Pos, at: NeighbourLookup): Part[] {
  const name = registryEntry(block.type)?.geometry.builder ?? "cube";
  const builder = BUILDERS[name] ?? BUILDERS.cube;
  return (builder as Builder)(block, pos, at);
}
