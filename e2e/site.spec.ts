import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { LIMITS } from "@dustwright/core";
import type { RedstoneViewer as RV } from "@dustwright/viewer/browser";
import { otherPort } from "../playwright.config.js";
import { exampleText, ROOT } from "./helpers.js";

const notGate = exampleText("not-gate");
const OTHER = `http://127.0.0.1:${otherPort}`;

/** Waits until a viewer on the page has the NOT gate drawn. */
async function showsNotGate(page: Page, selector = "redstone-viewer") {
  await page.waitForFunction((sel) => {
    const v = document.querySelector(sel) as RV | null;
    return !!v?.model && v.visibleBlockCount() > 0;
  }, selector);
  expect(await page.locator(selector).evaluate((v: RV) => v.model?.meta.name)).toBe("NOT gate");
}

/** Records Content Security Policy violations reported on the page. */
function cspViolations(page: Page): string[] {
  const out: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) out.push(m.text());
  });
  return out;
}

test.describe("viewer in other pages", () => {
  test("works in a plain HTML page, by src and from inline JSON", async ({ page }) => {
    const violations = cspViolations(page);
    await page.goto("/plain-example.html");
    await showsNotGate(page, "#by-src");
    await showsNotGate(page, "#inline");
    expect(violations).toEqual([]);
  });

  test("viewer.html?src= in an iframe on another origin: events arrive, and setStep from that origin works", async ({
    page,
  }) => {
    const violations = cspViolations(page);
    // The host page is on the other origin; it frames the viewer on this one.
    await page.goto(
      `${OTHER}/embed-example.html?viewer=${encodeURIComponent("http://127.0.0.1:4319/viewer.html")}`,
    );
    await expect(page.locator("#log")).toContainText("ready:");
    await expect(page.locator("#current")).toContainText("Step 1 of");
    await page.locator("#next").click();
    await expect(page.locator("#current")).toContainText("Step 2 of");
    const frame = page.frameLocator("#frame");
    expect(await frame.locator("redstone-viewer").evaluate((v: RV) => v.step)).toBe(1);
    await page.locator("#back").click();
    await expect(page.locator("#current")).toContainText("Step 1 of");
    expect(violations).toEqual([]);
  });

  test("setStep from an origin not in allowed-origins is ignored, and so is a malformed command", async ({
    page,
  }) => {
    // allowed-origins names a third origin: the host's commands must be dropped.
    await page.goto(
      `${OTHER}/embed-example.html?viewer=${encodeURIComponent("http://127.0.0.1:4319/viewer.html")}&allow=${encodeURIComponent("https://example.org")}`,
    );
    const viewer = page.frameLocator("#frame").locator("redstone-viewer");
    await expect.poll(() => viewer.evaluate((v: RV) => !!v.model)).toBe(true);
    await page.evaluate(() => {
      const w = document.querySelector<HTMLIFrameElement>("#frame")!.contentWindow!;
      w.postMessage({ type: "setStep", step: 2 }, "*");
    });
    await page.waitForTimeout(500);
    expect(await viewer.evaluate((v: RV) => v.step)).toBe(0);
    // Events go only to the allowed origin, so the host saw none.
    await expect(page.locator("#log li")).toHaveCount(0);
    // Positive control: the viewer was ready and can step, so the command really was refused.
    await viewer.evaluate((v: RV) => v.setStep(2));
    expect(await viewer.evaluate((v: RV) => v.step)).toBe(2);
  });

  test("the embedding example never frames a foreign site", async ({ page }) => {
    await page.goto(`/embed-example.html?viewer=${encodeURIComponent("https://example.com/login")}`);
    const src = await page.locator("#frame").getAttribute("src");
    expect(new URL(src as string).origin).toBe(new URL(page.url()).origin);
    expect(new URL(src as string).pathname).toBe("/viewer.html");
  });

  test("a malformed command from an allowed origin is ignored", async ({ page }) => {
    await page.goto(
      `${OTHER}/embed-example.html?viewer=${encodeURIComponent("http://127.0.0.1:4319/viewer.html")}`,
    );
    await expect(page.locator("#current")).toContainText("Step 1 of");
    await page.evaluate(() => {
      const w = document.querySelector<HTMLIFrameElement>("#frame")!.contentWindow!;
      w.postMessage({ type: "setStep", step: 2, extra: "x" }, "*");
      w.postMessage({ type: "setStep", step: "2" }, "*");
    });
    await page.waitForTimeout(500);
    expect(
      await page
        .frameLocator("#frame")
        .locator("redstone-viewer")
        .evaluate((v: RV) => v.step),
    ).toBe(0);
  });
});

