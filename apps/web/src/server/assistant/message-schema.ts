/**
 * The shape a written invitation message may take, as a JSON Schema the provider compiles.
 *
 * Small, like the guest-list one and unlike the document one: two strings and an array of
 * strings, no nesting. The three structured-output ceilings that forced `section-selection.ts`
 * into existence — 24 optional parameters, 16 union-typed parameters, and total compiled
 * grammar size — are nowhere near reached, so this needs no narrowing call of its own.
 *
 * Length keywords are absent rather than reproduced. The structured-output subset rejects
 * `maxLength` and `minLength`, so sending them is a 400. The 2,000-character bound still
 * exists and is enforced on the way back by the same schema the save validates against.
 */

/** Two messages of at most 2,000 characters each, plus a short batch of questions. */
export const MAX_MESSAGE_OUTPUT_TOKENS = 2_000;

/**
 * How many questions one unclear request may come back with. The same numbers the drafting
 * intake and the guest-list parser use, from the same founder decision about a
 * twenty-message day.
 */
export const MAX_MESSAGE_QUESTIONS = 5;

/** Long enough for a real question about wording, short enough that five fit in a reply. */
export const MAX_MESSAGE_QUESTION_CHARACTERS = 200;

/**
 * `personalOnly` is the Romance branch, expressed by leaving the field out rather than by
 * asking for it and checking the answer.
 *
 * A Romance invitation has one recipient and the Guest Desk hides the general message for it
 * entirely, preserving whatever general wording was stored before. Offering the model a field
 * whose answer would be discarded is offering it a way to be wrong about something that was
 * never its decision — the same reasoning that keeps `capacity` out of the Romance guest
 * schema.
 */
export function buildShareMessageSchema(personalOnly: boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    // Nullable rather than optional: "leave this one as it is" is an answer, and a null costs
    // one union parameter where an absent key would cost an optional one.
    personal: { type: ["string", "null"] },
    questions: { items: { type: "string" }, type: "array" },
  };

  if (!personalOnly) properties.general = { type: ["string", "null"] };

  return {
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
    type: "object",
  };
}
