import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveTemplateById } from "@invitica/template-kit";
import { chromium } from "playwright-core";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = resolve("C:/tmp");
const persistenceDirectory = resolve(temporaryRoot, `invitica-viewer-browser-${process.pid}`);
const edgeExecutable = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const require = createRequire(import.meta.url);
const wranglerBinary = resolve(
  dirname(require.resolve("wrangler/package.json")),
  "bin/wrangler.js",
);
const wranglerConfig = resolve(appRoot, "wrangler.jsonc");
const publicIdentifier = "e000000000000000000000000000000e";
const publicationId = "a0000000-0000-4000-8000-000000000015";

assert.equal(dirname(persistenceDirectory), temporaryRoot);
assert.ok(existsSync(edgeExecutable), `Microsoft Edge was not found at ${edgeExecutable}`);

function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function createFixture() {
  const template = resolveTemplateById("garden-promise");
  const longRecipient = "The Villanueva, de la Cruz, Santos-Reyes, and Evangelista Family";
  const document = {
    ...template.defaultDocument,
    opening: {
      ...template.defaultDocument.opening,
      fallbackRecipientText: longRecipient,
    },
    sections: template.defaultDocument.sections.map((section) =>
      section.type === "hero"
        ? {
            ...section,
            props: {
              ...section.props,
              title: "Alexandria & Maximiliano",
            },
          }
        : section,
    ),
  };
  const artifact = {
    artifactVersion: 1,
    publicationId,
    snapshot: {
      snapshotVersion: 1,
      invitationSchemaVersion: template.schemaVersion,
      rendererKey: template.rendererKey,
      rendererVersion: 1,
      templateVersionId: template.templateVersionId,
      templateVersion: template.version,
      draftRevision: 7,
      document,
      assets: [],
    },
  };
  const artifactBody = JSON.stringify(artifact);
  const artifactSha256 = createHash("sha256").update(artifactBody).digest("hex");
  const artifactKey = `publication-artifacts/v1/${publicationId}.json`;
  const aliasBody = JSON.stringify({
    aliasVersion: 1,
    publicationId,
    artifactKey,
    artifactSha256,
  });

  return { aliasBody, artifactBody, artifactKey };
}

