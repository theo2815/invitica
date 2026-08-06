import type { InvitationDocument, InvitationSection } from "@invitica/invitation-schema";
import type { TemplateManifest } from "@invitica/template-kit";

import {
  applySectionDocumentDetails,
  type SectionDocumentDetails,
  sectionDocumentDetailsSchema,
} from "../../lib/invitations/little-blessings-details";
import { proposableSections } from "./document-schema";

/**
 * Turns whatever the model returned into either a valid invitation document or a refusal.
 *
 * This is the gate. Above it the answer is a JSON blob a vendor produced; below it, it is a
 * document that has passed the same parser the editor, the save action, and the database
 * all enforce. Nothing skips it — the route hands the client only what comes out of here,
 * and the only thing it hands over is a document, never the raw output.
 */

export type ProposalOutcome =
  | { document: InvitationDocument; details: SectionDocumentDetails; status: "proposed" }
  | { reason: ProposalRejection; status: "rejected" };

export type ProposalRejection =
  /** Named a section this draft does not contain. */
  | "section_not_in_draft"
  /** Shaped like a proposal but not a valid invitation. */
  | "invalid_document"
  /** Not shaped like a proposal at all. */
  | "unreadable";

function findSection<Type extends InvitationSection["type"]>(
  document: InvitationDocument,
  type: Type,
): Extract<InvitationSection, { type: Type }> | undefined {
  return document.sections.find(
    (section): section is Extract<InvitationSection, { type: Type }> => section.type === type,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Drops the nulls the proposal schema requires the model to write.
 *
 * `document-schema.ts` makes every nested field required-and-nullable, because the provider
 * refuses to compile a schema with more than 24 optional properties and the widest templates
 * had 39. `null` is that schema's way of writing "nothing here", and this is where it turns
 * back into the absent key the invitation contract expects — `heading: null` would fail a
 * `z.string().optional()` that an omitted `heading` satisfies.
 *
 * Array elements keep their positions rather than being filtered out. `carryMedia` merges
 * photographs and map pins by index, so dropping an element here would silently reattach
 * one gathering's map pin to another.
 */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) continue;
    result[key] = withoutNulls(entry);
  }
  return result;
}

/**
 * Puts back the fields the proposal was never allowed to set.
 *
 * Collections merge by position, which is the only correspondence available: the model
 * rewrote the words of "the second gathering", so the second gathering's map pin is the one
 * that still applies. A proposal that adds a gathering leaves the new one without a pin,
 * which is honest — nobody has placed it yet.
 */
function carryMedia(
  document: InvitationDocument,
  type: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (type === "hero") {
    const current = findSection(document, "hero");
    return current?.props.imageAssetId
      ? { ...props, imageAssetId: current.props.imageAssetId }
      : props;
  }

  if (type === "gallery") {
    const current = findSection(document, "gallery");
    return { ...props, images: current?.props.images ?? [] };
  }

  if (type === "gifts") {
    const current = findSection(document, "gifts");
    const items = Array.isArray(props.items) ? props.items : [];
    return {
      ...props,
      items: items.map((item, index) => {
        const carried = current?.props.items[index]?.imageAssetId;
        return carried && isRecord(item) ? { ...item, imageAssetId: carried } : item;
      }),
    };
  }

  if (type === "event-details") {
    const current = findSection(document, "event-details");
    const events = Array.isArray(props.events) ? props.events : [];
    return {
      ...props,
      events: events.map((event, index) => {
        const source = current?.props.events[index];
        if (!isRecord(event) || !source) return event;

        return {
          ...event,
          // The pin and the directions link are both the creator's: one they dropped, one
          // they pasted. Each is carried only when the draft has it, so a gathering the
          // proposal adds arrives without either rather than with someone else's.
          ...(source.latitude === undefined || source.longitude === undefined
            ? {}
            : { latitude: source.latitude, longitude: source.longitude }),
          ...(source.mapUrl === undefined ? {} : { mapUrl: source.mapUrl }),
        };
      }),
    };
  }

  if (type === "attire") {
    const current = findSection(document, "attire");
    const groups = Array.isArray(props.groups) ? props.groups : undefined;

    return {
      ...props,
      ...(current?.props.colors === undefined ? {} : { colors: current.props.colors }),
      ...(groups === undefined
        ? {}
        : {
            groups: groups.map((group, index) => {
              const carried = current?.props.groups?.[index]?.colors;
              return carried && isRecord(group) ? { ...group, colors: carried } : group;
            }),
          }),
    };
  }

  return props;
}

export function resolveDocumentProposal(
  output: unknown,
  document: InvitationDocument,
  manifest: TemplateManifest,
): ProposalOutcome {
  if (!isRecord(output)) return { reason: "unreadable", status: "rejected" };

  // Before anything reads a key, so "the model wrote null" and "the model wrote nothing"
  // reach the rest of this function as the same thing. A top-level `"attire": null` is a
  // section left alone, which is what an omitted key means too.
  const proposal = withoutNulls(output) as Record<string, unknown>;

  const allowed = new Set<string>(proposableSections(document, manifest));

  // Checked before the contract sees it so an undeclared section reports what actually went
  // wrong. `applySectionDocumentDetails` would also reject it, but only as a thrown error
  // that reads the same as a malformed payload.
  for (const type of Object.keys(proposal)) {
    if (!allowed.has(type)) return { reason: "section_not_in_draft", status: "rejected" };
  }

  const carried: Record<string, unknown> = {};
  for (const [type, entry] of Object.entries(proposal)) {
    if (!isRecord(entry) || !isRecord(entry.props)) {
      return { reason: "unreadable", status: "rejected" };
    }
    carried[type] = { ...entry, props: carryMedia(document, type, entry.props) };
  }

  // Validated one section at a time, and a section that fails is dropped rather than
  // taking the others down with it.
  //
  // Measured 2026-08-06: both of the drafting model's failures were a single unbuildable
  // `event-details` — a creator who had not settled a venue, so the model wrote an empty
  // string for a required address rather than invent one, which the contract strips and
  // then rejects. All-or-nothing threw away four good sections to punish that. A creator
  // who asks for a programme should get the programme even when the venue block cannot be
  // built from what they said, and the diff shows only what changed, so a dropped section
  // is simply one that does not appear.
  //
  // Nothing is loosened by this: every section that survives has passed exactly the parser
  // it passed before, and the whole-document rules below still see all of them together.
  const kept: Record<string, unknown> = {};
  for (const [type, entry] of Object.entries(carried)) {
    if (sectionDocumentDetailsSchema.safeParse({ [type]: entry }).success) kept[type] = entry;
  }

  if (Object.keys(kept).length === 0) return { reason: "invalid_document", status: "rejected" };

  const parsed = sectionDocumentDetailsSchema.safeParse(kept);
  if (!parsed.success) return { reason: "invalid_document", status: "rejected" };

  try {
    return {
      document: applySectionDocumentDetails(document, parsed.data),
      details: parsed.data,
      status: "proposed",
    };
  } catch {
    // The whole-document rules live here — unique ids, referenced assets existing, a visible
    // gallery holding at least one photograph. A proposal can satisfy every section in
    // isolation and still fail one of them.
    return { reason: "invalid_document", status: "rejected" };
  }
}
