import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const upgradedTemplates = [
  {
    dataTemplate: "garden-promise",
    id: "garden-promise",
    title: "Mara & Joaquin",
  },
  {
    dataTemplate: "golden-hour",
    id: "golden-hour",
    title: "Sam turns XVIII",
  },
  {
    dataTemplate: "sunday-joy",
    id: "sunday-joy",
    title: "Lia is seven!",
  },
  {
    dataTemplate: "little-question",
    id: "a-little-question",
    title: "A little question",
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
    await expect(page.locator(`[data-template="${template.dataTemplate}"]`)).toBeAttached();

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

/**
 * Four regressions the occasion envelope shipped with, none of them visible to markup assertions.
 *
 * 1. Tucking the card fully inside fixed the shelf under the closed state but left nothing to raise
 *    it before the takeover blanked it, so the card never appeared.
 * 2. The occasion flap rule set `opacity: 1` across the later phases at exactly the shared takeover
 *    rule's specificity; later in the cascade, it won, and the flipped flap stayed over the hero.
 * 3. The card was left behind the envelope's face, so only a clipped sliver of it ever showed. It
 *    has to finish fully visible in front, which needs real forward depth and not just a z-index:
 *    the envelope is a preserve-3d context, so against the flipped flap the browser sorts by depth.
 * 4. The skip control is the one piece of opening chrome the shared takeover never fades, so it sat
 *    on top of the invitation while the scene overlaid the hero.
 *
 * Sampling is anchored to the state attribute inside the page rather than to the clock. A fixed
 * delay overshoots into `opened`, where the scene is `display: none` and computed opacity reverts to
 * the non-takeover value — which reports a pass for the exact bugs this guards.
 *
 * Golden Hour is excluded: it is a sleeve and has no flap.
 */
test("lifts the card out of the envelope and leaves nothing painted over the hero", async ({
  page,
}, testInfo) => {
  test.skip(
    !["chromium-android", "edge-desktop"].includes(testInfo.project.name),
    "One mobile and one desktop engine own the opening handoff",
  );

  for (const templateId of ["garden-promise", "sunday-joy"]) {
    await page.goto(`${origin()}/preview/${templateId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-envelope-hydrated="true"]')).toBeAttached();

    const observed = page.evaluate(
      () =>
        new Promise<{
          cardClearsEnvelope: number;
          cardOpaqueWhileOpening: boolean;
          cardHasForwardDepth: boolean;
          flapOpacityAtHandover: number;
          skipOpacityAtHandover: number;
        }>((settle) => {
          const root = document.querySelector("[data-opening-state]");
          const flap = document.querySelector(".ie-envelope-flap");
          const letter = document.querySelector(".ie-letter");
          const envelope = document.querySelector(".ie-envelope");
          if (!root || !flap || !letter || !envelope) {
            throw new Error("Opening scene is incomplete");
          }

          let cardClearsEnvelope = Number.NEGATIVE_INFINITY;
          let cardHasForwardDepth = false;
          let cardOpaqueWhileOpening = false;
          let flapOpacityAtHandover = 1;
          let skipOpacityAtHandover = 1;
          // A timer, not requestAnimationFrame: under load rAF is throttled hard enough that a
          // whole 900 ms phase can yield a single callback, and one early sample says nothing about
          // where the card ended up.
          const timer = setInterval(() => {
            const state = root.getAttribute("data-opening-state");
            const clearance =
              envelope.getBoundingClientRect().top - letter.getBoundingClientRect().top;

            if (state === "opening" || state === "letter-revealing") {
              // Both rects come from the same frame, so the envelope's own motion cannot skew it.
              cardClearsEnvelope = Math.max(cardClearsEnvelope, clearance);
            }
            if (state === "opening" || state === "letter-revealing") {
              const cardStyle = getComputedStyle(letter);
              // Stacking order plus real forward depth. Both are needed and neither is sufficient:
              // z-index alone lost to the flap, because inside a preserve-3d envelope the browser
              // sorts siblings by depth. A 2D transform reports no matrix3d and so scores zero here,
              // which is exactly the state the bug left the card in.
              const matrix = cardStyle.transform;
              const parts = matrix.startsWith("matrix3d(")
                ? matrix.slice(9, -1).split(",").map(Number)
                : [];
              const depth = parts.length === 16 ? (parts[14] ?? 0) : 0;
              const front = document.querySelector(".ie-envelope-front");
              const frontIndex = front ? Number(getComputedStyle(front).zIndex) : 0;
              if (depth > 0 && Number(cardStyle.zIndex) > frontIndex) cardHasForwardDepth = true;
              if (state === "opening" && Number(cardStyle.opacity) === 1) {
                cardOpaqueWhileOpening = true;
              }
            }
            // Overwritten every tick, so the values that survive are the last ones before the
            // scene hands over to the hero.
            if (state === "letter-revealing") {
              flapOpacityAtHandover = Number(getComputedStyle(flap).opacity);
              const skip = document.querySelector(".ie-skip-opening");
              if (skip) skipOpacityAtHandover = Number(getComputedStyle(skip).opacity);
            }
            if (state === "opened") {
              clearInterval(timer);
              settle({
                cardClearsEnvelope,
                cardHasForwardDepth,
                cardOpaqueWhileOpening,
                flapOpacityAtHandover,
                skipOpacityAtHandover,
              });
            }
          }, 16);
        }),
    );

    await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
    const {
      cardClearsEnvelope,
      cardHasForwardDepth,
      cardOpaqueWhileOpening,
      flapOpacityAtHandover,
      skipOpacityAtHandover,
    } = await observed;

    // The note has to come out of the envelope, be the thing on top while it does, and still be
    // opaque at that point. Miss any one of those and the guest never actually reads it.
    expect(cardClearsEnvelope).toBeGreaterThan(20);
    expect(cardHasForwardDepth).toBe(true);
    expect(cardOpaqueWhileOpening).toBe(true);
    expect(flapOpacityAtHandover).toBeLessThan(0.02);
    expect(skipOpacityAtHandover).toBeLessThan(0.02);

    await expect(page.locator("[data-envelope-opening]")).toBeHidden();
  }
});

test("clears addressed-pocket copy before the card rises", async ({ page }, testInfo) => {
  test.skip(
    !["chromium-android", "edge-desktop"].includes(testInfo.project.name),
    "One mobile and one desktop engine own the pocket-address handoff",
  );

  for (const templateId of ["garden-promise", "sunday-joy"]) {
    await page.goto(`${origin()}/preview/${templateId}`, { waitUntil: "domcontentloaded" });
    const root = page.locator("[data-opening-state]");
    await expect(page.locator("[data-envelope-hydrated=true]")).toBeAttached();
    await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
    await expect(root).toHaveAttribute("data-opening-state", "opening", { timeout: 2_000 });

    for (const selector of [
      ".oe-address",
      ".ie-opening-kicker",
      ".ie-recipient-line",
      ".ie-opening-hint",
    ]) {
      await expect(page.locator(selector)).toHaveCSS("opacity", "0", { timeout: 500 });
    }
  }
});

test("clears Golden Hour opener copy before its card rises", async ({ page }, testInfo) => {
  test.skip(
    !["chromium-android", "edge-desktop"].includes(testInfo.project.name),
    "One mobile and one desktop engine own the sleeve-copy handoff",
  );

  await page.goto(`${origin()}/preview/golden-hour`, { waitUntil: "domcontentloaded" });
  const root = page.locator("[data-opening-state]");
  await expect(page.locator("[data-envelope-hydrated=true]")).toBeAttached();
  await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");
  await expect(root).toHaveAttribute("data-opening-state", "opening", { timeout: 2_000 });

  for (const selector of [".ie-opening-kicker", ".ie-recipient-line", ".ie-opening-hint"]) {
    await expect(page.locator(selector)).toHaveCSS("opacity", "0", { timeout: 500 });
  }
});

/**
 * The occasion opening runs 2.65 s, past the 2.2 s the design reference accepts on its own. The
 * founder approved the longer sequence on the condition that it always offers a way out, so the
 * control must exist, be reachable at 44 px, and land the guest in the invitation.
 */
test("offers a reachable skip control while the opening runs", async ({ page }, testInfo) => {
  test.skip(
    !["chromium-android", "edge-desktop"].includes(testInfo.project.name),
    "One mobile and one desktop engine own the skip contract",
  );

  for (const template of upgradedTemplates) {
    await page.goto(`${origin()}/preview/${template.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-envelope-hydrated="true"]')).toBeAttached();
    await page.getByRole("button", { name: /Open invitation for/ }).press("Enter");

    const skip = page.getByRole("button", { name: "Skip opening" });
    await expect(skip).toBeVisible();
    const skipBox = await skip.boundingBox();
    expect(skipBox?.height).toBeGreaterThanOrEqual(44);

    await skip.click();
    await expect(page.locator('[data-opening-state="opened"]')).toBeAttached({ timeout: 2_000 });
    await expect(page.getByRole("heading", { name: template.title })).toBeVisible();
    await assertNoHorizontalOverflow(page);
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
