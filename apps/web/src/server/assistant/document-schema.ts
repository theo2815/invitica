import {
  attireSectionSchema,
  countdownSectionSchema,
  eventDetailsSectionSchema,
  gallerySectionSchema,
  giftsSectionSchema,
  guidanceSectionSchema,
  heroSectionSchema,
  type InvitationDocument,
  type InvitationSection,
  messageSectionSchema,
  participantsSectionSchema,
  rsvpSectionSchema,
  scheduleSectionSchema,
} from "@invitica/invitation-schema";
import type { TemplateManifest } from "@invitica/template-kit";
import { z } from "zod";

/**
 * The shape a document proposal may take, derived per draft.
 *
 * Two separate jobs are kept apart here on purpose. This schema bounds what the model is
 * *able to emit* — which sections exist, which fields they carry, which values are legal.
 * Whether what it emitted is a *valid invitation* is decided afterwards, by the same
 * `sectionDocumentDetailsSchema` and `parseInvitationDocument` the editor and the database
 * already enforce. Nothing here is a trust boundary; the contract is.
 *
 * That split is also why the length limits are stripped below rather than reproduced: the
 * structured-output subset rejects `maxLength` and friends, and duplicating "120 characters"
 * in a second place would only create somewhere for the two to disagree.
 */

/** Section types the section-document editor can save. `venue` is legacy and not one. */
type ProposableSection = Exclude<InvitationSection["type"], "venue">;

/**
 * Fields a proposal may never set, and where each one comes from instead.
 *
 * Every entry names media or a map pin — things that exist because a creator uploaded a
 * file or dropped a marker. A model that invents an asset id produces a document that
 * fails publication, and a model that invents coordinates puts a confident pin on the
 * wrong building. Both are carried over from the draft rather than proposed.
 */
const CARRIED_EVENT_FIELDS = ["latitude", "longitude"] as const;

const proposableProps = {
  attire: attireSectionSchema.shape.props,
  countdown: countdownSectionSchema.shape.props,
  "event-details": eventDetailsSectionSchema.shape.props.extend({
    events: z
      .array(
        eventDetailsSectionSchema.shape.props.shape.events.element.omit({
          latitude: true,
          longitude: true,
        }),
      )
      .min(1)
      .max(4),
  }),
  // The album's photographs stay exactly as the creator uploaded them; only the words
  // around them are proposable.
  gallery: gallerySectionSchema.shape.props.omit({ images: true }),
  gifts: giftsSectionSchema.shape.props.extend({
    items: z
      .array(giftsSectionSchema.shape.props.shape.items.element.omit({ imageAssetId: true }))
      .min(1)
      .max(8),
  }),
  guidance: guidanceSectionSchema.shape.props,
  hero: heroSectionSchema.shape.props.omit({ imageAssetId: true }),
  message: messageSectionSchema.shape.props,
  participants: participantsSectionSchema.shape.props,
  rsvp: rsvpSectionSchema.shape.props,
  schedule: scheduleSectionSchema.shape.props,
} as const satisfies Record<ProposableSection, z.ZodType>;

/**
 * Keywords the structured-output subset does not accept. Sending one is a 400, so they are
 * removed rather than left for the provider to reject. `$schema` goes too — the request
 * carries the schema inline and does not dereference a dialect.
 */
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "multipleOf",
  "pattern",
]);

function stripUnsupportedKeywords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUnsupportedKeywords);
  if (typeof value !== "object" || value === null) return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    result[key] = stripUnsupportedKeywords(entry);
  }
  return result;
}

/**
 * The section types this draft can actually receive.
 *
 * Intersected rather than taken from either side alone: the manifest says what the template
 * allows, and the document says what this particular draft contains. `applySectionDocumentDetails`
 * rejects anything outside the second set, so proposing against the first would invite a
 * refusal the creator never caused.
 */
export function proposableSections(
  document: InvitationDocument,
  manifest: TemplateManifest,
): ProposableSection[] {
  const allowed = new Set<string>(manifest.allowedSections);

  return document.sections
    .map((section) => section.type)
    .filter((type): type is ProposableSection => type !== "venue" && allowed.has(type))
    .filter((type) => type in proposableProps);
}

/**
 * The JSON Schema one proposal must satisfy, for this draft and no other.
 *
 * Every section is optional: a creator who says "the reception moved to 6pm" should get a
 * proposal that touches the schedule and leaves their vows alone. A section the model does
 * not name keeps whatever the draft already holds.
 */
export function buildProposalSchema(
  document: InvitationDocument,
  manifest: TemplateManifest,
): Record<string, unknown> {
  const sections = proposableSections(document, manifest);

  const shape = Object.fromEntries(
    sections.map((type) => [
      type,
      z
        .strictObject({
          props: proposableProps[type],
          visible: z.boolean(),
        })
        .optional(),
    ]),
  );

  const schema = z.toJSONSchema(z.strictObject(shape), {
    io: "input",
    // A refinement has no JSON Schema equivalent. Dropping the constraint is correct here
    // precisely because this schema is not the validation boundary — the contract still
    // applies every refinement on the way back.
    unrepresentable: "any",
  });

  return stripUnsupportedKeywords(schema) as Record<string, unknown>;
}

export { CARRIED_EVENT_FIELDS, type ProposableSection };
