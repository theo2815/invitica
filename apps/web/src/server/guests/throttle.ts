import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getGuestLinkHashKey } from "./tokens";

export type PublicRequestScope = "guest-context" | "rsvp" | "view";

// Per-caller budgets for the unauthenticated guest endpoints. A guest link is meant
// to be forwarded, so these are sized to sit well above one household opening an
// invitation, reading it, and replying, while still bounding a flood.
const budgets: Record<PublicRequestScope, { limit: number; windowSeconds: number }> = {
  "guest-context": { limit: 30, windowSeconds: 60 },
  rsvp: { limit: 10, windowSeconds: 60 },
  view: { limit: 60, windowSeconds: 60 },
};

// Vercel sets `x-forwarded-for` at the edge and it is the leftmost entry that is the
// real client. An absent header means a caller we cannot distinguish, so they share
// one bucket rather than escaping the budget entirely.
function callerAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "unattributed";
}

// The address never reaches the database. Only this keyed hash does, domain-separated
// so it cannot collide with a guest-link token hash made from the same secret.
function callerFingerprint(address: string): string {
  return createHmac("sha256", getGuestLinkHashKey())
    .update(`invitica:throttle:v1:${address}`, "utf8")
    .digest("hex");
}

/**
 * Returns false once this caller has exhausted the scope's budget.
 *
 * Fails open. If the throttle itself is unreachable — or migration `0019` has not been
 * applied yet — a guest must still be able to read an invitation and reply, so the
 * request proceeds unthrottled rather than a family losing their RSVP to an
 * infrastructure fault.
 */
export async function consumePublicRequest(
  supabase: SupabaseClient,
  scope: PublicRequestScope,
  request: Request,
): Promise<boolean> {
  const { limit, windowSeconds } = budgets[scope];

  try {
    const { data, error } = await supabase.rpc("consume_public_request", {
      p_bucket_key: `${scope}:${callerFingerprint(callerAddress(request))}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
