import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium } from "@playwright/test";

import { renderFixture } from "./e2e/render-fixture.generated.mjs";

const clientRoot = resolve("apps/viewer/dist/client");
const outputRoot = resolve("apps/web/public/landing/templates");
const { landingTemplateHtml } = renderFixture();
const stillRevision = "svg-20260804";

await mkdir(outputRoot, { recursive: true });

function contentType(pathname) {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "POST" && url.pathname === "/api/public/view") {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }

    const templateId = url.pathname.match(/^\/landing\/([a-z-]+)$/)?.[1];
    const html = templateId ? landingTemplateHtml[templateId] : null;
    if (html) {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; connect-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(html);
      return;
    }

    const assetPath = resolve(clientRoot, url.pathname.slice(1));
    if (!assetPath.startsWith(`${clientRoot}${sep}`)) {
      response.writeHead(404);
      response.end();
      return;
    }

    try {
      const body = await readFile(assetPath);
      response.writeHead(200, {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": contentType(assetPath),
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });

  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Landing still server did not start."));
        return;
      }
      resolveStart({
        close: () =>
          new Promise((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
            server.closeAllConnections();
          }),
        origin: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

const server = await startServer();
console.log("Landing still server ready.");
const browser = await chromium.launch({ channel: "msedge" });
console.log("Headless Edge ready.");

try {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    viewport: { height: 640, width: 360 },
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const templateId of Object.keys(landingTemplateHtml)) {
    console.log(`${templateId}: loading`);
    pageErrors.length = 0;
    await page.goto(`${server.origin}/landing/${templateId}`, {
      waitUntil: "domcontentloaded",
    });
    try {
      await page
        .locator('[data-envelope-hydrated="true"]')
        .waitFor({ state: "attached", timeout: 10_000 });
    } catch (error) {
      throw new Error(
        `The ${templateId} renderer did not hydrate. ${pageErrors.join(" | ") || "No page error was reported."}`,
        { cause: error },
      );
    }
    console.log(`${templateId}: hydrated`);
    const fontStatus = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.status;
    });
    if (fontStatus !== "loaded") {
      throw new Error(`Expected ${templateId} fonts to load; received ${fontStatus}.`);
    }
    console.log(`${templateId}: fonts loaded`);

    const state = await page.locator("[data-opening-state]").getAttribute("data-opening-state");
    if (state !== "closed") {
      throw new Error(`Expected ${templateId} to be captured closed; received ${state}.`);
    }

    await page.screenshot({
      path: resolve(outputRoot, `${templateId}-${stillRevision}.jpg`),
      quality: 86,
      type: "jpeg",
    });
    console.log(`${templateId}: captured`);
  }

  await context.close();
  console.log("Browser context closed.");
} finally {
  await browser.close();
  console.log("Browser closed.");
  await server.close();
  console.log("Landing still server closed.");
}
