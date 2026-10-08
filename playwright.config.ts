import { defineConfig, devices } from "@playwright/test";

const port = 4319;
/** A second origin for the cross-origin embedding tests. */
export const otherPort = 4320;

// Viewer tests run against the built site (`pnpm build` first). Headless Chromium renders WebGL with SwiftShader;
// screenshots differ per platform, so baselines are kept per OS and compared with a pixel tolerance.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  expect: { toHaveScreenshot: { maxDiffPixels: 300, threshold: 0.2 } },
  snapshotPathTemplate: "e2e/__screenshots__/{testFileName}/{arg}-{platform}{ext}",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
  // Two servers on the same build: another port is another origin, so the embedding tests run across origins.
  webServer: [port, otherPort].map((p) => ({
    command: `pnpm --filter @dustwright/site exec vite preview --port ${p} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${p}/play/`,
    reuseExistingServer: !process.env.CI,
  })),
});
