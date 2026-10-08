import { describe, expect, it } from "vitest";
import { REGISTRY } from "@dustwright/core";
import type { Block, RegistryEntry, StateValue } from "@dustwright/core";
import { BUILDERS, buildBlock, GEOMETRY_BUILDERS, hasColor, THEMES } from "../src/index.js";

function allBlocks(entry: RegistryEntry): Block[] {
  let combos: Record<string, StateValue>[] = [{}];
  for (const [key, def] of Object.entries(entry.states))
    combos = combos.flatMap((c) => def.values.map((v) => ({ ...c, [key]: v })));
  return combos.map((states) => ({ type: entry.type, states }));
}
const none = () => undefined;

describe("geometry builders", () => {
  it("GEOMETRY_BUILDERS names exactly the implemented builders", () => {
    expect([...GEOMETRY_BUILDERS].sort()).toEqual(Object.keys(BUILDERS).sort());
  });

  it.each(REGISTRY.map((e) => [e.type, e] as const))(
    "%s builds sane parts for every state combination",
    (_t, entry) => {
      const height = 1 + Math.max(0, ...(entry.occupies ?? []).map((o) => o[1]));
      for (const block of allBlocks(entry)) {
        const parts = buildBlock(block, [5, 5, 5], none);
        expect(parts.some((p) => p.role === "body")).toBe(true);
        for (const p of parts) {
          expect(hasColor(p.color), `${block.type} colour ${p.color}`).toBe(true);
          for (let a = 0; a < 3; a++) expect(p.max[a]).toBeGreaterThanOrEqual(p.min[a] as number);
          if (p.role === "arrow") continue;
          for (let a = 0; a < 3; a++) {
            expect(p.min[a]).toBeGreaterThanOrEqual(-0.02);
            expect(p.max[a]).toBeLessThanOrEqual(a === 1 ? height + 0.02 : 1.02);
          }
        }
        const directional = Object.values(entry.states).some((d) => d.directional);
        if (directional)
          expect(
            parts.some((p) => p.role === "arrow"),
            `${block.type} arrow`,
          ).toBe(true);
      }
    },
  );
});

/** Direction from the cell centre to the arrow's tip (its smallest part). */
function tipDirection(block: Block): [number, number, number] {
  const arrows = buildBlock(block, [0, 0, 0], none).filter((p) => p.role === "arrow");
  const area = (p: (typeof arrows)[number]) =>
    (p.max[0] - p.min[0]) * (p.max[2] - p.min[2]) + (p.max[1] - p.min[1]) * 0.001;
  const tip = arrows.reduce((a, b) => (area(b) < area(a) ? b : a));
  const centre = [0, 1, 2].map((a) => ((tip.min[a] as number) + (tip.max[a] as number)) / 2);
  return [
    Math.sign(Math.round(((centre[0] as number) - 0.5) * 10)),
    0,
    Math.sign(Math.round(((centre[2] as number) - 0.5) * 10)),
  ];
}

describe("direction overlay", () => {
  const H: Record<string, [number, number, number]> = {
    north: [0, 0, -1],
    south: [0, 0, 1],
    east: [1, 0, 0],
    west: [-1, 0, 0],
  };
  it.each(Object.entries(H))(
    "facing=%s arrows point that way (repeater, comparator, piston, observer, stairs)",
    (facing, dir) => {
      for (const type of ["repeater", "comparator", "piston", "observer", "stairs", "dropper"]) {
        expect(tipDirection({ type, states: { facing } }), `${type} ${facing}`).toEqual(dir);
      }
    },
  );
  it.each(Object.entries(H))("mount=%s arrows point at the support (torch, lever, button)", (mount, dir) => {
    for (const type of ["torch", "lever", "button"]) {
      expect(tipDirection({ type, states: { mount } }), `${type} ${mount}`).toEqual(dir);
    }
  });
});

describe("vertical arrows", () => {
  it.each([
    ["up", 1],
    ["down", -1],
  ] as const)("facing=%s arrows point that way on the south face", (facing, sign) => {
    for (const type of ["piston", "observer", "dropper", "dispenser"]) {
      const arrows = buildBlock({ type, states: { facing } }, [0, 0, 0], none).filter(
        (p) => p.role === "arrow",
      );
      const width = (p: (typeof arrows)[number]) => p.max[0] - p.min[0];
      const tip = arrows.reduce((a, b) => (width(b) < width(a) ? b : a));
      const shaftY = arrows.reduce((a, b) => (b.max[1] - b.min[1] > a.max[1] - a.min[1] ? b : a));
      const centre = (p: (typeof arrows)[number]) => (p.min[1] + p.max[1]) / 2;
      expect(Math.sign(centre(tip) - centre(shaftY)), `${type} ${facing}`).toBe(sign);
      for (const p of arrows) expect(p.min[2]).toBeGreaterThan(1);
    }
  });
});

describe("dust connections", () => {
  it("is a cross when alone and a line toward its neighbours", () => {
    const dust: Block = { type: "dust", states: { power: 0 } };
    const arms = (parts: ReturnType<typeof buildBlock>) => parts.length - 1;
    expect(arms(buildBlock(dust, [1, 0, 1], none))).toBe(4);
    const line = buildBlock(dust, [1, 0, 1], (p) => (p[0] === 0 && p[2] === 1 ? dust : undefined));
    expect(arms(line)).toBe(2);
  });
});

/** WCAG relative luminance contrast between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const c = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("themes", () => {
  it.each(Object.entries(THEMES))(
    "%s: text and outline colours pass 4.5:1 against both backgrounds",
    (_name, theme) => {
      const css = theme.css;
      for (const bg of [css["--rv-bg"], css["--rv-panel"]] as string[]) {
        for (const fg of [
          "--rv-text",
          "--rv-muted",
          "--rv-accent",
          "--rv-error",
          "--rv-warning",
          "--rv-border",
          "--rv-input",
        ]) {
          expect(contrast(css[fg] as string, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );
});

describe("scene outlines", () => {
  it.each(Object.entries(THEMES))(
    "%s: selection and hover outlines pass 4.5:1 against the scene background",
    (_name, theme) => {
      const bg = `#${theme.bg.toString(16).padStart(6, "0")}`;
      expect(contrast(theme.scene.select, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.scene.hover, bg)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
