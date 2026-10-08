import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { parseText } from "@dustwright/core";
import type { Pos } from "@dustwright/core";
import type { RedstoneViewer as RV } from "@dustwright/viewer/browser";
import { EXAMPLES, exampleText, loadDesign, openExample, recordSelects, ROOT } from "./helpers.js";

const HOSTILE = "</script><img src=x onerror=alert(1)>";
const hostileDesign = JSON.stringify({
  format: "rsd/1",
  meta: { name: HOSTILE, slug: "hostile" },
  legend: { "#": "stone", L: "lever mount=floor", "*": "lamp" },
  layers: [["###"], ["L.*"]],
  annotations: [{ pos: [0, 1, 0], text: HOSTILE }],
});

test.describe("examples render", () => {
  for (const name of EXAMPLES) {
    test(`${name} at fixed camera angles`, async ({ page }) => {
      await openExample(page, name);
      const viewer = page.locator("redstone-viewer");
      for (const view of ["iso", "top"] as const) {
        await viewer.evaluate((v: RV, view) => {
          v.snap(view);
          v.renderNow();
        }, view);
        await expect(viewer).toHaveScreenshot(`${name}-${view}.png`);
      }
    });
  }
});

/** Clicks the top face of a block with the real mouse, after isolating its layer and looking from the top. */
async function clickBlock(page: import("@playwright/test").Page, pos: Pos): Promise<unknown> {
  const viewer = page.locator("redstone-viewer");
  const point = await viewer.evaluate((v: RV, pos) => {
    v.setLayer(pos[1]);
    v.setIsolate(true);
    v.snap("top");
    v.renderNow();
    return v.screenPositionOf(pos);
  }, pos);
  expect(point).not.toBeNull();
  const count = await page.evaluate(() => (window as unknown as { selects: unknown[] }).selects.length);
  await page.mouse.click(point!.x, point!.y);
  await page.waitForFunction((n) => (window as unknown as { selects: unknown[] }).selects.length > n, count);
  return page.evaluate(() => {
    const s = (window as unknown as { selects: unknown[] }).selects;
    return s[s.length - 1];
  });
}

test.describe("inspector shows the states written in the design", () => {
  for (const name of ["not-gate", "piston-door-2x2"]) {
    test(`${name}: every directional block`, async ({ page }) => {
      const { model } = parseText(exampleText(name));
      await openExample(page, name);
      await recordSelects(page);
      const directional = [...model!.blocks].filter(([, b]) =>
        ["lever", "torch", "piston", "sticky_piston", "repeater"].includes(b.type),
      );
      expect(directional.length).toBeGreaterThan(1);
      for (const [key, block] of directional) {
        const pos = key.split(",").map(Number) as unknown as Pos;
        const detail = (await clickBlock(page, pos)) as { pos: number[]; type: string; states: unknown };
        expect(detail.pos).toEqual([...pos]);
        expect(detail.type).toBe(block.type);
        expect(detail.states).toEqual(block.states);
      }
      // The inspector panel shows the same values as text.
      const inspector = page.locator("redstone-viewer").locator(".inspector");
      await expect(inspector).toContainText("Bedrock");
    });
  }
});

test("layer slider at each Y shows exactly the blocks of layers 0..Y", async ({ page }) => {
  for (const name of ["piston-door-2x2", "t-flip-flop"]) {
    const { model } = parseText(exampleText(name));
    await openExample(page, name);
    const slider = page.locator("redstone-viewer").locator('input[aria-label="Highest visible layer"]');
    for (let y = 0; y < model!.size[1]; y++) {
      await slider.fill(String(y));
      const expected = [...model!.blocks.keys()].filter((k) => Number(k.split(",")[1]) <= y).length;
      const shown = await page.locator("redstone-viewer").evaluate((v: RV) => v.visibleBlockCount());
      expect(shown, `${name} layer ${y}`).toBe(expected);
    }
  }
});

test("hostile name and annotation render as literal text", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await loadDesign(page, hostileDesign);
  const viewer = page.locator("redstone-viewer");
  await expect(viewer.locator(".title")).toHaveText(HOSTILE);
  await expect(viewer.locator(".inspector h2")).toHaveText(HOSTILE);
  await viewer.locator(".pin").first().click();
  await expect(viewer.locator(".note")).toHaveText(HOSTILE);
  const images = await page.evaluate(() => {
    const v = document.querySelector("redstone-viewer")!;
    return document.querySelectorAll("img").length + v.shadowRoot!.querySelectorAll("img").length;
  });
  expect(images).toBe(0);
  expect(dialogs).toEqual([]);
});

