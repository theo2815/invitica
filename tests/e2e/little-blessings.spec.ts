import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const littleBlessingsIdentifier = "f000000000000000000000000000000f";
const invitationPath = `/i/eliana-grace-${littleBlessingsIdentifier}`;
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

test.beforeEach(async ({ page }) => {
  await page.route("**/api/public/view", (route) => route.fulfill({ status: 204 }));
});

test("covers the viewport closed, opens, and passes blocking WCAG checks", async ({ page }) => {
  const response = await page.goto(`${origin()}${invitationPath}`, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-render-mode="published"]')).toBeAttached();
  await expect(page.locator('[data-envelope-variant="little-blessings"]')).toBeAttached();

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const closedOpening = await page.locator("[data-envelope-opening]").boundingBox();
  expect(closedOpening).not.toBeNull();
  expect(closedOpening?.width ?? 0).toBeGreaterThanOrEqual((viewport?.width ?? 0) - 1);
  expect(closedOpening?.height ?? 0).toBeGreaterThanOrEqual((viewport?.height ?? 0) - 1);

  const closedAudit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(blockingViolations(closedAudit.violations)).toEqual([]);

  const opener = page.getByRole("button", { name: /Open invitation for/ });
  const openerBox = await opener.boundingBox();
  expect(openerBox?.height).toBeGreaterThanOrEqual(44);
  await opener.press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 7_000 });
  await expect(page.locator("[data-envelope-focus-target]")).toBeFocused();

  await expect(page.getByRole("heading", { name: "Eliana Grace" })).toBeVisible();
  const heroImage = page.locator(".lb-hero img");
  await expect(heroImage).toBeVisible();
  expect(await heroImage.getAttribute("src")).toMatch(/^\/m\/v1\/[0-9a-f]{64}\/w\d{3,4}\.webp$/);
  expect(await heroImage.getAttribute("srcset")).toContain("320w");
  await expect(page.getByText("New Hope Community Church")).toBeVisible();
  await expect(page.getByText("The Sunlit Hall")).toBeVisible();
  await expect(page.getByText(/to go$|The celebration day is here/)).toBeVisible();
  await expect(page.getByText("Kindly reply by March 28, 2027")).toBeVisible();
  await expect(
    page.getByText("With grateful hearts, thank you for celebrating with us"),
  ).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 240));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const openedAudit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(blockingViolations(openedAudit.violations)).toEqual([]);
  await assertNoHorizontalOverflow(page);
});

test("opens, navigates, and closes the gallery lightbox accessibly", async ({
  browser,
}, testInfo) => {
  test.skip(
    !["chromium-narrow", "edge-desktop", "webkit-mobile"].includes(testInfo.project.name),
    "Narrow Chromium, WebKit, and Edge lanes prove the lightbox",
  );
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: testInfo.project.use.viewport ?? { height: 800, width: 320 },
  });
  const page = await context.newPage();
  await page.route("**/api/public/view", (route) => route.fulfill({ status: 204 }));
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 750 });

  const firstTrigger = page.getByRole("button", {
    name: "View photo: Eliana resting in a light blanket",
  });
  await firstTrigger.scrollIntoViewIfNeeded();
  await firstTrigger.click();

  const dialog = page.getByRole("dialog", { name: /Photo:/ });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close photo view" })).toBeFocused();
  await expect(dialog.locator("img")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("dialog", { name: "Photo: Eliana smiling during family time" }),
  ).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("dialog", { name: "Photo: Eliana resting in a light blanket" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Next photo" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Previous photo" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(firstTrigger).toBeFocused();
  await assertNoHorizontalOverflow(page);
  await context.close();
});

test("keeps resolved images and event details readable without JavaScript", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-narrow", "One narrow engine proves the fallback");
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { height: 800, width: 320 },
  });
  const page = await context.newPage();
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Eliana Grace" })).toBeVisible();
  await expect(page.getByText("New Hope Community Church")).toBeVisible();
  await expect(page.getByText("Sunday, April 11, 2027 at 9:00 AM")).toBeVisible();
  expect(await page.locator("[data-envelope-gated]").getAttribute("inert")).toBeNull();
  expect(await page.locator(".lb-hero img").getAttribute("src")).toContain("/m/v1/");
  await assertNoHorizontalOverflow(page);
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
  await page.route("**/api/public/view", (route) => route.fulfill({ status: 204 }));
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-motion-enabled="false"]')).toBeAttached();

  const startedAt = Date.now();
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 750 });
  expect(Date.now() - startedAt).toBeLessThan(750);
  await expect(page.locator("[data-envelope-focus-target]")).toBeFocused();
  await assertNoHorizontalOverflow(page);
  await context.close();
});

test("keeps maximum media, gifts, and RSVP guidance usable at 200 percent text", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-narrow", "The 320px lane owns text scaling");
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { height: 800, width: 320 },
  });
  const page = await context.newPage();
  await page.route("**/api/public/view", (route) => route.fulfill({ status: 204 }));
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: ":root { font-size: 200% !important; }" });
  await assertNoHorizontalOverflow(page);
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 750 });

  expect(await page.locator(".lb-gallery-grid figure").count()).toBe(8);
  expect(await page.locator(".lb-gift-grid article").count()).toBe(6);
  const giftHeading = page.getByRole("heading", { name: "Gift ideas" });
  await giftHeading.scrollIntoViewIfNeeded();
  await expect(giftHeading).toBeVisible();
  await expect(page.getByText("Use your personalized invitation link to respond")).toBeAttached();
  await assertNoHorizontalOverflow(page);
  await context.close();
});

test("keeps the closed scene and opening usable in landscape", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "One Chromium lane proves landscape");
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 360, width: 800 },
  });
  const page = await context.newPage();
  await page.route("**/api/public/view", (route) => route.fulfill({ status: 204 }));
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await assertNoHorizontalOverflow(page);

  const closedOpening = await page.locator("[data-envelope-opening]").boundingBox();
  expect(closedOpening?.width ?? 0).toBeGreaterThanOrEqual(799);
  expect(closedOpening?.height ?? 0).toBeGreaterThanOrEqual(359);
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 7_000 });
  await assertNoHorizontalOverflow(page);
  await context.close();
});
