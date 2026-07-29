import { spawn, spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const repoRoot = resolve(import.meta.dirname, "..");
const outputRoot = resolve(process.argv[2] ?? resolve(tmpdir(), "invitica-landing-check"));
const port = 3017;
const externalOrigin = process.argv[3]?.startsWith("http") ? process.argv[3] : null;
const origin = externalOrigin ?? `http://127.0.0.1:${port}`;
const serverMode = process.argv.includes("--production") ? "start" : "dev";
const serverOutput = [];

await mkdir(outputRoot, { recursive: true });

const server = externalOrigin
  ? null
  : spawn(
      "C:\\Windows\\System32\\cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        `pnpm --filter @invitica/web exec next ${serverMode} -p ${port} -H 127.0.0.1`,
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

for (const stream of server ? [server.stdout, server.stderr] : []) {
  stream.on("data", (chunk) => {
    serverOutput.push(String(chunk));
    if (serverOutput.length > 30) {
      serverOutput.shift();
    }
  });
}

async function waitForServer() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (server && server.exitCode !== null) {
      throw new Error(`Landing server exited early.\n${serverOutput.join("")}`);
    }

    try {
      const response = await fetch(origin);
      if (response.ok) {
        return;
      }
    } catch {
      // The local server is still starting.
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error(`Landing server did not become ready.\n${serverOutput.join("")}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function checkViewport(browser, width, height) {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    hasTouch: width < 720,
    isMobile: width < 720,
    reducedMotion: "no-preference",
    viewport: { height, width },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page
    .locator("img")
    .first()
    .evaluate(async (image) => {
      if (!image.complete) {
        await new Promise((resolveLoad, rejectLoad) => {
          image.addEventListener("load", resolveLoad, { once: true });
          image.addEventListener("error", rejectLoad, { once: true });
        });
      }
    });

  const viewportState = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    viewportState.bodyWidth <= viewportState.innerWidth &&
      viewportState.documentWidth <= viewportState.innerWidth,
    `${width}px viewport has horizontal overflow: ${JSON.stringify(viewportState)}`,
  );

  const cardColumns = await page
    .getByRole("link", { name: /preview invitation \(opens in a new tab\)/i })
    .evaluateAll(
      (links) => new Set(links.map((link) => Math.round(link.getBoundingClientRect().x))).size,
    );
  assert(
    cardColumns === (width < 720 ? 2 : 4),
    `${width}px template column count is ${cardColumns}`,
  );

  const primaryBox = await page
    .getByRole("link", { name: "Preview a real invitation" })
    .first()
    .boundingBox();
  assert(
    primaryBox && primaryBox.height >= 44,
    `${width}px primary preview action is below the 44px target`,
  );

  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: resolve(
      outputRoot,
      `2026-07-29 landing-${width < 720 ? "mobile-" : "desktop-"}${width}.png`,
    ),
  });

  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => ({
    href: document.activeElement?.getAttribute("href"),
    text: document.activeElement?.textContent?.trim(),
  }));
  assert(
    firstFocus.href === "#main-content" && firstFocus.text === "Skip to content",
    `${width}px first keyboard focus is not the skip link`,
  );

  if (width < 720) {
    const menu = page.getByRole("button", { name: "Open menu" });
    const menuBox = await menu.boundingBox();
    assert(menuBox && menuBox.height >= 44, `${width}px menu button is below the 44px target`);
    await menu.click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).waitFor({ state: "visible" });
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name: "Templates" })
      .click();
    assert(
      (await page.getByRole("button", { name: "Open menu" }).getAttribute("aria-expanded")) ===
        "false",
      `${width}px mobile menu did not close after navigation`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
  } else {
    assert(
      await page.getByRole("navigation", { name: "Main navigation" }).isVisible(),
      "Desktop navigation is not visible",
    );
  }

  assert((await page.getByRole("link", { name: "Pricing" }).count()) === 0, "Pricing link remains");

  const accessibility = await new AxeBuilder({ page }).analyze();
  assert(
    accessibility.violations.length === 0,
    width +
      "px accessibility violations: " +
      accessibility.violations.map((violation) => violation.id).join(", "),
  );

  await page.emulateMedia({ reducedMotion: "reduce" });
  const transitionDuration = await page
    .locator('img[alt^="A blush pink"]')
    .evaluate((image) => getComputedStyle(image).transitionDuration);
  const transitionsDisabled = transitionDuration
    .split(",")
    .every((duration) => Number.parseFloat(duration) <= 0.001);
  assert(
    transitionsDisabled,
    `${width}px reduced-motion transition remains enabled (${transitionDuration})`,
  );
  assert(pageErrors.length === 0, `${width}px page errors: ${pageErrors.join(" | ")}`);

  await context.close();
  console.log(`${width}px landing check passed`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: "msedge" });
  await checkViewport(browser, 320, 844);
  await checkViewport(browser, 390, 844);
  await checkViewport(browser, 1440, 900);
  console.log(`Landing screenshots: ${outputRoot}`);
} finally {
  await browser?.close();
  if (server && server.exitCode === null && server.pid) {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
}
