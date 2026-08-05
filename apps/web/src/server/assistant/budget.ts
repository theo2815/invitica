import type { SupabaseClient } from "@supabase/supabase-js";

export type AssistantBudgetOutcome =
  | "allowed"
  | "creator_daily_limit"
  | "disabled"
  | "global_monthly_limit"
  | "unavailable";

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
    default:
      return "The assistant is unavailable right now. Try again in a moment.";
  }
}
