import type { SupabaseClient } from "@supabase/supabase-js";

export type AssistantBudgetOutcome =
  | "allowed"
  | "creator_daily_limit"
  | "disabled"
  | "global_monthly_limit"
  | "misconfigured"
  | "unavailable";

/**
 * Set once the provider has rejected our credentials, and read before any allowance is spent.
 *
 * The budget is deliberately spent *before* the model is called, so a creator past their cap
 * costs nothing. That ordering is right for a working deployment and wrong for a broken one:
 * a rejected key is never billed by the vendor, so charging a message for it takes something
 * from the creator and saves nothing. Twenty bad requests would quietly empty a creator's day
 * against a provider that never charged us a cent.
 *
 * The first failure still costs one message — there is no way to know a key is bad without
 * trying it once. Every request after it is refused for free until the process restarts,
 * which is also when a corrected key would be picked up.
 *
 * Module state, so it resets per instance rather than persisting. That is the conservative
 * direction: the worst case is that it stops helping, not that it latches a working assistant
 * off.
 */
let providerMisconfigured = false;

export function markAssistantMisconfigured(): void {
  providerMisconfigured = true;
}

/** Clears the latch. Exists for tests and for a deliberate retry after a key is corrected. */
export function clearAssistantMisconfigured(): void {
  providerMisconfigured = false;
}

/**
 * The kill switch.
 *
 * On unless `ASSISTANT_ENABLED` is exactly `false`, so turning the feature off is one
 * provider setting and needs no deploy. A missing API key disables it too: without one
 * every request would reach the provider and fail, and a feature that cannot work should
 * not be offered.
 */
export function assistantEnabled(): boolean {
  return process.env.ASSISTANT_ENABLED !== "false" && Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Spends one message from this creator's allowance, before any model call is billed.
 *
 * The creator is derived inside the database from the session, not passed in, so a caller
 * cannot spend someone else's allowance. The caps live in the database for the same reason
 * — an argument would be a budget the browser could set for itself.
 *
 * Fails closed. `consumePublicRequest` lets a guest through when the throttle is
 * unreachable, because losing a family's RSVP to an infrastructure fault is worse than an
 * unthrottled read. Here the unbounded thing is a metered third-party bill, so an
 * unreachable budget refuses.
 */
export async function consumeAssistantMessage(
  supabase: SupabaseClient,
): Promise<AssistantBudgetOutcome> {
  if (!assistantEnabled()) return "disabled";
  // Checked before the RPC, so a broken deployment costs the creator nothing and the
  // database nothing either.
  if (providerMisconfigured) return "misconfigured";

  try {
    const { data, error } = await supabase.rpc("consume_assistant_message");

    if (error) return "unavailable";

    switch (data) {
      case "allowed":
        return "allowed";
      case "creator_daily_limit":
        return "creator_daily_limit";
      case "global_monthly_limit":
        return "global_monthly_limit";
      default:
        return "unavailable";
    }
  } catch {
    return "unavailable";
  }
}

/**
 * The two ceilings reset on different schedules, so they get different wording. Telling a
 * creator to come back tomorrow when the real answer is next month would be a small lie
 * they would catch.
 */
export function budgetRefusalMessage(outcome: Exclude<AssistantBudgetOutcome, "allowed">) {
  switch (outcome) {
    case "creator_daily_limit":
      return "You have used all of today's assistant messages. They refresh tomorrow.";
    case "global_monthly_limit":
      return "The assistant has reached its limit for this month and will be back next month.";
    case "disabled":
      return "The assistant is switched off right now.";
    case "misconfigured":
      // Named as Invitica's fault, and explicit that it is not costing them messages. A
      // creator told to "try again in a moment" would keep spending an allowance on a
      // request that cannot succeed until someone fixes a setting.
      return "The assistant is not set up correctly, so it is unavailable. This is a problem on Invitica's side — it is not using up your daily messages.";
    default:
      return "The assistant is unavailable right now. Try again in a moment.";
  }
}
