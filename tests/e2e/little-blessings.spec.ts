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
  await expect(
    page.getByRole("list", { name: "Time remaining until the celebration" }),
  ).toBeVisible();
  await expect(page.getByText("seconds", { exact: true })).toBeVisible();
  // This is the general link, which carries no guest token: replies are wanted only from
  // personally invited guests, so the reply page is withheld entirely.
  await expect(page.locator(".lb-rsvp")).toHaveCount(0);
  await expect(page.getByText("Kindly reply by March 28, 2027")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Celebrate with us" })).toHaveCount(0);
  // Everything the guest can still act on is untouched.
  await expect(page.getByRole("heading", { name: "Gift ideas" })).toBeVisible();
  await expect(
    page.getByText("With grateful hearts, thank you for celebrating with us"),
  ).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 240));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const openedAudit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(blockingViolations(openedAudit.violations)).toEqual([]);
  await assertNoHorizontalOverflow(page);
});

test("gives the reply page to a personally invited guest", async ({ page }) => {
  const personalizedToken = "A".repeat(43);
  let contextRequests = 0;
  await page.route("**/api/public/guest-context", async (route) => {
    contextRequests += 1;
    // The capability travels in the fragment and the POST body, never in a request URL.
    expect(route.request().url()).not.toContain(personalizedToken);
    await route.fulfill({
      body: JSON.stringify({
        recipientName: "The Santos Family",
        rsvp: {
          capacity: 4,
          deadline: "2099-12-01T23:59:59+08:00",
          response: null,
          status: "open",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto(`${origin()}${invitationPath}#g=${personalizedToken}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 5000 });

  await expect(page.getByRole("heading", { name: "Celebrate with us" })).toBeVisible();
  await expect(page.getByText("Kindly reply by March 28, 2027")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Joyfully attending" })).toBeVisible();
  expect(contextRequests).toBeGreaterThan(0);

  // The reply page is last, so an invited guest reads the whole invitation before deciding.
  const gifts = await page.getByRole("heading", { name: "Gift ideas" }).boundingBox();
  const reply = await page.getByRole("heading", { name: "Celebrate with us" }).boundingBox();
  if (!gifts || !reply) throw new Error("The reply page is not laid out");
  expect(reply.y).toBeGreaterThan(gifts.y);

  const audit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(blockingViolations(audit.violations)).toEqual([]);
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

test("reads the agenda time-first and mounts gift plates two up like the gallery", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-android", "One phone-sized lane owns the album");
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { height: 844, width: 390 },
  });
  const page = await context.newPage();
  await page.route("**/api/public/view", (route) => route.fulfill({ status: 204 }));
  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 750 });

  // Each agenda line leads with its time, on the same row as the moment rather than above it.
  const firstItem = page.locator(".lb-schedule li").first();
  const time = await firstItem.locator(".lb-schedule-time").boundingBox();
  const title = await firstItem.locator("h3").boundingBox();
  if (!time || !title) throw new Error("The agenda line is not laid out");
  expect(time.x + time.width).toBeLessThanOrEqual(title.x);
  expect(Math.abs(time.y - title.y)).toBeLessThan(time.height);

  // Gift plates share the gallery's track, so they sit two up in rows instead of one full-width
  // picture per line.
  const plates = page.locator(".lb-gift-grid > article");
  const first = await plates.nth(0).boundingBox();
  const second = await plates.nth(1).boundingBox();
  const third = await plates.nth(2).boundingBox();
  const galleryPlate = await page.locator(".lb-gallery-grid figure").first().boundingBox();
  if (!first || !second || !third || !galleryPlate) {
    throw new Error("The picture pages are not laid out");
  }
  expect(second.x).toBeGreaterThan(first.x + first.width - 1);
  expect(Math.abs(second.y - first.y)).toBeLessThan(2);
  expect(third.y).toBeGreaterThan(first.y + first.height - 1);
  expect(Math.abs(first.width - galleryPlate.width)).toBeLessThan(2);

  // The album holds an odd number of photographs, so the last plate sits alone and centred at the
  // width of a paired one rather than stretching across the page or hanging in the left column.
  const photos = page.locator(".lb-gallery-grid figure");
  const photoCount = await photos.count();
  expect(photoCount % 2).toBe(1);
  const lastPhoto = await photos.nth(photoCount - 1).boundingBox();
  const gridBox = await page.locator(".lb-gallery-grid").boundingBox();
  if (!lastPhoto || !gridBox) throw new Error("The album is not laid out");
  expect(Math.abs(lastPhoto.width - galleryPlate.width)).toBeLessThan(2);
  const leftGap = lastPhoto.x - gridBox.x;
  const rightGap = gridBox.x + gridBox.width - (lastPhoto.x + lastPhoto.width);
  expect(leftGap).toBeGreaterThan(1);
  expect(Math.abs(leftGap - rightGap)).toBeLessThan(2);

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

  expect(await page.locator(".lb-gallery-grid figure").count()).toBe(7);
  expect(await page.locator(".lb-gift-grid article").count()).toBe(8);
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

test("loads the venue map only on request and keeps the directions fallback", async ({
  browser,
}, testInfo) => {
  test.skip(
    !["chromium-android", "webkit-mobile"].includes(testInfo.project.name),
    "Chromium and WebKit prove the click-to-load map",
  );
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: testInfo.project.use.viewport ?? { height: 800, width: 360 },
  });
  const page = await context.newPage();
  await page.route("**/api/public/view", (route) => route.fulfill({ status: 204 }));

  // Serve tiles locally so the suite never reaches MapTiler and stays deterministic offline.
  const tileRequests: string[] = [];
  await page.route("https://api.maptiler.com/**", (route) => {
    tileRequests.push(route.request().url());
    return route.fulfill({
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
      contentType: "image/png",
    });
  });

  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 7_000 });

  const directions = page.getByRole("link", { name: "Get directions" }).first();
  await directions.scrollIntoViewIfNeeded();
  await expect(directions).toBeVisible();

  // Nothing is requested before the guest opts in.
  expect(tileRequests).toEqual([]);
  await expect(page.locator(".leaflet-container")).toHaveCount(0);

  const toggle = page.getByRole("button", { name: "Show map" }).first();
  const toggleBox = await toggle.boundingBox();
  expect(toggleBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await toggle.click();

  const map = page.locator(".leaflet-container").first();
  await expect(map).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("region", { name: /^Map of / }).first()).toBeVisible();
  await expect(page.locator(".leaflet-control-attribution").first()).toContainText("OpenStreetMap");
  await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
  await assertNoHorizontalOverflow(page);

  const audit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(blockingViolations(audit.violations)).toEqual([]);

  await page.getByRole("button", { name: "Hide map" }).first().click();
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  await expect(directions).toBeVisible();
  await context.close();
});

test("zooms the venue map with a two-finger pinch", async ({ browser }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-android",
    "One touch-capable Chromium lane proves the pinch gesture",
  );
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { height: 800, width: 360 },
  });
  const page = await context.newPage();
  await page.route("**/api/public/view", (route) => route.fulfill({ status: 204 }));

  // Tile zoom levels are the only externally observable proof that the map actually zoomed.
  const tileZooms: number[] = [];
  await page.route("https://api.maptiler.com/**", (route) => {
    const zoom = Number(new URL(route.request().url()).pathname.split("/")[3]);
    if (Number.isFinite(zoom)) tileZooms.push(zoom);
    return route.fulfill({
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
      contentType: "image/png",
    });
  });

  await page.goto(`${origin()}${invitationPath}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 7_000 });
  await page.getByRole("button", { name: "Show map" }).first().click();
  await expect(page.locator(".leaflet-container").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("pinch with two fingers to zoom")).toBeVisible();
  await expect.poll(() => tileZooms.length).toBeGreaterThan(0);
  const zoomBeforePinch = Math.max(...tileZooms);

  // Two fingers starting close together and spreading apart, dispatched as real TouchEvents so
  // Leaflet's own touch-zoom handler runs rather than a Playwright-level abstraction.
  await page.evaluate(() => {
    const canvas = document.querySelector(".leaflet-container");
    if (!(canvas instanceof HTMLElement)) throw new Error("The map canvas is unavailable");

    const box = canvas.getBoundingClientRect();
    const centreX = box.left + box.width / 2;
    const centreY = box.top + box.height / 2;
    const point = (identifier: number, offset: number) =>
      new Touch({
        clientX: centreX + offset,
        clientY: centreY,
        identifier,
        pageX: centreX + offset,
        pageY: centreY,
        target: canvas,
      });
    const fire = (type: string, offset: number) => {
      const touches = [point(0, -offset), point(1, offset)];
      canvas.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          changedTouches: touches,
          targetTouches: type === "touchend" ? [] : touches,
          touches: type === "touchend" ? [] : touches,
        }),
      );
    };

    fire("touchstart", 20);
    for (const offset of [40, 70, 100, 130]) fire("touchmove", offset);
    fire("touchend", 130);
  });

  await expect
    .poll(() => Math.max(...tileZooms), { timeout: 10_000 })
    .toBeGreaterThan(zoomBeforePinch);
  await assertNoHorizontalOverflow(page);
  await context.close();
});
