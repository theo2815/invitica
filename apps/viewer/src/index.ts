import { renderPublicationHtml, renderUnavailableHtml } from "./html";
import { publicIdentifierFromInvitationPath } from "./invitation-path";
import {
  loadActivePublication,
  PublicationStorageError,
  PublicationUnavailableError,
} from "./load-publication";
import { type MediaObjectRequest, parseMediaRequestPath } from "./published-media";
import { IncompatiblePublicationRendererError } from "./published-renderer";

const IMMUTABLE_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

function mediaHeaders(cacheControl: string): Headers {
  return new Headers({
    "cache-control": cacheControl,
    "content-type": "image/webp",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
  });
}

async function serveMedia(
  bucket: R2Bucket,
  media: MediaObjectRequest,
  method: string,
): Promise<Response> {
  if (method !== "GET" && method !== "HEAD") {
    const response = new Response(null, {
      headers: mediaHeaders("private, no-store"),
      status: 405,
    });
    response.headers.set("allow", "GET, HEAD");
    return response;
  }

  let object: R2ObjectBody | null;
  try {
    object = await bucket.get(media.objectKey);
  } catch {
    console.error(JSON.stringify({ event: "viewer_media_storage_failed" }));
    return new Response(null, { headers: mediaHeaders("private, no-store"), status: 503 });
  }

  if (!object) {
    return new Response(null, { headers: mediaHeaders("private, no-store"), status: 404 });
  }

  const headers = mediaHeaders(IMMUTABLE_MEDIA_CACHE_CONTROL);
  headers.set("etag", object.httpEtag);
  return new Response(method === "HEAD" ? null : object.body, { headers, status: 200 });
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  // api.maptiler.com serves the click-to-load venue map's raster tiles as plain images (ADR-006).
  "img-src 'self' data: https://api.maptiler.com",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
].join("; ");

function responseHeaders(cacheControl: string, contentLanguage: string): Headers {
  return new Headers({
    "cache-control": cacheControl,
    "content-language": contentLanguage,
    "content-security-policy": CONTENT_SECURITY_POLICY,
    "content-type": "text/html; charset=utf-8",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy":
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
    "referrer-policy": "no-referrer",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
  });
}

function htmlResponse(body: string, status: number, method: string, headers: Headers): Response {
  return new Response(method === "HEAD" ? null : body, { headers, status });
}

function unavailableResponse(method: string, status = 404): Response {
  return htmlResponse(
    renderUnavailableHtml(),
    status,
    method,
    responseHeaders("private, no-store", "en-PH"),
  );
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    const mediaRequest = parseMediaRequestPath(url.pathname);
    if (mediaRequest) {
      return serveMedia(env.PUBLICATION_BUCKET, mediaRequest, request.method);
    }

    const publicIdentifier = publicIdentifierFromInvitationPath(url.pathname);

    if (!publicIdentifier) {
      return unavailableResponse(request.method);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      const response = unavailableResponse(request.method, 405);
      response.headers.set("allow", "GET, HEAD");
      return response;
    }

    try {
      const artifact = await loadActivePublication(env.PUBLICATION_BUCKET, publicIdentifier, ctx);
      // The snapshot stays keyless and immutable: the map key is injected per response. The
      // request origin is injected for the same reason — link-preview tags need absolute URLs,
      // and only the Worker knows which host served this invitation.
      const html = renderPublicationHtml(
        artifact,
        env.MAPTILER_KEY,
        `${url.origin}${url.pathname}`,
      );

      return htmlResponse(
        html,
        200,
        request.method,
        responseHeaders(
          "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
          artifact.snapshot.document.locale,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof PublicationStorageError) {
        console.error(JSON.stringify({ event: "viewer_publication_storage_failed" }));
        return unavailableResponse(request.method, 503);
      }

      if (
        error instanceof PublicationUnavailableError ||
        error instanceof IncompatiblePublicationRendererError
      ) {
        return unavailableResponse(request.method);
      }

      console.error(JSON.stringify({ event: "viewer_request_failed" }));
      return unavailableResponse(request.method, 503);
    }
  },
} satisfies ExportedHandler<Env>;