test.describe("/view", () => {
  test("opens the NOT gate from #d= (a Share link)", async ({ page }) => {
    await page.goto("/play/?example=not-gate");
    await page.locator("#share").click();
    await expect(page.locator("#share-link")).toBeVisible();
    const link = await page.locator("#share-link").inputValue();
    expect(link).toMatch(/\/view\/#d=[A-Za-z0-9_-]+$/);
    await page.goto(link);
    await showsNotGate(page);
  });

  test("opens the NOT gate from #json=", async ({ page }) => {
    await page.goto(`/view/#json=${encodeURIComponent(notGate)}`);
    await showsNotGate(page);
  });

  test("opens the NOT gate from ?src=", async ({ page }) => {
    await page.goto(`/view/?src=${encodeURIComponent("/examples/not-gate.rsd.json")}`);
    await showsNotGate(page);
  });

  test("opens the NOT gate from a dropped file", async ({ page }) => {
    await page.goto("/view/");
    const data = await page.evaluateHandle((text) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], "not-gate.rsd.json", { type: "application/json" }));
      return dt;
    }, notGate);
    await page.dispatchEvent("body", "drop", { dataTransfer: data });
    await showsNotGate(page);
  });

  test("opens a 64 KB fragment and refuses a 65 KB one with E013", async ({ page }) => {
    const base = `json=${encodeURIComponent(notGate)}`;
    const fits = base + "%20".repeat(Math.floor((LIMITS.fragmentBytes - base.length) / 3));
    expect(fits.length).toBeGreaterThan(LIMITS.fragmentBytes - 3);
    await page.goto(`/view/#${fits}`);
    await showsNotGate(page);
    const over = base + "%20".repeat(Math.ceil((65 * 1024 - base.length) / 3));
    await page.goto("/view/");
    await page.goto(`/view/#${over}`);
    await page.waitForFunction(() => !!document.body.dataset.opened);
    await expect(page.locator("#problems")).toContainText("E013");
    expect(await page.locator("redstone-viewer").evaluate((v: RV) => v.model)).toBeNull();
  });
});