function putLocalObject(objectPath, body) {
  const result = spawnSync(
    process.execPath,
    [
      wranglerBinary,
      "r2",
      "object",
      "put",
      objectPath,
      "--local",
      "--persist-to",
      persistenceDirectory,
      "--pipe",
      "--config",
      wranglerConfig,
    ],
    {
      cwd: appRoot,
      encoding: "utf8",
      env: { ...process.env, WRANGLER_LOG: "error" },
      input: body,
      windowsHide: true,
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function waitForViewer(origin, processLog) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/i/not-a-valid-invitation`);
      if (response.status === 404) {
        return;
      }
    } catch {
      // Wrangler is still starting.
    }

    if (processLog.exitCode !== null) {
      throw new Error(`Wrangler exited before becoming ready: ${processLog.output}`);
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }

  throw new Error(`Wrangler did not become ready: ${processLog.output}`);
}

function watchPage(page, failures) {
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message
        .text()
        .startsWith("Failed to load resource: the server responded with a status of 404")
    ) {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("response", (response) => {
    const expectedUnavailableDocument =
      response.status() === 404 &&
      response.request().resourceType() === "document" &&
      new URL(response.url()).pathname === "/i/not-a-valid-invitation";

    if (response.status() >= 400 && !expectedUnavailableDocument) {
      failures.push(`response: ${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const expectedViewAbort =
      new URL(request.url()).pathname === "/api/public/view" &&
      request.failure()?.errorText === "net::ERR_ABORTED";
    if (!expectedViewAbort) {
      failures.push(`request: ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
    }
  });
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    overflow.scrollWidth <= overflow.clientWidth,
    `Horizontal overflow: ${JSON.stringify(overflow)}`,
  );
}

async function routeViewTracking(context, trackedViews) {
  await context.route("**/api/public/view", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    assert.equal(request.method(), "POST");
    assert.deepEqual(body, { publicIdentifier });
    assert.equal(request.url().includes("#g="), false);
    trackedViews.push(body);
    await route.fulfill({ status: 204 });
  });
}

async function runBrowserChecks(origin) {
  const browser = await chromium.launch({
    executablePath: edgeExecutable,
    headless: true,
  });
  const failures = [];
  const trackedViews = [];

  try {
    const path = `/i/alexandria-and-maximiliano-${publicIdentifier}`;
    const mobile = await browser.newContext({
      deviceScaleFactor: 2,
      isMobile: true,
      viewport: { height: 800, width: 320 },
    });
    await routeViewTracking(mobile, trackedViews);
    const mobilePage = await mobile.newPage();
    watchPage(mobilePage, failures);
    const mobileResponse = await mobilePage.goto(`${origin}${path}`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(mobileResponse?.status(), 200);
    await mobilePage.locator('[data-render-mode="published"]').waitFor();
    await mobilePage.getByText("Alexandria & Maximiliano").waitFor({ state: "attached" });
    await mobilePage.locator(".gp-recipient-line strong").waitFor();
    await assertNoHorizontalOverflow(mobilePage);
    const closedOpeningBox = await mobilePage.locator("[data-envelope-opening]").boundingBox();
    assert.ok(
      closedOpeningBox && closedOpeningBox.height >= 799 && closedOpeningBox.width >= 319,
      `The closed mobile opener must cover the 800px viewport: ${JSON.stringify(closedOpeningBox)}`,
    );
    const closedGate = await mobilePage.evaluate(() => ({
      bodyPosition: document.body.style.position,
      contentInert: document.querySelector("[data-envelope-gated]")?.hasAttribute("inert"),
      lock: document.documentElement.getAttribute("data-invitation-scroll-lock"),
      scrollY: window.scrollY,
    }));
    assert.deepEqual(closedGate, {
      bodyPosition: "fixed",
      contentInert: true,
      lock: "true",
      scrollY: 0,
    });
    await mobilePage.evaluate(() => window.scrollTo(0, 240));
    await mobilePage.waitForTimeout(50);
    assert.equal(await mobilePage.evaluate(() => window.scrollY), 0);
    const buttonBox = await mobilePage
      .getByRole("button", {
        name: /Open invitation for/,
      })
      .boundingBox();
    assert.ok(buttonBox && buttonBox.height >= 44, "The mobile opener must be at least 44px tall");

    const resourceTransfer = await mobilePage.evaluate(() => {
      const resources = performance.getEntriesByType("resource");
      return {
        scriptBytes: resources
          .filter((entry) => new URL(entry.name).pathname === "/viewer.js")
          .reduce((total, entry) => total + entry.encodedBodySize, 0),
        totalBytes: resources.reduce((total, entry) => total + entry.encodedBodySize, 0),
      };
    });
    assert.ok(
      resourceTransfer.scriptBytes <= 200 * 1024,
      `Critical Viewer JavaScript exceeded 200 KB compressed: ${resourceTransfer.scriptBytes}`,
    );
    assert.ok(
      resourceTransfer.totalBytes <= 1_000_000,
      `Initial Viewer transfer exceeded 1 MB: ${resourceTransfer.totalBytes}`,
    );
    await mobile.close();

    const landscape = await browser.newContext({
      deviceScaleFactor: 2,
      isMobile: true,
      viewport: { height: 360, width: 800 },
    });
    await routeViewTracking(landscape, trackedViews);
    const landscapePage = await landscape.newPage();
    watchPage(landscapePage, failures);
    await landscapePage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await landscapePage.getByRole("button", { name: /Open invitation for/ }).waitFor();
    await assertNoHorizontalOverflow(landscapePage);
    assert.equal(
      await landscapePage.evaluate(() =>
        document.documentElement.getAttribute("data-invitation-scroll-lock"),
      ),
      "true",
    );
    await landscape.close();

    const desktop = await browser.newContext({ viewport: { height: 900, width: 1280 } });
    await routeViewTracking(desktop, trackedViews);
    const desktopPage = await desktop.newPage();
    watchPage(desktopPage, failures);
    await desktopPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    const desktopOpeningBox = await desktopPage.locator("[data-envelope-opening]").boundingBox();
    assert.ok(
      desktopOpeningBox && desktopOpeningBox.height >= 899 && desktopOpeningBox.width >= 1279,
      `The closed desktop opener must cover the 900px viewport: ${JSON.stringify(desktopOpeningBox)}`,
    );
    await desktopPage.keyboard.press("Tab");
    const opener = desktopPage.getByRole("button", { name: /Open invitation for/ });
    await expectFocused(opener);
    const outline = await opener.evaluate((button) => getComputedStyle(button).outlineStyle);
    assert.notEqual(outline, "none");
    await desktopPage.keyboard.press("Space");
    const skipOpening = desktopPage.getByRole("button", { name: "Skip opening" });
    await skipOpening.waitFor();
    const skipBox = await skipOpening.boundingBox();
    assert.ok(
      skipBox && skipBox.height >= 44,
      "The extended opening skip control must be at least 44px tall",
    );
    await desktopPage
      .locator('[data-opening-state="letter-revealing"]')
      .waitFor({ timeout: 5_000 });
    await desktopPage.waitForTimeout(250);
    const letterDwell = await desktopPage.evaluate(() => {
      const content = document.querySelector(".ie-content");
      const animation = content?.getAnimations()[0];
      return {
        animationName: content ? getComputedStyle(content).animationName : null,
        opacity: content ? getComputedStyle(content).opacity : null,
        progress: animation?.effect?.getComputedTiming().progress ?? null,
      };
    });
    assert.equal(
      letterDwell.opacity,
      "0",
      `The personalized letter must keep sole focus during its reading hold: ${JSON.stringify(letterDwell)}`,
    );
    const takeoverGate = await desktopPage.evaluate(() => ({
      contentInert: document.querySelector("[data-envelope-gated]")?.hasAttribute("inert"),
      openingPosition: getComputedStyle(document.querySelector("[data-envelope-opening]")).position,
      visuallyGated: document
        .querySelector("[data-envelope-visual-gated]")
        ?.getAttribute("data-envelope-visual-gated"),
    }));
    assert.deepEqual(takeoverGate, {
      contentInert: true,
      openingPosition: "absolute",
      visuallyGated: "false",
    });
    await desktopPage.locator('[data-opening-state="opened"]').waitFor({ timeout: 7_000 });
    await desktopPage.locator("[data-envelope-opening]").waitFor({ state: "hidden" });
    assert.equal(await desktopPage.locator(".gp-envelope").isVisible(), false);
    await expectFocused(desktopPage.locator("[data-envelope-focus-target]"));
    const openedGate = await desktopPage.evaluate(() => ({
      bodyPosition: document.body.style.position,
      contentInert: document.querySelector("[data-envelope-gated]")?.hasAttribute("inert"),
      lock: document.documentElement.getAttribute("data-invitation-scroll-lock"),
    }));
    assert.deepEqual(openedGate, {
      bodyPosition: "",
      contentInert: false,
      lock: null,
    });
    const heroBox = await desktopPage.locator(".gp-hero").boundingBox();
    assert.ok(heroBox, "The opened Garden Promise letter must be visible");
    assert.ok(heroBox.y < 2, `The opened letter should begin at the viewport top: ${heroBox.y}`);
    assert.ok(
      Math.abs(heroBox.x + heroBox.width / 2 - 640) < 2,
      "The opened letter must remain centered",
    );
    await desktopPage.evaluate(() => window.scrollTo(0, 240));
    assert.ok((await desktopPage.evaluate(() => window.scrollY)) > 0, "Scrolling must unlock");
    await assertNoHorizontalOverflow(desktopPage);
    await desktop.close();

    const reduced = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { height: 800, width: 320 },
    });
    await routeViewTracking(reduced, trackedViews);
    const reducedPage = await reduced.newPage();
    watchPage(reducedPage, failures);
    await reducedPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await reducedPage.locator('[data-motion-enabled="false"]').waitFor();
    await reducedPage.getByRole("button", { name: /Open invitation for/ }).press("Enter");
    await reducedPage.locator('[data-opening-state="opened"]').waitFor({ timeout: 750 });
    await reducedPage.locator("[data-envelope-opening]").waitFor({ state: "hidden" });
    assert.equal(await reducedPage.locator(".gp-envelope").isVisible(), false);
    await reducedPage.getByText("Hiraya Garden Pavilion").waitFor();
    await reducedPage.waitForFunction(() =>
      document.activeElement?.hasAttribute("data-envelope-focus-target"),
    );
    await expectFocused(reducedPage.locator("[data-envelope-focus-target]"));
    await assertNoHorizontalOverflow(reducedPage);
    await reduced.close();

    const rsvp = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { height: 800, width: 320 },
    });
    await routeViewTracking(rsvp, trackedViews);
    const rsvpPage = await rsvp.newPage();
    const personalizedToken = "A".repeat(43);
    let submittedRsvp;
    watchPage(rsvpPage, failures);
    await rsvpPage.route("**/api/public/guest-context", async (route) => {
      const request = route.request();
      const requestBody = request.postDataJSON();
      assert.equal(request.method(), "POST");
      assert.equal(requestBody.publicIdentifier, publicIdentifier);
      assert.equal(requestBody.token, personalizedToken);
      assert.equal(request.url().includes(personalizedToken), false);
      await route.fulfill({
        body: JSON.stringify({
          recipientName: "The Santos Family",
          rsvp: {
            capacity: 4,
            deadline: "2099-12-01T00:00:00+08:00",
            response: null,
            status: "open",
          },
        }),
        contentType: "application/json",
        status: 200,
      });
    });
    await rsvpPage.route("**/api/public/rsvp", async (route) => {
      const request = route.request();
      submittedRsvp = request.postDataJSON();
      assert.equal(request.method(), "POST");
      assert.equal(request.url().includes(personalizedToken), false);
      await route.fulfill({
        body: JSON.stringify({
          response: {
            attendance: submittedRsvp.attendance,
            attendeeCount: submittedRsvp.attendeeCount,
            message: submittedRsvp.message,
            revision: 1,
            updatedAt: "2026-07-23T10:00:00+08:00",
          },
        }),
        contentType: "application/json",
        status: 200,
      });
    });
    await rsvpPage.goto(`${origin}${path}#g=${personalizedToken}`, {
      waitUntil: "domcontentloaded",
    });
    await rsvpPage.getByRole("button", { name: /Open invitation for/ }).press("Enter");
    await rsvpPage.locator('[data-opening-state="opened"]').waitFor({ timeout: 750 });
    await rsvpPage.getByRole("radio", { name: "Joyfully attending" }).check();
    await rsvpPage.getByRole("spinbutton", { name: "Guests attending" }).fill("2");
    await rsvpPage
      .getByRole("textbox", { name: /Message to the hosts/ })
      .fill("Looking forward to celebrating.");
    const sendResponse = rsvpPage.getByRole("button", { name: "Send response" });
    const sendBox = await sendResponse.boundingBox();
    assert.ok(
      sendBox && sendBox.height >= 44,
      "The RSVP submit control must be at least 44px tall",
    );
    await sendResponse.press("Enter");
    await rsvpPage.getByRole("heading", { name: "We saved your place." }).waitFor();
    await rsvpPage.getByRole("button", { name: "Change response" }).focus();
    await expectFocused(rsvpPage.getByRole("button", { name: "Change response" }));
    assert.deepEqual(
      {
        attendance: submittedRsvp.attendance,
        attendeeCount: submittedRsvp.attendeeCount,
        expectedRevision: submittedRsvp.expectedRevision,
        message: submittedRsvp.message,
        publicIdentifier: submittedRsvp.publicIdentifier,
        token: submittedRsvp.token,
      },
      {
        attendance: "attending",
        attendeeCount: 2,
        expectedRevision: 0,
        message: "Looking forward to celebrating.",
        publicIdentifier,
        token: personalizedToken,
      },
    );
    await assertNoHorizontalOverflow(rsvpPage);
    await rsvp.close();

    const degraded = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { height: 800, width: 320 },
    });
    await routeViewTracking(degraded, trackedViews);
    const degradedPage = await degraded.newPage();
    await degradedPage.route("**/api/public/guest-context", (route) =>
      route.fulfill({
        body: JSON.stringify({ status: "unavailable" }),
        contentType: "application/json",
        status: 503,
      }),
    );
    await degradedPage.goto(`${origin}${path}#g=${personalizedToken}`, {
      waitUntil: "domcontentloaded",
    });
    await degradedPage
      .getByText("Online response is temporarily unavailable. You can still read the invitation.")
      .waitFor({ state: "attached" });
    await degradedPage.getByRole("button", { name: /Open invitation for/ }).press("Enter");
    await degradedPage.locator('[data-opening-state="opened"]').waitFor({ timeout: 750 });
    await degradedPage
      .getByText("Online response is temporarily unavailable. You can still read the invitation.")
      .waitFor();
    await degradedPage.getByRole("heading", { name: "Alexandria & Maximiliano" }).waitFor();
    await assertNoHorizontalOverflow(degradedPage);
    await degraded.close();

    const noJavaScript = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { height: 800, width: 320 },
    });
    await routeViewTracking(noJavaScript, trackedViews);
    const noJavaScriptPage = await noJavaScript.newPage();
    watchPage(noJavaScriptPage, failures);
    await noJavaScriptPage.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await noJavaScriptPage.getByRole("heading", { name: "Alexandria & Maximiliano" }).waitFor();
    const noJavaScriptGate = await noJavaScriptPage.evaluate(() => ({
      contentInert: document.querySelector("[data-envelope-gated]")?.hasAttribute("inert"),
      lock: document.documentElement.getAttribute("data-invitation-scroll-lock"),
    }));
    assert.deepEqual(noJavaScriptGate, { contentInert: false, lock: null });
    await assertNoHorizontalOverflow(noJavaScriptPage);
    await noJavaScript.close();

    const unavailable = await browser.newContext({ viewport: { height: 800, width: 320 } });
    await routeViewTracking(unavailable, trackedViews);
    const unavailablePage = await unavailable.newPage();
    watchPage(unavailablePage, failures);
    const unavailableResponse = await unavailablePage.goto(`${origin}/i/not-a-valid-invitation`, {
      waitUntil: "domcontentloaded",
    });
    assert.equal(unavailableResponse?.status(), 404);
    await unavailablePage
      .getByRole("heading", { name: "This invitation is unavailable." })
      .waitFor();
    await unavailablePage.getByRole("link", { name: "Try again" }).waitFor();
    await assertNoHorizontalOverflow(unavailablePage);
    await unavailable.close();

    assert.ok(trackedViews.length > 0, "At least one privacy-safe view request must be recorded");
    assert.deepEqual(failures, []);
    return {
      browser: "Microsoft Edge",
      resourceBytes: resourceTransfer.totalBytes,
      scriptBytes: resourceTransfer.scriptBytes,
      viewport: "320x800",
    };
  } finally {
    await browser.close();
  }
}

