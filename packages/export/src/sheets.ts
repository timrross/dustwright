import { formatSpec, keyPos } from "@dustwright/core";
import type { Block, Model, StateValue } from "@dustwright/core";

/**
 * Layer sheets (M7): one printable SVG per layer, in the style of the Minecraft Wiki schematics. Each page is A4
 * portrait in millimetres: a title, the layer grid (north up, x to the east, z to the south) with a number in every
 * block cell and an arrow on directional blocks, and a legend from number to block spec. Design text (the name, the
 * specs) only ever appears as escaped SVG text, and output is byte-identical for identical input.
 */

/** One sheet: its file name (from the validated slug only) and the SVG text. */
export interface LayerSheet {
  path: string;
  svg: string;
}

const PAGE = { w: 210, h: 297, margin: 14 };

/** Escapes text for SVG character data and attribute values. */
export function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

const DYES: Record<string, string> = {
  white: "#e9ecec",
  orange: "#f07613",
  magenta: "#bd44b3",
  light_blue: "#3aafd9",
  yellow: "#f8c627",
  lime: "#70b919",
  pink: "#ed8dac",
  gray: "#3e4447",
  light_gray: "#8e8e86",
  cyan: "#158991",
  purple: "#792aac",
  blue: "#35399d",
  brown: "#724728",
  green: "#546d1b",
  red: "#a12722",
  black: "#141519",
};

/** Original flat colours per block type, close to the viewer's so a sheet and the 3D view read alike. */
const COLOURS: Record<string, string> = {
  stone: "#8d9299",
  glass: "#d6eef5",
  target: "#e4dccb",
  slime: "#76be6d",
  honey_block: "#e9a93f",
  note_block: "#7a5236",
  slab: "#a7abb1",
  stairs: "#a7abb1",
  dust: "#d8322a",
  repeater: "#c9c3b8",
  comparator: "#c9c3b8",
  torch: "#ff7a3c",
  lever: "#9a7a52",
  button: "#9ea3a9",
  pressure_plate: "#9ea3a9",
  redstone_block: "#b3221b",
  daylight_sensor: "#c7b28c",
  lamp: "#b07a3e",
  piston: "#b5a887",
  sticky_piston: "#8fbf72",
  observer: "#6b6e73",
  dispenser: "#6b6e73",
  dropper: "#6b6e73",
  hopper: "#4c4f55",
  door: "#9c6f3e",
  trapdoor: "#9c6f3e",
};

function colourOf(b: Block): string {
  const dye = typeof b.states.color === "string" ? DYES[b.states.color] : undefined;
  return dye ?? COLOURS[b.type] ?? "#cccccc";
}

