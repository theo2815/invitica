import type { InvitationDocument, InvitationSection } from "@invitica/invitation-schema";

/**
 * What a proposed invitation changes about the one on screen.
 *
 * Field-level rather than a text diff. A creator deciding whether to accept a draft is
 * asking "what is it touching?", not "which characters moved" — and a character diff over
 * rewritten prose is noise. Sections the proposal leaves alone do not appear at all, which
 * is the useful half of the answer: it says what is safe.
 */

export interface ProposalSectionChange {
  /** Human labels for the props that differ, in document order. */
  fields: string[];
  type: InvitationSection["type"];
  /** Set only when the proposal changes whether guests see this section. */
  visibility: "hidden" | "shown" | null;
}

/**
 * Prop names are consistent across section types in the invitation contract, so one map
 * covers all of them. An unmapped name falls back to itself rather than being dropped — a
 * missed label is a small ugliness, a silently omitted change is a lie.
 */
const FIELD_LABELS: Record<string, string> = {
  address: "address",
  arrivalNote: "arrival note",
  body: "message",
  colors: "colours",
  dateLabel: "written date",
  deadline: "reply deadline",
  declineButtonBehavior: "decline behaviour",
  description: "description",
  events: "gatherings",
  eyebrow: "line above the name",
  groups: "groups",
  heading: "heading",
  images: "photographs",
  items: "entries",
  label: "label",
  latitude: "location",
  longitude: "location",
  mapUrl: "map link",
  message: "message",
  name: "name",
  responseMode: "reply type",
  signature: "signature",
  startAt: "date and time",
  subtitle: "line of welcome",
  target: "countdown target",
  timeLabel: "time",
  title: "title",
  venueName: "venue",
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** Structural equality over contract data, which is plain JSON by construction. */
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function describeProposalChanges(
  current: InvitationDocument,
  proposed: InvitationDocument,
): ProposalSectionChange[] {
  const changes: ProposalSectionChange[] = [];

  for (const proposedSection of proposed.sections) {
    const currentSection = current.sections.find((section) => section.id === proposedSection.id);
    if (!currentSection) continue;

    const currentProps: Record<string, unknown> = currentSection.props;
    const proposedProps: Record<string, unknown> = proposedSection.props;

    // Union of both sides, so a field the proposal clears is reported as changed rather
    // than disappearing along with its value.
    const fields = [...new Set([...Object.keys(currentProps), ...Object.keys(proposedProps)])]
      .filter((field) => !same(currentProps[field], proposedProps[field]))
      .map(label);

    const visibility =
      currentSection.visible === proposedSection.visible
        ? null
        : proposedSection.visible
          ? ("shown" as const)
          : ("hidden" as const);

    if (fields.length === 0 && visibility === null) continue;

    changes.push({ fields: [...new Set(fields)], type: proposedSection.type, visibility });
  }

  return changes;
}