async function expectFocused(locator) {
  await locator.waitFor();
  assert.equal(await locator.evaluate((element) => element === document.activeElement), true);
}

let devProcess;
let browserEvidence;

try {
  mkdirSync(persistenceDirectory, { recursive: false });
  const fixture = createFixture();
  putLocalObject(`invitica-storage/${fixture.artifactKey}`, fixture.artifactBody);
  putLocalObject(
    `invitica-storage/publication-aliases/v1/${publicIdentifier}.json`,
    fixture.aliasBody,
  );

  const port = await availablePort();
  const processLog = { exitCode: null, output: "" };
  devProcess = spawn(
    process.execPath,
    [
      wranglerBinary,
      "dev",
      "--local",
      "--persist-to",
      persistenceDirectory,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--env=",
    ],
    { cwd: appRoot, env: process.env, windowsHide: true },
  );
  devProcess.stdout.on("data", (chunk) => {
    processLog.output = `${processLog.output}${chunk}`.slice(-8_000);
  });
  devProcess.stderr.on("data", (chunk) => {
    processLog.output = `${processLog.output}${chunk}`.slice(-8_000);
  });
  devProcess.on("exit", (code) => {
    processLog.exitCode = code;
  });

  const origin = `http://127.0.0.1:${port}`;
  await waitForViewer(origin, processLog);
  browserEvidence = await runBrowserChecks(origin);
} finally {
  if (devProcess?.pid) {
    spawnSync("taskkill.exe", ["/PID", String(devProcess.pid), "/T", "/F"], {
      windowsHide: true,
    });
  }

  assert.equal(dirname(persistenceDirectory), temporaryRoot);
  rmSync(persistenceDirectory, { force: true, recursive: true });
}

console.log(JSON.stringify({ browserCheck: "passed", ...browserEvidence }));
