/** Viewer themes: CSS colours for the chrome and hex colours for the scene. All original; no game assets. */
export type ThemeName = "light" | "dark";

const DYES: Record<string, number> = {
  white: 0xe9ecec,
  orange: 0xf07613,
  magenta: 0xbd44b3,
  light_blue: 0x3aafd9,
  yellow: 0xf8c627,
  lime: 0x70b919,
  pink: 0xed8dac,
  gray: 0x3e4447,
  light_gray: 0x8e8e86,
  cyan: 0x158991,
  purple: 0x792aac,
  blue: 0x35399d,
  brown: 0x724728,
  green: 0x546d1b,
  red: 0xa12722,
  black: 0x141519,
};

/** Base scene colours by palette token (registry `geometry.color` and builder tokens). */
const BASE: Record<string, number> = {
  stone: 0x8d9299,
  glass: 0xbfe3ee,
  target: 0xe4dccb,
  slime: 0x76be6d,
  honey: 0xe9a93f,
  note_block: 0x7a5236,
  redstone_block: 0xb42a1f,
  "lamp.off": 0x7a5434,
  "lamp.on": 0xffd36e,
  "dust.off": 0x7a1a14,
  "dust.on": 0xff3b2f,
  "torch.off": 0x5a1d18,
  "torch.on": 0xff5a3c,
  wood: 0xa57c4f,
  "component.base": 0xb9bcc0,
  notch: 0x30343a,
  "lever.handle": 0x6b4f35,
  daylight: 0x3d6f9e,
  "daylight.inverted": 0x9e5a3d,
  "piston.body": 0x9b9488,
  "piston.head": 0xc9a66b,
  "piston.sticky": 0x6fb15a,
  observer: 0x5f6369,
  "observer.face": 0x2e3237,
  "observer.back": 0x8a2b23,
  iron: 0x9ca3a9,
  dropper: 0x7b7f86,
  "dropper.face": 0x2f3338,
  dispenser: 0x7b7f86,
  "dispenser.face": 0x4b3a2a,
  arrow: 0xffb000,
  "button.stone": 0x9ea3a9,
  "button.wood": 0xb48a58,
  "pressure_plate.stone": 0x9ea3a9,
  "pressure_plate.wood": 0xb48a58,
  "door.wood": 0x9c6f3e,
  "door.iron": 0xc3c8cc,
  "trapdoor.wood": 0x9c6f3e,
  "trapdoor.iron": 0xc3c8cc,
};
// Dust by power level, from just above dust.off (level 1) to dust.on (level 15).
for (let level = 1; level <= 15; level++) {
  const mix = (a: number, b: number, shift: number) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + ((cb - ca) * (level + 3)) / 18) << shift;
  };
  const off = BASE["dust.off"] as number;
  const on = BASE["dust.on"] as number;
  BASE[`dust.p${level}`] = mix(off, on, 16) | mix(off, on, 8) | mix(off, on, 0);
}
for (const [dye, hex] of Object.entries(DYES)) {
  BASE[`wool.${dye}`] = hex;
  BASE[`concrete.${dye}`] = hex;
}

/** The scene colour for a palette token; unknown tokens are magenta so a gap is obvious. */
export function sceneColor(token: string): number {
  return BASE[token] ?? 0xff00ff;
}

/** True when a token's base colour is defined (tests use it to catch missing palette entries). */
export function hasColor(token: string): boolean {
  return token in BASE;
}

/** Chrome colours per theme. Text and outlines meet 4.5:1 against the background (tested). */
export const THEMES: Record<
  ThemeName,
  { bg: number; css: Record<string, string>; scene: { select: string; hover: string; edges: string } }
> = {
  light: {
    bg: 0xf3f4f6,
    css: {
      "--rv-bg": "#f3f4f6",
      "--rv-panel": "#ffffff",
      "--rv-text": "#1f2328",
      "--rv-muted": "#4b5563",
      "--rv-border": "#5f6672",
      "--rv-accent": "#0b5cad",
      "--rv-error": "#b42318",
      "--rv-warning": "#8a5300",
      "--rv-input": "#1a7f37",
    },
    // Selection and hover outlines are drawn against the background; block edges against the block faces.
    scene: { select: "#0b5cad", hover: "#1f2328", edges: "#1f2328" },
  },
  dark: {
    bg: 0x16181c,
    css: {
      "--rv-bg": "#16181c",
      "--rv-panel": "#22252b",
      "--rv-text": "#e8eaed",
      "--rv-muted": "#b6bcc6",
      "--rv-border": "#8b93a1",
      "--rv-accent": "#7cb7ff",
      "--rv-error": "#ff8a80",
      "--rv-warning": "#ffcc66",
      "--rv-input": "#56d364",
    },
    scene: { select: "#ffb000", hover: "#e8eaed", edges: "#000000" },
  },
};
