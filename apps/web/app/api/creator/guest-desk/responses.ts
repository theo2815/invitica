import { NextResponse } from "next/server";

export const creatorGuestResponseHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export function creatorGuestError(message: string, status: number) {
  return NextResponse.json(
    { message, status: "error" },
    { headers: creatorGuestResponseHeaders, status },
  );
}

export async function readJsonRequest(
  request: Request,
  maximumLength: number,
): Promise<{ input: unknown; ok: true } | { ok: false }> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > maximumLength) return { ok: false };
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false };
  }

  try {
    const body = await request.text();
    if (body.length > maximumLength) return { ok: false };
    return { input: JSON.parse(body), ok: true };
  } catch {
    return { ok: false };
  }
}