test.describe("playground", () => {
  test("breaking the NOT gate shows the diagnostic within a second", async ({ page }) => {
    await page.goto("/play/?example=not-gate");
    await page.waitForFunction(() => !!document.body.dataset.validated);
    const broken = notGate.replace('"L-#t*"', '"L-?t*"');
    expect(broken).not.toBe(notGate);
    const started = Date.now();
    await page.locator("#editor").fill(broken);
    await expect(page.locator("#diagnostics")).toContainText("E003", { timeout: 1000 });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("downloads the design, its function, structure, pack and layer sheets", async ({ page }) => {
    await page.goto("/play/?example=not-gate");
    await page.waitForFunction(() => !!document.body.dataset.validated);
    const grab = async (id: string) => {
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator(`#${id}`).click()]);
      return { name: download.suggestedFilename(), bytes: readFileSync((await download.path()) as string) };
    };
    const design = await grab("download-design");
    expect(design.name).toBe("not-gate.rsd.json");
    expect(design.bytes.toString("utf8")).toBe(notGate);
    expect((await grab("download-mcfunction")).name).toBe("not-gate.mcfunction");
    const structure = await grab("download-mcstructure");
    expect(structure.name).toBe("not-gate.mcstructure");
    const pack = await grab("download-mcpack");
    expect(pack.name).toBe("not-gate.mcpack");
    // The site's pack is the CLI's pack, byte for byte.
    const cliPack = join(mkdtempSync(join(tmpdir(), "rsd-site-")), "not-gate.mcpack");
    execFileSync("node", [
      join(ROOT, "packages/cli/dist/bin.js"),
      "pack",
      join(ROOT, "examples/not-gate.rsd.json"),
      "-o",
      cliPack,
    ]);
    expect(pack.bytes.equals(readFileSync(cliPack))).toBe(true);
    const sheets = await grab("download-sheets");
    await page.waitForTimeout(1100);
    expect((await grab("download-sheets")).bytes.equals(sheets.bytes)).toBe(true);
    expect(sheets.name).toBe("not-gate-sheets.zip");
    expect(Object.keys(unzipSync(sheets.bytes))).toEqual([
      "not-gate-layer-000.svg",
      "not-gate-layer-001.svg",
    ]);
  });

  test("keeps the draft in this browser across a reload", async ({ page }) => {
    await page.goto("/play/?example=not-gate");
    await page.waitForFunction(() => !!document.body.dataset.validated);
    const edited = notGate.replace('"name": "NOT gate"', '"name": "My NOT gate"');
    expect(edited).not.toBe(notGate);
    await page.locator("#editor").fill(edited);
    // The draft is saved with the debounced re-validation.
    await page.waitForFunction(
      () => document.querySelector("redstone-viewer")?.model?.meta.name === "My NOT gate",
    );
    await page.goto("/play/");
    await expect(page.locator("#editor")).toHaveValue(edited);
    await expect(page.locator("#notice")).toContainText("last draft");
  });

  test("exports refuse a design with errors and say why", async ({ page }) => {
    await page.goto("/play/?example=not-gate");
    await page.waitForFunction(() => !!document.body.dataset.validated);
    await page.locator("#editor").fill(notGate.replace('"L-#t*"', '"L-?t*"'));
    await expect(page.locator("#diagnostics")).toContainText("E003");
    await page.locator("#download-mcpack").click();
    await expect(page.locator("#notice")).toContainText("Fix the errors first");
  });
});

test.describe("hostile text", () => {
  const HOSTILE = "</script><img src=x onerror=alert(1)>";
  const hostile = JSON.stringify({
    format: "rsd/1",
    meta: { name: HOSTILE, slug: "hostile" },
    legend: { "#": "stone", L: "lever mount=floor", "*": "lamp" },
    layers: [["###"], ["L.*"]],
    annotations: [{ pos: [0, 1, 0], text: HOSTILE }],
  });

  test("the layer sheet shows the hostile name as text and runs nothing", async ({ page }) => {
    const dir = mkdtempSync(join(tmpdir(), "rsd-sheets-"));
    const file = join(dir, "hostile.rsd.json");
    writeFileSync(file, hostile);
    execFileSync("node", [join(ROOT, "packages/cli/dist/bin.js"), "sheets", file, "-o", dir]);
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    await page.goto(`file://${join(dir, "hostile-layer-001.svg")}`);
    expect(await page.evaluate(() => document.querySelector("svg text")?.textContent)).toBe(HOSTILE);
    expect(await page.evaluate(() => document.querySelectorAll("img, script, foreignObject").length)).toBe(0);
    expect(dialogs).toBe(0);
  });

  test("a hostile #json= link shows the name as text and runs nothing", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs++;
      void d.dismiss();
    });
    await page.goto(`/view/#json=${encodeURIComponent(hostile)}`);
    await page.waitForFunction(() => !!document.querySelector("redstone-viewer")?.model);
    expect(await page.locator("redstone-viewer").evaluate((v: RV) => v.model?.meta.name)).toBe(HOSTILE);
    expect(await page.evaluate(() => document.querySelectorAll("img").length)).toBe(0);
    expect(dialogs).toBe(0);
  });
});

test("every site page loads under its CSP with no violations", async ({ page }) => {
  const violations = cspViolations(page);
  for (const path of [
    "/",
    "/view/",
    "/play/",
    "/patterns/",
    "/docs/",
    "/docs/authoring.html",
    "/docs/diagnostics.html",
    "/docs/bedrock-mapping.html",
    "/docs/embedding.html",
    "/embed-example.html",
    "/plain-example.html",
    "/viewer.html?src=/examples/not-gate.rsd.json",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await expect(page.locator("redstone-viewer")).toBeVisible();
  expect(violations).toEqual([]);
});
