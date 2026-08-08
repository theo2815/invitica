/**
 * Browser and Axe evidence for the authentication surfaces.
 *
 * Every prior auth delivery skipped this. Usage, against an already-running dev server so the
 * founder's own `next dev` is not disturbed (Next refuses a second one for the same directory):
 *
 *   node tests/auth-browser-check.mjs <output-dir> http://localhost:3000
 *
 * Covers three routes at three widths in both themes — eighteen combinations. The theme is an
 * httpOnly cookie the root layout stamps onto `<html>`, so it is set on the context rather than
 * through `prefers-color-scheme`, which Invitica deliberately reads nowhere.
 */
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const outputRoot = resolve(process.argv[2] ?? resolve(tmpdir(), "invitica-auth-check"));
const origin = process.argv[3] ?? "http://localhost:3000";

const ROUTES = [
  { heading: "Welcome back", name: "login", path: "/login" },
  { heading: "Create your account", name: "register", path: "/register" },
  { heading: "Choose a new password", name: "reset-password", path: "/reset-password" },
];
const WIDTHS = [
  { height: 900, width: 1440 },
  { height: 844, width: 390 },
  { height: 568, width: 320 },
];
const THEMES = ["light", "dark"];

await mkdir(outputRoot, { recursive: true });

const failures = [];
/** Reported, not failed — see the touch-target block below for why. */
const inlineTargetGaps = new Set();

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const browser = await chromium.launch({ channel: "msedge" });

for (const theme of THEMES) {
  for (const { height, width } of WIDTHS) {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      hasTouch: width < 720,
      isMobile: width < 720,
      reducedMotion: "no-preference",
      viewport: { height, width },
    });
    await context.addCookies([
      { domain: "localhost", name: "invitica-theme", path: "/", value: theme },
    ]);

    for (const route of ROUTES) {
      const label = `${route.name}-${theme}-${width}`;
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await page.goto(`${origin}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { level: 1, name: route.heading }).waitFor();

      // The theme actually reached the document rather than only the cookie jar.
      const stamped = await page.evaluate(() => document.documentElement.dataset.theme);
      assert(stamped === theme, `${label}: <html data-theme> is "${stamped}", expected "${theme}"`);

      const overflow = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        doc: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }));
      assert(
        overflow.body <= overflow.inner && overflow.doc <= overflow.inner,
        `${label}: horizontal overflow ${JSON.stringify(overflow)}`,
      );

      // Terms and Privacy reachable from every one of these routes.
      for (const document of ["/terms", "/privacy"]) {
        const count = await page.locator(`a[href="${document}"]`).count();
        assert(count > 0, `${label}: no link to ${document}`);
      }

      // The strength meter appears once a password is typed, and says the band in words.
      if (route.name !== "login") {
        const field = page.locator('input[name="password"]');
        await field.fill("Willow-marble-thistle-cobalt-41");
        await page.getByText("Password strength:").waitFor();
        const band = await page.getByText("Strong", { exact: true }).count();
        assert(band > 0, `${label}: meter did not report Strong for a generated-shape password`);
        await field.fill("");
      }

      // Touch targets, split two ways deliberately.
      //
      // The primary controls — text inputs, the submit button, the Google button, the show/hide
      // toggle — must clear 44 px and are asserted. The inline text links are a separate case:
      // "Forgot password?" at 18 px, "Create an account" at 15 px, and the header wordmark at
      // 29 px all predate this task, measured against a stashed tree on 2026-08-08. The design
      // skill says 44 px "where practical", and this surface has evidently decided a text link in
      // a label row is not. They are reported so the gap stays visible, not failed, because
      // changing that convention is a design decision rather than this task's business.
      const targets = await page.evaluate(() => {
        const primary = [];
        const inline = [];
        for (const element of document.querySelectorAll("button, a, input, [tabindex]")) {
          const box = element.getBoundingClientRect();
          if (box.width === 0 && box.height === 0) continue;
          if (box.height >= 44) continue;

          const describe = `${element.tagName.toLowerCase()}"${(element.textContent ?? "").trim().slice(0, 30)}" ${Math.round(box.height)}px`;
          const isInlineLink =
            element.tagName === "A" ||
            // A native checkbox whose label carries the 44 px target beside it.
            element.getAttribute("type") === "checkbox" ||
            // Text buttons that sit in a label row alongside those links.
            element.className.includes("generateButton");

          (isInlineLink ? inline : primary).push(describe);
        }
        return { inline, primary };
      });
      assert(
        targets.primary.length === 0,
        `${label}: primary controls under 44 px — ${targets.primary.join("; ")}`,
      );
      if (targets.inline.length > 0) {
        inlineTargetGaps.add(targets.inline.join("; "));
      }

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      assert(
        axe.violations.length === 0,
        `${label}: ${axe.violations.length} Axe violation(s) — ${axe.violations
          .map((violation) => `${violation.id} (${violation.impact})`)
          .join(", ")}`,
      );

      assert(pageErrors.length === 0, `${label}: page error — ${pageErrors.join("; ")}`);

      await page.screenshot({
        fullPage: true,
        path: resolve(outputRoot, `${label}.png`),
      });
      await page.close();
      console.log(`checked ${label}`);
    }

    await context.close();
  }
}

await browser.close();

if (inlineTargetGaps.size > 0) {
  console.log("\nInline text links under 44 px (pre-existing convention, reported not failed):");
  for (const gap of inlineTargetGaps) console.log(`  - ${gap}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\nAll ${ROUTES.length * WIDTHS.length * THEMES.length} combinations clean.`);
console.log(`Screenshots: ${outputRoot}`);
