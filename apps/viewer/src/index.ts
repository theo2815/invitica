import { renderPublicationHtml, renderUnavailableHtml } from "./html";
import { publicIdentifierFromInvitationPath } from "./invitation-path";
import {
  loadActivePublication,
  PublicationStorageError,
  PublicationUnavailableError,
} from "./load-publication";
import { IncompatiblePublicationRendererError } from "./published-renderer";

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
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
      const html = renderPublicationHtml(artifact);

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
