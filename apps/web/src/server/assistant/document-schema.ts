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
const CARRIED_EVENT_FIELDS = ["latitude", "longitude", "mapUrl"] as const;

/** The palette fields on attire, carried for the same reason the map pin is. */
const CARRIED_ATTIRE_FIELDS = ["colors"] as const;

const attireProps = attireSectionSchema.shape.props;
const eventItem = eventDetailsSectionSchema.shape.props.shape.events.element;

const proposableProps = {
  // Colours are hex values a creator chose to match their invitation. A model has no way to
  // see the design it would be picking against, so both palettes are carried like the map
  // pin rather than proposed.
  attire: attireProps.omit({ colors: true }).extend({
    groups: z
      .array(attireProps.shape.groups.unwrap().element.omit({ colors: true }))
      .min(1)
      .max(4)
      .optional(),
  }),
  countdown: countdownSectionSchema.shape.props,
  "event-details": eventDetailsSectionSchema.shape.props.extend({
    events: z
      .array(eventItem.omit({ latitude: true, longitude: true, mapUrl: true }))
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
  schedule: scheduleSectionSchema.shape.props,
} as const satisfies Record<Exclude<ProposableSection, "rsvp">, z.ZodType>;

/**
 * The RSVP branch this draft is already on.
 *
 * `rsvpSectionSchema.shape.props` is a union: a plain reply section, or the romantic
 * question with its own decline-button behaviour. Which one a draft uses is a template
 * decision the creator made when they picked the occasion, not a thing an assistant should
 * switch while rewording a deadline — so the schema offers the branch they are on and no
 * other. It also halves what the union costs, which matters more than it should here.
 */
function rsvpPropsSchema(document: InvitationDocument): z.ZodType {
  const [standard, romantic] = rsvpSectionSchema.shape.props.options;
  const current = document.sections.find((section) => section.type === "rsvp");
  const romanticQuestion =
    current?.type === "rsvp" &&
    "responseMode" in current.props &&
    current.props.responseMode === "romantic-question";

  return romanticQuestion ? romantic : standard;
}

function propsSchemaFor(type: ProposableSection, document: InvitationDocument): z.ZodType {
  return type === "rsvp" ? rsvpPropsSchema(document) : proposableProps[type];
}

/**
 * Every section a proposal can carry. `rsvp` is absent from `proposableProps` because its
 * shape depends on the draft, so membership is asked here rather than of that record —
 * asking the record directly is what silently dropped RSVP from the offer once already.
 */
const PROPOSABLE_SECTIONS = new Set<string>([...Object.keys(proposableProps), "rsvp"]);

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
 * The two ceilings a structured-output schema has to fit under at once, both discovered by
 * a 400 from a live call rather than read anywhere. Each counts across the whole schema,
 * and counts each branch of a union separately.
 *
 * They pull against each other, which is the thing to understand before changing any of
 * this. Making an optional field required-and-nullable moves it off the first budget and
 * onto the second; it does not make it free. The widest templates carry 28 optional fields
 * inside their sections plus 11 sections, so neither budget absorbs everything alone and
 * the shape below is the split that fits with room on both.
 */
export const MAX_OPTIONAL_PARAMETERS = 24;
export const MAX_UNION_PARAMETERS = 16;

/**
 * Rewrites the top-level section keys as required-and-nullable, leaving everything nested
 * inside them optional.
 *
 * This is the cheaper half of the split. There are at most eleven sections, so moving them
 * onto the union budget costs eleven of sixteen and frees eleven of twenty-four — and the
 * fields nested inside sections, which are far more numerous, stay where they already fit.
 *
 * `null` means what an absent key meant: leave that section exactly as the creator has it.
 * `document-proposal.ts` drops the nulls before the invitation contract sees them, so what
 * reaches validation is identical to what an omission produced. What changes is only that
 * the model states the decision rather than leaving it implicit — and the prompt says so.
 */
function nullableSections(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null) return schema;

  const node = schema as Record<string, unknown>;
  const properties = node.properties as Record<string, unknown> | undefined;
  if (!properties) return node;

  return {
    ...node,
    properties: Object.fromEntries(
      Object.entries(properties).map(([type, entry]) => [
        type,
        { anyOf: [entry, { type: "null" }] },
      ]),
    ),
    required: Object.keys(properties),
  };
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
    .filter((type) => PROPOSABLE_SECTIONS.has(type));
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
  narrowedTo?: readonly ProposableSection[],
): Record<string, unknown> {
  const available = proposableSections(document, manifest);
  // Intersected rather than trusted: `narrowedTo` comes from a model, and a section it
  // names that this draft does not have would build a schema for something the contract
  // will refuse anyway.
  const sections = narrowedTo ? available.filter((type) => narrowedTo.includes(type)) : available;

  const shape = Object.fromEntries(
    sections.map((type) => [
      type,
      z
        .strictObject({
          props: propsSchemaFor(type, document),
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

  return nullableSections(stripUnsupportedKeywords(schema)) as Record<string, unknown>;
}

/**
 * What this draft's schema spends against each ceiling, counted the way the provider counts
 * it: everywhere in the schema, and once per union branch.
 *
 * Exported so a test can hold every production template under both limits. Neither ceiling
 * is documented anywhere we can read; both were found by a 400 in a live run. A test is
 * therefore the only thing standing between a new template — or one new optional field on
 * an existing section — and an assistant that silently stops working for that occasion.
 */
export function countSchemaParameters(schema: unknown): { optional: number; union: number } {
  if (Array.isArray(schema)) {
    return schema.reduce(
      (total, entry) => {
        const counted = countSchemaParameters(entry);
        return { optional: total.optional + counted.optional, union: total.union + counted.union };
      },
      { optional: 0, union: 0 },
    );
  }

  if (typeof schema !== "object" || schema === null) return { optional: 0, union: 0 };

  const node = schema as Record<string, unknown>;
  const properties = node.properties as Record<string, unknown> | undefined;
  const required = new Set((node.required as string[] | undefined) ?? []);

  let optional = properties
    ? Object.keys(properties).filter((key) => !required.has(key)).length
    : 0;
  // A property is union-typed when its own schema is an `anyOf` or a list of types. The
  // node carrying the keyword is the parameter, which is why this counts itself rather
  // than its branches.
  let union = Array.isArray(node.anyOf) || Array.isArray(node.type) ? 1 : 0;

  for (const entry of Object.values(node)) {
    const counted = countSchemaParameters(entry);
    optional += counted.optional;
    union += counted.union;
  }

  return { optional, union };
}

export { CARRIED_ATTIRE_FIELDS, CARRIED_EVENT_FIELDS, type ProposableSection };
