import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const upgradedTemplates = [
  {
    id: "garden-promise",
    title: "Mara & Joaquin",
  },
  {
    id: "golden-hour",
    title: "Sam turns XVIII",
  },
  {
    id: "sunday-joy",
    title: "Lia is seven!",
  },
] as const;

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

async function openInvitation(page: Page) {
  await expect(page.locator('[data-envelope-hydrated="true"]')).toBeAttached();
  const opener = page.getByRole("button", { name: /Open invitation for/ });
  const openerBox = await opener.boundingBox();
  expect(openerBox?.height).toBeGreaterThanOrEqual(44);
  await opener.press("Enter");
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({
    timeout: 6_000,
  });
  await expect(page.locator("[data-envelope-focus-target]")).toBeFocused();
}

test("opens every upgraded occasion without horizontal overflow", async ({ page }, testInfo) => {
  test.slow();

  for (const template of upgradedTemplates) {
    await page.goto(`${origin()}/preview/${template.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`[data-template="${template.id}"]`)).toBeAttached();

    if (testInfo.project.name === "chromium-narrow") {
      await page.addStyleTag({ content: ":root { font-size: 200% !important; }" });
    }

    await assertNoHorizontalOverflow(page);
    await openInvitation(page);
    await expect(page.getByRole("heading", { name: template.title })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  }
});

/**
 * The Garden Promise section reveal is transform-only on purpose. A scroll-linked opacity ramp is a
 * state a guest can stop inside, and a partly faded section drops its body text below AA on this
 * palette. Every section must therefore read at full opacity before and during scrolling, not only
 * once its reveal completes.
 */
test("reveals Garden Promise sections without ever fading their text", async ({
  page,
}, testInfo) => {
  test.skip(
    !["chromium-android", "edge-desktop"].includes(testInfo.project.name),
    "View timelines drive the section reveal, so one mobile and one desktop Chromium engine own it",
  );

  await page.goto(`${origin()}/preview/garden-promise`, { waitUntil: "domcontentloaded" });
  await openInvitation(page);

  const sections = page.locator('[data-template="garden-promise"] .ot-section');
  const total = await sections.count();
  expect(total).toBeGreaterThan(0);

  const opacities = async () =>
    sections.evaluateAll((nodes) => nodes.map((node) => Number(getComputedStyle(node).opacity)));

  // Unscrolled: sections below the fold sit at the start of their reveal.
  for (const opacity of await opacities()) expect(opacity).toBe(1);

  for (let index = 0; index < total; index += 1) {
    await sections.nth(index).scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    for (const opacity of await opacities()) expect(opacity).toBe(1);
  }
});

test("passes blocking WCAG A and AA checks closed and opened", async ({ page }, testInfo) => {
  test.skip(
    !["chromium-android", "firefox-desktop"].includes(testInfo.project.name),
    "One mobile and one desktop engine own the expanded occasion audits",
  );
  test.slow();

  for (const template of upgradedTemplates) {
    await page.goto(`${origin()}/preview/${template.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-envelope-hydrated="true"]')).toBeAttached();

    const closedAudit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(blockingViolations(closedAudit.violations)).toEqual([]);

    await openInvitation(page);
    const openedAudit = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(blockingViolations(openedAudit.violations)).toEqual([]);
  }
});

test("opens immediately when reduced motion is requested", async ({ browser }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-android",
    "One mobile engine owns the reduced-motion contract",
  );

  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { height: 800, width: 360 },
  });
  const page = await context.newPage();

  for (const template of upgradedTemplates) {
    await page.goto(`${origin()}/preview/${template.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-motion-enabled="false"]')).toBeAttached();
    await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
    await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 750 });
    await expect(page.getByRole("button", { name: "Skip opening" })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
  }

  await context.close();
});
