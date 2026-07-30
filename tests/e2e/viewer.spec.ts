import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const publicIdentifier = "e000000000000000000000000000000e";
const invitationPath = `/i/alexandria-and-maximiliano-${publicIdentifier}`;
const personalizedToken = "A".repeat(43);
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const phase4LabBudgets = {
  cumulativeLayoutShift: 0.1,
  feedbackLatencyMs: 200,
  largestContentfulPaintMs: 2_500,
};

function origin(): string {
  const value = process.env.INVITICA_VIEWER_TEST_ORIGIN;
  if (!value) throw new Error("The Viewer test origin is unavailable");
  return value;
}

function blockingViolations<T extends { impact?: string | null }>(violations: T[]): T[] {
  return violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
}

async function assertNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

async function finishOpening(page: Page) {
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  const skip = page.getByRole("button", { name: "Skip opening" });
  if ((await skip.count()) > 0) {
    await skip.press("Enter");
  }
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({
    timeout: 6_000,
  });
}

const availableGuestContext = {
  recipientName: "The Santos Family",
  rsvp: {
    capacity: 4,
    deadline: "2099-12-01T23:59:59+08:00",
    response: null,
    status: "open",
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/public/view", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ publicIdentifier });
    expect(route.request().url()).not.toContain("#g=");
    await route.fulfill({ status: 204 });
  });
});

test("renders, opens, and passes blocking WCAG A/AA checks", async ({ page }) => {
  const response = await page.goto(`${origin()}${invitationPath}`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-render-mode="published"]')).toBeAttached();
  await expect(page.locator("h1", { hasText: "Alexandria & Maximiliano" })).toBeAttached();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const closedAudit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(blockingViolations(closedAudit.violations)).toEqual([]);

  const opener = page.getByRole("button", { name: /Open invitation for/ });
  const openerBox = await opener.boundingBox();
  expect(openerBox?.height).toBeGreaterThanOrEqual(44);
  await opener.press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached();
  await expect(page.getByRole("heading", { name: "Alexandria & Maximiliano" })).toBeVisible();
  await expect(page.getByText("Hiraya Garden Pavilion")).toBeVisible();
  await expect(page.getByText("Kindly reply by December 17, 2026")).toBeVisible();

  const openedAudit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(blockingViolations(openedAudit.violations)).toEqual([]);
  await assertNoHorizontalOverflow(page);
});

test("keeps personalized capabilities out of request URLs and submits RSVP", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/public/guest-context", async (route) => {
    expect(route.request().url()).not.toContain(personalizedToken);
    expect(route.request().postDataJSON()).toEqual({ publicIdentifier, token: personalizedToken });
    await route.fulfill({
      body: JSON.stringify(availableGuestContext),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/public/rsvp", async (route) => {
    expect(route.request().url()).not.toContain(personalizedToken);
    submitted = route.request().postDataJSON();
    await route.fulfill({
      body: JSON.stringify({
        response: {
          attendance: "attending",
          attendeeCount: 2,
          message: "Looking forward to celebrating.",
          revision: 1,
          updatedAt: "2026-07-23T10:00:00+08:00",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto(`${origin()}${invitationPath}#g=${personalizedToken}`, {
    waitUntil: "domcontentloaded",
  });
  await finishOpening(page);
  await page.getByRole("radio", { name: "Joyfully attending" }).check();
  await page.getByRole("spinbutton", { name: "Guests attending" }).fill("2");
  await page
    .getByRole("textbox", { name: /Message to the hosts/ })
    .fill("Looking forward to celebrating.");
  await page.getByRole("button", { name: "Send response" }).press("Enter");

  await expect(page.getByRole("heading", { name: "We saved your place." })).toBeVisible();
  expect(submitted).toMatchObject({
    attendance: "attending",
    attendeeCount: 2,
    expectedRevision: 0,
    message: "Looking forward to celebrating.",
    publicIdentifier,
    token: personalizedToken,
  });
});

test("keeps server output readable without JavaScript", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-narrow", "One narrow engine proves the fallback");
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { height: 800, width: 320 },
  });
  const page = await context.newPage();
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Alexandria & Maximiliano" })).toBeVisible();
  expect(await page.locator("[data-envelope-gated]").getAttribute("inert")).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await context.close();
});

test("finishes immediately and transfers focus with reduced motion", async ({
  browser,
}, testInfo) => {
  test.skip(
    !["chromium-android", "webkit-mobile"].includes(testInfo.project.name),
    "Reduced motion is required on Chromium and WebKit",
  );
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport:
      testInfo.project.name === "webkit-mobile"
        ? { height: 844, width: 390 }
        : { height: 800, width: 360 },
  });
  const page = await context.newPage();
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-motion-enabled="false"]')).toBeAttached();

  const startedAt = Date.now();
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 750 });
  expect(Date.now() - startedAt).toBeLessThan(750);
  await expect(page.locator("[data-envelope-focus-target]")).toBeFocused();
  await expect(page.getByRole("button", { name: "Skip opening" })).toHaveCount(0);
  await assertNoHorizontalOverflow(page);
  await context.close();
});

