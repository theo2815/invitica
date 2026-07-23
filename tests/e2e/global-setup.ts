import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { FullConfig } from "@playwright/test";

import { renderFixture } from "./render-fixture.generated.mjs";

const clientRoot = resolve("apps/viewer/dist/client");
const publicIdentifier = "e000000000000000000000000000000e";
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
  const { publicationHtml, unavailableHtml } = renderFixture();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "POST" && url.pathname === "/api/public/view") {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }

    if (url.pathname.startsWith("/i/")) {
      const valid = url.pathname.endsWith(publicIdentifier);
      response.writeHead(valid ? 200 : 404, {
        "cache-control": valid ? "public, max-age=0" : "private, no-store",
        "content-security-policy":
          "default-src 'none'; connect-src 'self'; font-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'",
        "content-type": "text/html; charset=utf-8",
        "referrer-policy": "no-referrer",
        "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      });
      response.end(valid ? publicationHtml : unavailableHtml);
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