test("the playground makes no requests beyond its own origin", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4319/")) foreign.push(r.url());
  });
  for (const name of EXAMPLES) await openExample(page, name);
  expect(foreign).toEqual([]);
});

test("a java design renders and the playground reports E015", async ({ page }) => {
  const java = JSON.parse(exampleText("not-gate")) as { meta: Record<string, unknown> };
  java.meta.edition = "java";
  await loadDesign(page, JSON.stringify(java));
  await expect(page.locator("#diagnostics")).toContainText("E015");
  expect(await page.locator("redstone-viewer").evaluate((v: RV) => v.visibleBlockCount())).toBeGreaterThan(0);
});

test("a design with stage 1 errors shows its diagnostics instead of the canvas", async ({ page }) => {
  await loadDesign(
    page,
    JSON.stringify({ format: "rsd/1", meta: { name: "bad" }, legend: { "#": "stone" }, layers: [["#?"]] }),
  );
  const viewer = page.locator("redstone-viewer");
  await expect(viewer.locator(".errors")).toContainText("E003");
  await expect(viewer.locator(".stage")).toBeHidden();
});

test("keyboard: [ and ] change the layer; the stage is focusable", async ({ page }) => {
  await openExample(page, "t-flip-flop");
  const viewer = page.locator("redstone-viewer");
  await viewer.locator(".stage").focus();
  await page.keyboard.press("[");
  await expect(viewer.locator('input[aria-label="Highest visible layer"]')).toHaveValue("2");
  await page.keyboard.press("]");
  await expect(viewer.locator('input[aria-label="Highest visible layer"]')).toHaveValue("3");
});

/** Stage height as a share of the element, and how many blocks project outside the canvas, per view. */
async function measure(page: import("@playwright/test").Page) {
  return page.locator("redstone-viewer").evaluate((v: RV) => {
    const stage = v.shadowRoot!.querySelector(".stage")!.getBoundingClientRect();
    const host = v.getBoundingClientRect();
    const canvas = v.shadowRoot!.querySelector("canvas")!.getBoundingClientRect();
    const outside: Record<string, number> = {};
    for (const view of ["iso", "top"] as const) {
      v.snap(view);
      outside[view] = [...v.model!.blocks.keys()]
        .map((k) => v.screenPositionOf(k.split(",").map(Number) as unknown as [number, number, number]))
        .filter(
          (p) => !p || p.x < canvas.left || p.x > canvas.right || p.y < canvas.top || p.y > canvas.bottom,
        ).length;
    }
    return { share: stage.height / host.height, outside };
  });
}

test("works at 320 px wide: bottom-sheet inspector, a usable stage, the whole design in view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const name of ["not-gate", "repeater-line", "piston-door-2x2"]) {
    await openExample(page, name);
    const viewer = page.locator("redstone-viewer");
    await expect(viewer.locator(".root")).toHaveClass(/narrow/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const m = await measure(page);
    expect(m.share, `${name} stage share`).toBeGreaterThanOrEqual(0.35);
    expect(m.outside, name).toEqual({ iso: 0, top: 0 });
  }
});

test("frames every example fully at desktop size", async ({ page }) => {
  for (const name of EXAMPLES) {
    await openExample(page, name);
    expect((await measure(page)).outside, name).toEqual({ iso: 0, top: 0 });
  }
});

test("instructions mode steps through the design and emits step events", async ({ page }) => {
  const { model } = parseText(exampleText("t-flip-flop"));
  await openExample(page, "t-flip-flop");
  const viewer = page.locator("redstone-viewer");
  await page.evaluate(() => {
    const w = window as unknown as { steps: { index: number; blocks: number }[] };
    w.steps = [];
    document
      .querySelector("redstone-viewer")!
      .addEventListener("step", (e) => w.steps.push((e as CustomEvent).detail));
  });
  await viewer.locator('button[aria-label="Instructions mode"]').click();
  await viewer.locator(".stage").focus();
  for (let i = 1; i < model!.steps.length; i++) await page.keyboard.press("n");
  const steps = await page.evaluate(
    () => (window as unknown as { steps: { index: number; blocks: number }[] }).steps,
  );
  expect(steps.map((s) => s.index)).toEqual(model!.steps.map((_, i) => i));
  expect(steps.map((s) => s.blocks)).toEqual(model!.steps.map((s) => s.positions.length));
  // Earlier steps stay drawn (dimmed): the last step shows every block.
  expect(await viewer.evaluate((v: RV) => v.visibleBlockCount())).toBe(model!.blocks.size);
  await expect(viewer.locator(".toolbar")).toContainText(
    `Step ${model!.steps.length} of ${model!.steps.length}`,
  );
});