test("keeps the complete invitation usable at 200 percent text", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-narrow", "The 320px lane owns text scaling");
  await page.route("**/api/public/guest-context", (route) =>
    route.fulfill({
      body: JSON.stringify(availableGuestContext),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.goto(`${origin()}${invitationPath}#g=${personalizedToken}`, {
    waitUntil: "domcontentloaded",
  });
  await page.addStyleTag({ content: ":root { font-size: 200% !important; }" });
  await assertNoHorizontalOverflow(page);
  await finishOpening(page);

  const sendResponse = page.getByRole("button", { name: "Send response" });
  await sendResponse.scrollIntoViewIfNeeded();
  await expect(sendResponse).toBeVisible();
  const box = await sendResponse.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  await assertNoHorizontalOverflow(page);
});

test("keeps the opening control usable in landscape", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "One Chromium lane proves landscape");
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 360, width: 800 },
  });
  const page = await context.newPage();
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await assertNoHorizontalOverflow(page);
  const opener = page.getByRole("button", { name: /Open invitation for/ });
  const openerBox = await opener.boundingBox();
  expect(openerBox).not.toBeNull();
  expect(openerBox?.height).toBeGreaterThanOrEqual(44);
  await finishOpening(page);
  await expect(page.getByRole("button", { name: "Skip opening" })).toHaveCount(0);
  await expect(page.locator("[data-envelope-focus-target]")).toBeFocused();
  await assertNoHorizontalOverflow(page);
  await context.close();
});

test("remains usable on a constrained 3G profile", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-android",
    "One Chromium lane proves 3G correctness",
  );
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    connectionType: "cellular3g",
    downloadThroughput: (400 * 1024) / 8,
    latency: 400,
    offline: false,
    uploadThroughput: (200 * 1024) / 8,
  });

  try {
    await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Open invitation for/ })).toBeVisible();
    await finishOpening(page);
    await expect(page.getByText("Hiraya Garden Pavilion")).toBeVisible();
    await assertNoHorizontalOverflow(page);
  } finally {
    await session.detach();
  }
});

