import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { FullConfig } from "@playwright/test";

import { renderFixture } from "./render-fixture.generated.mjs";

const clientRoot = resolve("apps/viewer/dist/client");
const publicIdentifier = "e000000000000000000000000000000e";
const littleBlessingsIdentifier = "f000000000000000000000000000000f";
const romanceIdentifier = "d000000000000000000000000000000d";

// Tiny solid-color WebP bodies (64x64) standing in for immutable publication
// renditions so browser lanes can load real image bytes without object storage.
const mediaBodies = {
  gold: Buffer.from(
    "UklGRlAAAABXRUJQVlA4IEQAAACwAwCdASpAAEAAPrVaqU+nJSOiIggA4BaJaQDRvAWa6wAV4hcTgAD+5+S/195Q7EE/K0V0uWBDadMo3R3WmGKQAAAAAA==",
    "base64",
  ),
  ivory: Buffer.from(
    "UklGRj4AAABXRUJQVlA4IDIAAACQAwCdASpAAEAAPrVaqVAnJSOioggA4BaJaQAAEDdTUAV4hbkAAP7yyn03i3FAAAAAAA==",
    "base64",
  ),
  sage: Buffer.from(
    "UklGRkoAAABXRUJQVlA4ID4AAACwAwCdASpAAEAAPrVaqVAnJSQioggA4BaJaQDOsAWa6ydeYxC3IAD+pNa0iEAlX6PtvpZHdcCDFUwAAAAAAA==",
    "base64",
  ),
};

function mediaBody(sha256: string): Buffer {
  const shaIndex = Number.parseInt(sha256.slice(0, 2), 16);
  if (shaIndex === 1) {
    return mediaBodies.sage;
  }
  return shaIndex >= 10 ? mediaBodies.gold : mediaBodies.ivory;
}
function contentType(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

export default async function globalSetup(_config: FullConfig) {
  const { landingTemplateHtml, littleBlessingsHtml, publicationHtml, unavailableHtml } =
    renderFixture();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "POST" && url.pathname === "/api/public/view") {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }

    if (url.pathname.startsWith("/preview/")) {
      const templateId = url.pathname.slice("/preview/".length);
      const body = landingTemplateHtml[templateId];
      response.writeHead(body ? 200 : 404, {
        "cache-control": body ? "public, max-age=0" : "private, no-store",
        "content-security-policy":
          "default-src 'none'; connect-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'",
        "content-type": "text/html; charset=utf-8",
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      });
      response.end(body ?? unavailableHtml);
      return;
    }

    if (url.pathname.startsWith("/i/")) {
      const body = url.pathname.endsWith(publicIdentifier)
        ? publicationHtml
        : url.pathname.endsWith(littleBlessingsIdentifier)
          ? littleBlessingsHtml
          : url.pathname.endsWith(romanceIdentifier)
            ? landingTemplateHtml["a-little-question"]
            : null;
      response.writeHead(body ? 200 : 404, {
        "cache-control": body ? "public, max-age=0" : "private, no-store",
        "content-security-policy":
          "default-src 'none'; connect-src 'self'; font-src 'self'; img-src 'self' data: https://api.maptiler.com; script-src 'self'; style-src 'self' 'unsafe-inline'",
        "content-type": "text/html; charset=utf-8",
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      });
      response.end(body ?? unavailableHtml);
      return;
    }

    const mediaMatch = url.pathname.match(/^\/m\/v1\/([0-9a-f]{64})\/w\d{3,4}\.webp$/);
    if (mediaMatch?.[1]) {
      response.writeHead(200, {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": "image/webp",
        "x-content-type-options": "nosniff",
      });
      response.end(mediaBody(mediaMatch[1]));
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

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Viewer test server did not start");
  process.env.INVITICA_VIEWER_TEST_ORIGIN = `http://127.0.0.1:${address.port}`;

  return async () => {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  };
}
