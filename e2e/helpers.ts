import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const EXAMPLES = [
  "not-gate",
  "observer-clock",
  "piston-door-2x2",
  "repeater-line",
  "t-flip-flop",
] as const;
export const exampleText = (name: string) => readFileSync(`${ROOT}/examples/${name}.rsd.json`, "utf8");

/** Opens the playground on an example and waits until the viewer has a model and has drawn. */
export async function openExample(page: Page, name: string): Promise<void> {
  await page.goto(`/play/?example=${name}`);
  await page.waitForFunction(() => {
    const v = document.querySelector("redstone-viewer");
    return !!v?.model && v.visibleBlockCount() > 0;
  });
}

/** Loads design text into the playground editor and waits for it to validate. */
export async function loadDesign(page: Page, text: string): Promise<void> {
  await page.goto("/play/?example=not-gate");
  await page.waitForFunction(() => !!document.body.dataset.validated);
  const before = await page.evaluate(() => document.body.dataset.validated);
  await page.locator("#editor").fill(text);
  await page.waitForFunction((b) => document.body.dataset.validated !== b, before);
}

/** Records the detail of every `select` event the viewer emits. */
export async function recordSelects(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { selects: unknown[] };
    w.selects = [];
    document
      .querySelector("redstone-viewer")!
      .addEventListener("select", (e) => w.selects.push((e as CustomEvent).detail));
  });
}
