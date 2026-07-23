import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const publicIdentifier = "e000000000000000000000000000000e";
const invitationPath = `/i/alexandria-and-maximiliano-${publicIdentifier}`;
const personalizedToken = "A".repeat(43);
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

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

async function skipOpening(page: Page) {
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await page.getByRole("button", { name: "Skip opening" }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached();
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
  await skipOpening(page);
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
  await skipOpening(page);

  const sendResponse = page.getByRole("button", { name: "Send response" });
  await sendResponse.scrollIntoViewIfNeeded();
  await expect(sendResponse).toBeVisible();
  const box = await sendResponse.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  await assertNoHorizontalOverflow(page);
});

test("keeps opening and skip controls usable in landscape", async ({ browser }, testInfo) => {
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
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  const skip = page.getByRole("button", { name: "Skip opening" });
  const skipBox = await skip.boundingBox();
  expect(skipBox).not.toBeNull();
  expect(skipBox?.height).toBeGreaterThanOrEqual(44);
  expect(skipBox?.y).toBeGreaterThanOrEqual(0);
  expect((skipBox?.y ?? 0) + (skipBox?.height ?? 0)).toBeLessThanOrEqual(360);
  await skip.press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached();
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
    await skipOpening(page);
    await expect(page.getByText("Hiraya Garden Pavilion")).toBeVisible();
    await assertNoHorizontalOverflow(page);
  } finally {
    await session.detach();
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

  await page.context().setOffline(false);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".gp-recipient-line strong")).toHaveText("The Santos Family");
  await skipOpening(page);
  await page.getByRole("spinbutton", { name: "Guests attending" }).fill("2");
  await page
    .getByRole("textbox", { name: /Message to the hosts/ })
    .fill("Looking forward to celebrating.");
  await page.getByRole("button", { name: "Send response" }).press("Enter");
  await expect(page.getByRole("alert")).toHaveText(
    "Your response could not be saved. Check your connection and try again.",
  );
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Send response" }).press("Enter");
  await expect(page.getByRole("heading", { name: "We saved your place." })).toBeVisible();
  expect(mutationIds).toHaveLength(2);
  expect(mutationIds[1]).toBe(mutationIds[0]);
  await assertNoHorizontalOverflow(page);
});
