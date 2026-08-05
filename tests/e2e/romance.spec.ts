import { expect, test } from "@playwright/test";

const publicIdentifier = "d000000000000000000000000000000d";
const personalizedToken = "R".repeat(43);

function origin(): string {
  const value = process.env.INVITICA_VIEWER_TEST_ORIGIN;
  if (!value) throw new Error("The Viewer test origin is unavailable");
  return value;
}

test("moves No five pointer activations, then requires a decline message", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-android",
    "One mobile browser owns the Romance interaction",
  );
  await page.route("**/api/public/guest-context", (route) =>
    route.fulfill({
      body: JSON.stringify({
        recipientName: "Mia",
        rsvp: { capacity: 1, deadline: null, response: null, status: "open" },
      }),
      contentType: "application/json",
      status: 200,
    }),
  );

  await page.goto(`${origin()}/i/a-little-question-${publicIdentifier}#g=${personalizedToken}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-envelope-hydrated="true"]')).toBeAttached();
  await page.getByRole("button", { name: /Open invitation for/ }).click();
  await page.getByRole("button", { name: "Skip opening" }).click();
  await expect(page.locator('[data-opening-state="opened"]')).toBeAttached();

  const question = page.getByRole("heading", { name: "Will you go on a date with me?" });
  await question.scrollIntoViewIfNeeded();
  const choices = page.locator(".rq-choices");
  const yes = page.getByRole("button", { name: "Yes" });
  const no = page.getByRole("button", { name: "No" });
  const yesBox = await yes.boundingBox();
  const initialNoBox = await no.boundingBox();
  if (!yesBox || !initialNoBox) throw new Error("The response controls are not measurable");
  expect(yesBox.x + yesBox.width).toBeLessThanOrEqual(initialNoBox.x);

  let previousPosition = { x: initialNoBox.x, y: initialNoBox.y };
  for (let step = 1; step <= 5; step += 1) {
    await no.click();
    await expect(choices).toHaveAttribute("data-dodge-step", String(step));
    const nextBox = await no.boundingBox();
    const restingYes = await yes.boundingBox();
    if (!nextBox || !restingYes) throw new Error("The response controls are not measurable");
    expect({ x: nextBox.x, y: nextBox.y }).not.toEqual(previousPosition);
    // Landing on top of Yes takes the other answer away mid-joke. The fifth move used to stop dead
    // center, which covered Yes on any card narrower than about 24rem.
    const covers =
      nextBox.x < restingYes.x + restingYes.width &&
      restingYes.x < nextBox.x + nextBox.width &&
      nextBox.y < restingYes.y + restingYes.height &&
      restingYes.y < nextBox.y + nextBox.height;
    expect(covers, `No overlapped Yes on dodge ${step}`).toBe(false);
    expect(nextBox.width).toBeGreaterThanOrEqual(44);
    expect(nextBox.height).toBeGreaterThanOrEqual(44);
    previousPosition = { x: nextBox.x, y: nextBox.y };
  }

  // The plea is a pointer-only aside, so it must stay out of the accessibility tree entirely.
  await expect(page.locator(".rq-plea")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".rq-plea")).toHaveAttribute("data-shown", "true");

  await no.click();
  const message = page.getByLabel("Please leave a message.");
  await expect(message).toBeFocused();
  await message.fill("   ");
  await page.getByRole("button", { name: "Send no" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a message before sending your answer.");
});

test("reuses the exact Yes submission after an unconfirmed save", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-android",
    "One mobile browser owns the Romance retry contract",
  );
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/public/guest-context", (route) =>
    route.fulfill({
      body: JSON.stringify({
        recipientName: "Mia",
        rsvp: { capacity: 1, deadline: null, response: null, status: "open" },
      }),
      contentType: "application/json",
      status: 200,
    }),
  );
  await page.route("**/api/public/rsvp", async (route) => {
    submissions.push(route.request().postDataJSON());
    if (submissions.length === 1) {
      await route.fulfill({
        body: JSON.stringify({ status: "unavailable" }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        response: {
          attendance: "attending",
          attendeeCount: 1,
          message: "I would love to.",
          revision: 1,
          updatedAt: "2026-08-04T20:00:00+08:00",
        },
      }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto(`${origin()}/i/a-little-question-${publicIdentifier}#g=${personalizedToken}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-envelope-hydrated="true"]')).toBeAttached();
  await page.getByRole("button", { name: /Open invitation for/ }).click();
  await page.getByRole("button", { name: "Skip opening" }).click();
  await page
    .getByRole("heading", { name: "Will you go on a date with me?" })
    .scrollIntoViewIfNeeded();

  await page.getByRole("button", { name: "Yes" }).click();
  const message = page.getByLabel("Add a note, if you would like.");
  await expect(message).toBeFocused();
  await message.fill("I would love to.");
  await page.getByRole("button", { name: "Send yes" }).click();
  await expect(page.getByRole("alert")).toContainText("could not confirm");
  await page.getByRole("button", { name: "Try sending again" }).click();
  await expect(page.getByRole("heading", { name: "Your answer is yes." })).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[1]?.mutationId).toBe(submissions[0]?.mutationId);
  expect(submissions[0]?.message).toBe("I would love to.");
});
