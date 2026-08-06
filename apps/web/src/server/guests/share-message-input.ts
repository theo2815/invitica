import { z } from "zod";

import { GENERAL_MESSAGE_TOKENS, PERSONAL_MESSAGE_TOKENS } from "./sharing";

/**
 * What a creator's own invitation wording may contain.
 *
 * It lives here rather than in `actions.ts` for the reason `party-input.ts` does: that file
 * is `"use server"`, where every export must be an async function, so a schema cannot leave
 * it at all. Moving it out is what lets Tala's message writer validate what the model
 * produced against the *same* object `saveInvitationShareMessagesAction` validates the save
 * against, rather than a second copy that drifts the first time a rule changes.
 *
 * That mattering is not hypothetical here. An unrecognised placeholder reaches a guest as
 * literal `{name}` text, and a message without `{link}` is an invitation nobody can open —
 * so a proposal that would fail the save must never be offered as something to keep.
 */

/**
 * A creator-authored message. Blank clears the customisation and restores the generated
 * default, which is why an empty string is accepted rather than rejected.
 */
export function shareMessageSchema(allowed: readonly string[]) {
  return z
    .string()
    .max(2000)
    .transform((value) => value.trim())
    .refine(
      (value) => value === "" || value.includes("{link}"),
      "Keep {link} so guests can open the invitation.",
    )
    .refine((value) => {
      for (const [, token] of value.matchAll(/\{([a-zA-Z]+)\}/g)) {
        // An unrecognised placeholder would be pasted to a guest as literal "{name}" text.
        if (!allowed.includes(token as string)) return false;
      }
      return true;
    }, "Use only the placeholders listed below.")
    .transform((value) => (value === "" ? null : value));
}

export const generalShareMessageSchema = shareMessageSchema(GENERAL_MESSAGE_TOKENS);
export const personalShareMessageSchema = shareMessageSchema(PERSONAL_MESSAGE_TOKENS);
