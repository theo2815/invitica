import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What a creator has spent of today's allowance.
 *
 * `used` is already clamped to `dailyLimit` by the database, so a creator who kept
 * pressing send past the cap reads twenty of twenty rather than twenty-four of twenty.
 * `resetsAt` is an instant, not words: only the browser knows which clock the creator
 * reads it on.
 */
export interface AssistantUsage {
  dailyLimit: number;
  /** ISO 8601. The next Asia/Manila midnight. */
  resetsAt: string;
  used: number;
}

interface UsageRow {
  daily_limit: number;
  resets_at: string;
  used: number;
}

/**
 * Reads the calling creator's own day. Never writes, so it cannot cost a message.
 *
 * Returns null rather than throwing on any failure. The meter is information about a
 * limit, not the limit itself — enforcement lives in `consume_assistant_message` and is
 * unaffected by whether this succeeds. A creator whose count will not load should see
 * "usage unavailable" beside a working composer, never an error in place of Invi.
 */
export async function readAssistantUsage(supabase: SupabaseClient): Promise<AssistantUsage | null> {
  try {
    const { data, error } = await supabase.rpc("assistant_message_usage");

    if (error) return null;

    // `returns table` arrives as an array of one row. A shape other than that means the
    // function is not the one this code was written against.
    const row = (Array.isArray(data) ? data[0] : data) as undefined | UsageRow;

    if (
      !row ||
      typeof row.used !== "number" ||
      typeof row.daily_limit !== "number" ||
      typeof row.resets_at !== "string"
    ) {
      return null;
    }

    return { dailyLimit: row.daily_limit, resetsAt: row.resets_at, used: row.used };
  } catch {
    return null;
  }
}
