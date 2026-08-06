/**
 * The shape a guest-list answer may take, as a JSON Schema the provider compiles.
 *
 * Small on purpose, and small by nature: one array of flat objects, no nesting, nothing
 * optional. The three structured-output ceilings that forced `section-selection.ts` to exist
 * — 24 optional parameters, 16 union-typed parameters, and a total compiled grammar size —
 * are nowhere near reached here, so this call needs no narrowing step of its own.
 *
 * Length and range keywords are absent rather than reproduced. The structured-output subset
 * rejects `maxLength`, `minLength`, `minimum`, and `maximum`, so sending them is a 400. The
 * bounds still exist; they are enforced on the way back by `guestPartyInputSchema`, which is
 * the same object `createGuestPartiesAction` validates against. The schema bounds *shape*;
 * the contract decides *validity*.
 */

/** A list of parties is a short answer. Fifty rows of four short fields fit comfortably. */
export const MAX_GUEST_OUTPUT_TOKENS = 4_000;

/**
 * How many questions one unclear list may come back with.
 *
 * The same numbers the drafting intake settled on, and for the same founder decision: a
 * creator has twenty messages a day, so asking one thing per turn would spend the day on an
 * interview. Bounded here rather than in the schema because the structured-output subset
 * rejects `maxItems` outright.
 */
export const MAX_GUEST_QUESTIONS = 5;

/** Long enough for a real question about a list, short enough that five fit in a reply. */
export const MAX_GUEST_QUESTION_CHARACTERS = 200;

/**
 * `singleRecipient` is the Romance branch, and it is expressed by leaving fields out rather
 * than by asking for them and checking the answer.
 *
 * A Romance invitation has exactly one recipient, enforced in `createGuestPartiesAction` and
 * again by migration `0030` at the database. Offering the model a `capacity` it must always
 * answer `1` is offering it a way to be wrong about something that was never its decision —
 * the same reasoning that keeps the RSVP branch out of the document schema.
 */
export function buildGuestPartySchema(singleRecipient: boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    internalLabel: { type: "string" },
    // Nullable rather than optional: "address them the same as the party name" is an answer,
    // and a null costs one union parameter where an absent key would cost an optional one.
    recipientName: { type: ["string", "null"] },
  };

  if (!singleRecipient) {
    properties.capacity = { type: "integer" };
    properties.guestNames = { items: { type: "string" }, type: "array" };
  }

  return {
    additionalProperties: false,
    properties: {
      parties: {
        items: {
          additionalProperties: false,
          properties,
          required: Object.keys(properties),
          type: "object",
        },
        type: "array",
      },
      /**
       * The second outcome, and it costs nothing to offer.
       *
       * The drafting path needed a whole extra call to reach the same two answers, because a
       * whole-invitation grammar will not compile beside anything else. This grammar is one
       * flat array, so a second array of strings sits next to it comfortably — the questions
       * come back from the call that was already being made.
       *
       * Required rather than optional, so it spends nothing against the optional-parameter
       * ceiling. An empty array is how the model says it has nothing to ask.
       */
      questions: { items: { type: "string" }, type: "array" },
    },
    required: ["parties", "questions"],
    type: "object",
  };
}