/** Black or white, whichever reads better on a fill. */
function inkOn(fill: string): string {
  const n = parseInt(fill.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 140 ? "#111111" : "#ffffff";
}

const num = (n: number) => String(Math.round(n * 100) / 100);
const str = (v: StateValue | undefined) => (typeof v === "string" ? v : undefined);

/** The direction a block points on the sheet: its facing, else the side its mount names (floor and ceiling: none). */
function pointing(b: Block): string | undefined {
  const facing = str(b.states.facing);
  if (facing) return facing;
  const mount = str(b.states.mount);
  return mount && mount !== "floor" && mount !== "ceiling" ? mount : undefined;
}

/** A small arrow in a cell pointing north, south, east or west, or a U/D mark for up and down. */
function arrow(x: number, y: number, s: number, dir: string, ink: string): string {
  if (dir === "up" || dir === "down") {
    return `<text x="${num(x + s * 0.82)}" y="${num(y + s * 0.3)}" font-size="${num(s * 0.28)}" text-anchor="middle" fill="${ink}">${dir === "up" ? "U" : "D"}</text>`;
  }
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.42;
  const w = s * 0.12;
  const tips: Record<string, [number, number, number, number, number, number]> = {
    north: [cx, cy - r, cx - w, cy - r + w * 1.6, cx + w, cy - r + w * 1.6],
    south: [cx, cy + r, cx - w, cy + r - w * 1.6, cx + w, cy + r - w * 1.6],
    east: [cx + r, cy, cx + r - w * 1.6, cy - w, cx + r - w * 1.6, cy + w],
    west: [cx - r, cy, cx - r + w * 1.6, cy - w, cx - r + w * 1.6, cy + w],
  };
  const t = tips[dir];
  return t ? `<polygon points="${t.map(num).join(",")}" fill="${ink}"/>` : "";
}

/** Renders every layer of a design as an A4 SVG sheet, bottom layer first. */
export function renderLayerSheets(model: Model): LayerSheet[] {
  const [sx, sy, sz] = model.size;
  const slug = model.meta.slug;
  const sheets: LayerSheet[] = [];
  for (let y = 0; y < sy; y++) {
    const cells: { x: number; z: number; block: Block }[] = [];
    for (const [key, block] of model.blocks) {
      const p = keyPos(key);
      if (p[1] === y) cells.push({ x: p[0], z: p[2], block });
    }
    cells.sort((a, b) => a.z - b.z || a.x - b.x);
    // Legend numbers in reading order of first appearance, so the same layer always numbers the same way.
    const specs: string[] = [];
    const numberOf = new Map<string, number>();
    for (const c of cells) {
      const spec = formatSpec(c.block);
      if (!numberOf.has(spec)) {
        specs.push(spec);
        numberOf.set(spec, specs.length);
      }
    }
    const legendRows = Math.ceil(specs.length / 2);
    const top = PAGE.margin + 18;
    const legendH = Math.min(110, 8 + legendRows * 5);
    const availW = PAGE.w - 2 * PAGE.margin - 6;
    const availH = PAGE.h - top - PAGE.margin - legendH - 10;
    const cell = Math.max(2, Math.min(9, availW / sx, availH / sz));
    const gx = PAGE.margin + 6;
    const gy = top + 6;
    const out: string[] = [];
    out.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}" font-family="Helvetica, Arial, sans-serif">`,
      `<title>${escapeXml(`${model.meta.name}: layer ${y}`)}</title>`,
      `<rect width="${PAGE.w}" height="${PAGE.h}" fill="#ffffff"/>`,
      `<text x="${PAGE.margin}" y="${PAGE.margin + 5}" font-size="6" font-weight="bold" fill="#111111">${escapeXml(model.meta.name)}</text>`,
      `<text x="${PAGE.margin}" y="${PAGE.margin + 11}" font-size="3.6" fill="#333333">Layer ${y} of ${sy - 1} (y = ${y}, layer 0 is the bottom). ${sx} × ${sz} blocks; north is up, x runs east, z runs south.</text>`,
    );
    // North arrow, top right.
    const nx = PAGE.w - PAGE.margin - 4;
    out.push(
      `<polygon points="${num(nx)},${num(PAGE.margin)} ${num(nx - 2.5)},${num(PAGE.margin + 6)} ${num(nx + 2.5)},${num(PAGE.margin + 6)}" fill="#111111"/>`,
      `<text x="${num(nx)}" y="${num(PAGE.margin + 10.5)}" font-size="3.6" text-anchor="middle" fill="#111111">N</text>`,
    );
    // Grid and axis labels (every 5 cells, and the last).
    out.push(
      `<rect x="${num(gx)}" y="${num(gy)}" width="${num(cell * sx)}" height="${num(cell * sz)}" fill="#f7f7f5" stroke="#999999" stroke-width="0.2"/>`,
    );
    const labelSize = Math.min(3, Math.max(1.6, cell * 0.55));
    for (let x = 0; x < sx; x++) {
      if (x % 5 === 0 || x === sx - 1) {
        out.push(
          `<text x="${num(gx + (x + 0.5) * cell)}" y="${num(gy - 1.2)}" font-size="${num(labelSize)}" text-anchor="middle" fill="#555555">${x}</text>`,
        );
      }
    }
    for (let z = 0; z < sz; z++) {
      if (z % 5 === 0 || z === sz - 1) {
        out.push(
          `<text x="${num(gx - 1.2)}" y="${num(gy + (z + 0.5) * cell + labelSize * 0.35)}" font-size="${num(labelSize)}" text-anchor="end" fill="#555555">${z}</text>`,
        );
      }
    }
    for (let i = 1; i < sx; i++) {
      out.push(
        `<line x1="${num(gx + i * cell)}" y1="${num(gy)}" x2="${num(gx + i * cell)}" y2="${num(gy + sz * cell)}" stroke="#dddddd" stroke-width="0.1"/>`,
      );
    }
    for (let i = 1; i < sz; i++) {
      out.push(
        `<line x1="${num(gx)}" y1="${num(gy + i * cell)}" x2="${num(gx + sx * cell)}" y2="${num(gy + i * cell)}" stroke="#dddddd" stroke-width="0.1"/>`,
      );
    }
    for (const c of cells) {
      const x = gx + c.x * cell;
      const yy = gy + c.z * cell;
      const fill = colourOf(c.block);
      const ink = inkOn(fill);
      const n = numberOf.get(formatSpec(c.block)) as number;
      out.push(
        `<rect x="${num(x)}" y="${num(yy)}" width="${num(cell)}" height="${num(cell)}" fill="${fill}" stroke="#555555" stroke-width="0.15"/>`,
        `<text x="${num(x + cell / 2)}" y="${num(yy + cell * 0.62)}" font-size="${num(cell * (n > 9 ? 0.36 : 0.45))}" text-anchor="middle" fill="${ink}">${n}</text>`,
      );
      const dir = pointing(c.block);
      if (dir) out.push(arrow(x, yy, cell, dir, ink));
    }
    if (cells.length === 0) {
      out.push(
        `<text x="${num(gx + 2)}" y="${num(gy + 6)}" font-size="4" fill="#555555">This layer is empty (air only).</text>`,
      );
    }
    // Legend, two columns; whatever does not fit continues on extra sheets for this layer.
    const sampleOf = (spec: string) => cells.find((c) => formatSpec(c.block) === spec)?.block as Block;
    const colW = (PAGE.w - 2 * PAGE.margin) / 2;
    const legend = (from: number, startY: number, page: string[]): number => {
      const rows = Math.max(0, Math.floor((PAGE.h - PAGE.margin - 10 - startY) / 5));
      const end = Math.min(specs.length, from + rows * 2);
      for (let i = from; i < end; i++) {
        const k = i - from;
        const x = PAGE.margin + (k % 2) * colW;
        const yy = startY + Math.floor(k / 2) * 5;
        const fill = colourOf(sampleOf(specs[i] as string));
        page.push(
          `<rect x="${num(x)}" y="${num(yy)}" width="4" height="4" fill="${fill}" stroke="#555555" stroke-width="0.15"/>`,
          `<text x="${num(x + 2)}" y="${num(yy + 2.9)}" font-size="${i + 1 > 9 ? "1.8" : "2.4"}" text-anchor="middle" fill="${inkOn(fill)}">${i + 1}</text>`,
          `<text x="${num(x + 5.5)}" y="${num(yy + 3)}" font-size="3" fill="#111111">${escapeXml(specs[i] as string)}</text>`,
        );
      }
      return end;
    };
    const footer = (page: string[], more: boolean) =>
      page.push(
        `<text x="${PAGE.margin}" y="${PAGE.h - 6}" font-size="2.6" fill="#777777">${more ? "The legend continues on the next sheet. " : ""}Dustwright layer sheet. Arrows: facing, or the side a torch, lever or button hangs on; U and D: up and down.</text>`,
        "</svg>",
        "",
      );
    const ly = gy + sz * cell + 10;
    out.push(
      `<text x="${PAGE.margin}" y="${num(ly)}" font-size="4" font-weight="bold" fill="#111111">Legend</text>`,
    );
    let next = legend(0, ly + 3, out);
    footer(out, next < specs.length);
    const base = `${slug}-layer-${String(y).padStart(3, "0")}`;
    sheets.push({ path: `${base}.svg`, svg: out.join("\n") });
    for (let part = 2; next < specs.length; part++) {
      const page: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}" font-family="Helvetica, Arial, sans-serif">`,
        `<title>${escapeXml(`${model.meta.name}: layer ${y}, legend part ${part}`)}</title>`,
        `<rect width="${PAGE.w}" height="${PAGE.h}" fill="#ffffff"/>`,
        `<text x="${PAGE.margin}" y="${PAGE.margin + 5}" font-size="6" font-weight="bold" fill="#111111">${escapeXml(model.meta.name)}</text>`,
        `<text x="${PAGE.margin}" y="${PAGE.margin + 11}" font-size="3.6" fill="#333333">Layer ${y}: legend, continued (part ${part}).</text>`,
      ];
      next = legend(next, PAGE.margin + 18, page);
      footer(page, next < specs.length);
      sheets.push({ path: `${base}-legend-${part}.svg`, svg: page.join("\n") });
    }
  }
  return sheets;
}