test("keeps feedback responsive under slow 4G and mid-range CPU constraints", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-android",
    "One Chromium mobile lane owns the Phase 4 lab budgets",
  );
  test.slow();

  let releaseRsvp = () => {};
  let rsvpAttempts = 0;
  const rsvpGate = new Promise<void>((resolve) => {
    releaseRsvp = resolve;
  });

  await page.addInitScript(() => {
    const metrics = { cumulativeLayoutShift: 0, largestContentfulPaintMs: 0 };
    (
      window as Window & {
        __inviticaPhase4Metrics?: typeof metrics;
      }
    ).__inviticaPhase4Metrics = metrics;

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        metrics.largestContentfulPaintMs = entry.startTime;
      }
    }).observe({ buffered: true, type: "largest-contentful-paint" });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!shift.hadRecentInput) metrics.cumulativeLayoutShift += shift.value;
      }
    }).observe({ buffered: true, type: "layout-shift" });
  });

  await page.route("**/api/public/guest-context", (route) =>
    route.fulfill({
      body: JSON.stringify(availableGuestContext),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/public/rsvp", async (route) => {
    rsvpAttempts += 1;
    await rsvpGate;
    await route.fulfill({
      body: JSON.stringify({ error: "fixture_unavailable" }),
      contentType: "application/json",
      status: 503,
    });
  });

  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    connectionType: "cellular4g",
    downloadThroughput: (1_600 * 1024) / 8,
    latency: 150,
    offline: false,
    uploadThroughput: (750 * 1024) / 8,
  });
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  try {
    await page.goto(`${origin()}${invitationPath}#g=${personalizedToken}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator(".gp-recipient-line strong")).toHaveText("The Santos Family", {
      timeout: 15_000,
    });
    await finishOpening(page);
    await page.getByRole("spinbutton", { name: "Guests attending" }).fill("2");

    const submitButton = page.locator('button.rsvp-card__primary[type="submit"]');
    const feedbackLatencyMs = await submitButton.evaluate(
      (element) =>
        new Promise<number>((resolve, reject) => {
          const button = element as HTMLButtonElement;
          const startedAt = performance.now();
          const timeout = window.setTimeout(() => {
            observer.disconnect();
            reject(new Error("The RSVP button did not expose its saving state within one second"));
          }, 1_000);
          const finishWhenSaving = () => {
            if (button.textContent?.includes("Saving response")) {
              window.clearTimeout(timeout);
              observer.disconnect();
              resolve(performance.now() - startedAt);
            }
          };
          const observer = new MutationObserver(finishWhenSaving);
          observer.observe(button, { childList: true, characterData: true, subtree: true });
          button.click();
          finishWhenSaving();
        }),
    );

    expect(feedbackLatencyMs).toBeLessThanOrEqual(phase4LabBudgets.feedbackLatencyMs);
    await expect(page.getByRole("button", { name: "Saving response..." })).toBeDisabled();
    await expect.poll(() => rsvpAttempts).toBe(1);

    await submitButton.evaluate((element) => {
      const form = element.closest("form");
      form?.requestSubmit();
      form?.requestSubmit();
    });
    await page.waitForTimeout(500);
    expect(rsvpAttempts).toBe(1);

    await expect(page.getByRole("button", { name: "Still saving..." })).toBeDisabled({
      timeout: 9_000,
    });
    await expect(page.getByText(/This is taking longer than usual/)).toBeVisible();

    const metrics = await page.evaluate(
      () =>
        (
          window as Window & {
            __inviticaPhase4Metrics?: {
              cumulativeLayoutShift: number;
              largestContentfulPaintMs: number;
            };
          }
        ).__inviticaPhase4Metrics,
    );
    expect(metrics).toBeDefined();
    expect(metrics?.largestContentfulPaintMs).toBeGreaterThan(0);
    expect(metrics?.largestContentfulPaintMs).toBeLessThanOrEqual(
      phase4LabBudgets.largestContentfulPaintMs,
    );
    expect(metrics?.cumulativeLayoutShift).toBeLessThanOrEqual(
      phase4LabBudgets.cumulativeLayoutShift,
    );
    await testInfo.attach("phase4-lab-metrics", {
      body: JSON.stringify(
        {
          budgets: phase4LabBudgets,
          feedbackLatencyMs,
          profile: { cpuThrottle: 4, network: "slow-4g" },
          results: metrics,
          rsvpAttempts,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await assertNoHorizontalOverflow(page);

    releaseRsvp();
    await expect(page.getByRole("alert")).toHaveText(
      "We could not confirm that your response was saved. Your answers are still here; try again safely.",
    );
  } finally {
    releaseRsvp();
    if (!page.isClosed()) {
      await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await session.send("Network.emulateNetworkConditions", {
        downloadThroughput: -1,
        latency: 0,
        offline: false,
        uploadThroughput: -1,
      });
      await session.detach();
    }
  }
});

test("recovers when guest context and RSVP go offline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "One mobile engine proves resilience");
  let contextAttempts = 0;
  let rsvpAttempts = 0;
  const mutationIds: string[] = [];

  await page.route("**/api/public/guest-context", async (route) => {
    contextAttempts += 1;
    if (contextAttempts === 1) {
      await page.context().setOffline(true);
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({
      body: JSON.stringify(availableGuestContext),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/public/rsvp", async (route) => {
    rsvpAttempts += 1;
    const request = route.request().postDataJSON() as { mutationId: string };
    mutationIds.push(request.mutationId);
    if (rsvpAttempts === 1) {
      await page.context().setOffline(true);
      await route.abort("internetdisconnected");
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        response: {
          attendance: "attending",
          attendeeCount: 2,
          message: "Looking forward to celebrating.",
          revision: 1,
          updatedAt: "2026-07-23T10:00:00+08:00",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto(`${origin()}${invitationPath}#g=${personalizedToken}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByText(
      "Online response is temporarily unavailable. You can still read the invitation.",
    ),
  ).toBeAttached();

  await finishOpening(page);
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Try online response again" }).press("Enter");
  await expect(page.locator(".gp-recipient-line strong")).toHaveText("The Santos Family");
  expect(contextAttempts).toBe(2);
  await page.getByRole("spinbutton", { name: "Guests attending" }).fill("2");
  await page
    .getByRole("textbox", { name: /Message to the hosts/ })
    .fill("Looking forward to celebrating.");
  await page.getByRole("button", { name: "Send response" }).press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "You appear to be offline. Your answers are still here; reconnect and try again safely.",
  );
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Try saving again" }).press("Enter");
  await expect(page.getByRole("heading", { name: "We saved your place." })).toBeVisible();
  expect(rsvpAttempts).toBe(2);
  expect(mutationIds).toHaveLength(2);
  expect(mutationIds[1]).toBe(mutationIds[0]);
  await assertNoHorizontalOverflow(page);
});
