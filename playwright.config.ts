import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: "./tests/e2e/global-setup.ts",
  outputDir: "test-results/playwright",
  projects: [
    {
      name: "chromium-android",
      use: {
        browserName: "chromium",
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        viewport: { height: 800, width: 360 },
      },
    },
    {
      name: "chromium-narrow",
      use: {
        browserName: "chromium",
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        viewport: { height: 800, width: 320 },
      },
    },
    {
      name: "webkit-mobile",
      use: {
        browserName: "webkit",
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        viewport: { height: 844, width: 390 },
      },
    },
    {
      name: "firefox-desktop",
      use: {
        browserName: "firefox",
        viewport: { height: 800, width: 1280 },
      },
    },
    {
      name: "edge-desktop",
      use: {
        browserName: "chromium",
        channel: "msedge",
        viewport: { height: 900, width: 1440 },
      },
    },
  ],
  reporter: [["line"]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  workers: 1,
});