test("keyboard alone can select and move between blocks", async ({ page }) => {
  await openExample(page, "not-gate");
  await recordSelects(page);
  const viewer = page.locator("redstone-viewer");
  await viewer.locator(".stage").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+PageUp");
  await page.keyboard.press("Shift+ArrowRight");
  const picked = await page.evaluate(() =>
    (window as unknown as { selects: { pos: number[] }[] }).selects.map((s) => s.pos.join(",")),
  );
  expect(picked).toEqual(["0,0,0", "0,1,0", "1,1,0"]);
  await expect(viewer.locator(".inspector h2").first()).toHaveText("dust");
});

test("reduced motion jumps straight to the explode position", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openExample(page, "t-flip-flop");
  const viewer = page.locator("redstone-viewer");
  const top = () => viewer.evaluate((v: RV) => v.screenPositionOf([4, 2, 2])!.y);
  const before = await top();
  await viewer.locator('input[aria-label="Explode layers"]').fill("2");
  const after = await top();
  expect(after).not.toBe(before);
  await page.waitForTimeout(300);
  expect(await top()).toBe(after);
});

test("inline JSON loads when the viewer script runs in <head>", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "rsd-embed-"));
  const page1 = join(dir, "head.html");
  const script = join(ROOT, "packages/viewer/dist/bundle/redstone-viewer.js");
  const html = `<!doctype html><html><head><meta charset="utf-8"><script src="file://${script}"></script></head><body>
<redstone-viewer height="400"><script type="application/json">${exampleText("not-gate")}</script></redstone-viewer></body></html>`;
  writeFileSync(page1, html);
  await page.goto(`file://${page1}`);
  await page.waitForFunction(() => (document.querySelector("redstone-viewer")?.visibleBlockCount() ?? 0) > 0);
});

test.describe("single-file bundle", () => {
  const dir = mkdtempSync(join(tmpdir(), "rsd-bundle-"));
  const bundle = (example: string | null, name: string, text?: string) => {
    const out = join(dir, `${name}.html`);
    let input = example ? join(ROOT, "examples", `${example}.rsd.json`) : join(dir, `${name}.rsd.json`);
    if (text !== undefined) {
      input = join(dir, `${name}.rsd.json`);
      execFileSync("node", [
        "-e",
        `require("fs").writeFileSync(${JSON.stringify(input)}, ${JSON.stringify(text)})`,
      ]);
    }
    execFileSync("node", [join(ROOT, "packages/cli/dist/bin.js"), "bundle", input, "-o", out]);
    return out;
  };

  test("works at 320 x 480 with a usable stage", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.goto(`file://${bundle("piston-door-2x2", "door-narrow")}`);
    await page.waitForFunction(
      () => (document.querySelector("redstone-viewer")?.visibleBlockCount() ?? 0) > 0,
    );
    const m = await measure(page);
    expect(m.share).toBeGreaterThanOrEqual(0.35);
    expect(m.outside).toEqual({ iso: 0, top: 0 });
  });

  test("opens with networking disabled and renders the NOT gate", async ({ page, context }) => {
    const file = bundle("not-gate", "not-gate");
    const requests: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("file:")) requests.push(r.url());
    });
    await context.setOffline(true);
    await page.goto(`file://${file}`);
    await page.waitForFunction(
      () => (document.querySelector("redstone-viewer")?.visibleBlockCount() ?? 0) > 0,
    );
    const blocks = await page.locator("redstone-viewer").evaluate((v: RV) => v.model?.blocks.size);
    expect(blocks).toBe(parseText(exampleText("not-gate")).model!.blocks.size);
    expect(requests).toEqual([]);
  });

  test("renders the hostile-name design without executing anything", async ({ page, context }) => {
    const file = bundle(null, "hostile", hostileDesign);
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await context.setOffline(true);
    await page.goto(`file://${file}`);
    const viewer = page.locator("redstone-viewer");
    await expect(viewer.locator(".title")).toHaveText(HOSTILE);
    expect(await page.evaluate(() => document.scripts.length)).toBe(1);
    expect(await page.evaluate(() => document.querySelectorAll("img").length)).toBe(0);
    expect(dialogs).toEqual([]);
  });
});
