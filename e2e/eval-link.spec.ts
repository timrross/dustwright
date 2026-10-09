import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { RedstoneViewer as RV } from "@dustwright/viewer/browser";
import { ROOT } from "./helpers.js";

// M8: the share link an agent with no tools wrote from AUTHORING.md alone (scripts/eval/link.mjs) opens a working
// NOT gate. The link names dustwright.dev; the test opens the same path on the local build.
const logs = readdirSync(join(ROOT, "docs/eval"))
  .filter((f) => f.endsWith("-link.json"))
  .sort();
const latest = logs.at(-1);

test.skip(!latest, "no link logged yet (node scripts/eval/link.mjs)");

test("the no-tools agent's /view#json= link opens a NOT gate that passes its tests", async ({ page }) => {
  const { link } = JSON.parse(readFileSync(join(ROOT, "docs/eval", latest as string), "utf8")) as {
    link: string;
  };
  const url = new URL(link);
  expect(url.hostname).toBe("dustwright.dev");
  await page.goto(`${url.pathname}${url.hash}`);
  await page.waitForFunction(() => !!document.querySelector("redstone-viewer")?.model);
  const viewer = page.locator("redstone-viewer");
  expect(await viewer.evaluate((v: RV) => v.model?.meta.name)).toBe("NOT gate");
  expect(await viewer.evaluate((v: RV) => v.visibleBlockCount())).toBeGreaterThan(0);
  expect(await viewer.evaluate((v: RV) => v.diagnostics.filter((d) => d.severity === "error"))).toEqual([]);
  // Its own tests pass in the simulator: the power view shows the lamp lit with the lever off, and out with it on.
  expect(await viewer.evaluate((v: RV) => v.setPowerView(0))).toBe(true);
  const lamp = await viewer.evaluate((v: RV) => {
    const out = v.model!.ports.outputs[0]!.pos;
    const lit0 = v.shownBlock(out)?.states.lit;
    v.setPowerView(1);
    return [lit0, v.shownBlock(out)?.states.lit];
  });
  expect(lamp).toEqual([true, false]);
});
