import type { TemplateOccasion } from "@invitica/template-kit";

/** Third-person forms the message needs. `they` doubles as the neutral and two-celebrant case. */
export type CelebrantPronoun = "she" | "he" | "they";

/** What the copied message states about the event. */
export interface InvitationShareContext {
  readonly celebrantPronoun: CelebrantPronoun;
  /** The creator's own wording, or null to use the generated default. */
  readonly generalShareMessage: string | null;
  /** Null when a draft outlives the template version that declared its occasion. */
  readonly occasion: TemplateOccasion | null;
  readonly personalShareMessage: string | null;
  readonly title: string;
}

/**
 * Placeholders a creator may write into their own message. The general link addresses everyone at
 * once, so it has no single recipient and omits that one. Both sets are enforced again in SQL by
 * `update_invitation_share_messages`, because an unknown placeholder would reach a guest verbatim.
 */
export const PERSONAL_MESSAGE_TOKENS = ["recipient", "celebrant", "occasion", "link"] as const;
export const GENERAL_MESSAGE_TOKENS = ["celebrant", "occasion", "link"] as const;

/** Substitutes known placeholders and leaves anything else untouched for the caller to reject. */
function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (whole, token: string) => values[token] ?? whole);
}

function templateValues(invitation: InvitationShareContext, invitationUrl: string) {
  return {
    celebrant: normalizeMessageValue(invitation.title),
    link: invitationUrl,
    // Lower case, because the default message and most creator sentences use it mid-sentence.
    occasion: invitation.occasion ? normalizeMessageValue(invitation.occasion).toLowerCase() : "",
  };
}

/** The general link goes to everyone at once, so it has no one recipient to greet by name. */
const GENERAL_GREETING = "Dear, Family & Friends";

/** Possessive determiner only — no other form appears in the message. */
const POSSESSIVE_DETERMINER: Readonly<Record<CelebrantPronoun, string>> = {
  he: "his",
  she: "her",
  they: "their",
};

function normalizeMessageValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/**
 * Whether the invitation title can carry a possessive without becoming ungrammatical.
 *
 * The title is free text and creators write it two ways: as a name ("Eliana Grace",
 * "Mara & Joaquin") or as a whole clause ("Sam turns XVIII", "Lia is seven!"). Only the first
 * survives `<title>'s christening invitation`; the second yields "Lia is seven!'s birthday
 * invitation". Names are written in title case, so requiring every word to be capitalised —
 * bar the small connectors a name may contain — separates the two without guessing at verbs.
 */
const NAME_CONNECTORS = new Set(["&", "and", "of", "the", "y"]);

function readsAsName(title: string): boolean {
  if (/[!?.]$/.test(title)) {
    return false;
  }

  const words = title.split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 5) {
    return false;
  }

  return words.every((word) => NAME_CONNECTORS.has(word.toLowerCase()) || !/^\p{Ll}/u.test(word));
}

interface OccasionCopy {
  /** Follows the opening sentence and says what the guest is being asked to come to. */
  readonly celebration: (their: string) => string;
  /** The closing thank-you. */
  readonly closing: (their: string) => string;
}

/**
 * Per-occasion wording, so a wedding does not borrow a christening's words.
 *
 * Exhaustive over the occasion enum on purpose: adding an occasion to the template catalog will
 * not compile until its copy is written here, so a new template can never quietly inherit wording
 * meant for a different kind of event.
 *
 * Every line uses possessive determiners (`her`/`his`/`their`) or no pronoun at all. A subject
 * pronoun would drag verb agreement in with it — "she celebrates" against "they celebrate" — and
 * that is not worth carrying for the one word it would buy.
 */
const OCCASION_COPY: Readonly<Record<TemplateOccasion, OccasionCopy>> = {
  Anniversary: {
    celebration: () => "We hope you can join us as we mark another year together.",
    closing: () => "Thank you for being part of our story. We can't wait to celebrate with you!",
  },
  "Baby shower": {
    celebration: () => "We hope you can join us as we get ready to welcome our little one.",
    closing: () =>
      "Thank you for being part of this new chapter. We can't wait to celebrate with you!",
  },
  Birthday: {
    celebration: () =>
      "We hope you can join us as we celebrate another year and make a few more memories together.",
    closing: (their) =>
      `Thank you for being a wonderful part of ${their} life. We can't wait to celebrate with you!`,
  },
  // Kept exactly as the founder wrote it; the other occasions were written to match its register.
  Christening: {
    celebration: (their) =>
      `We hope you can join us as we celebrate this special day and witness ${their} first sacrament.`,
    closing: (their) =>
      `Thank you for being a wonderful part of ${their} life. We can't wait to celebrate with you!`,
  },
  Debut: {
    celebration: () =>
      "We hope you can join us for an evening of celebration as we mark this milestone together.",
    closing: (their) =>
      `Thank you for being a wonderful part of ${their} journey. We can't wait to celebrate with you!`,
  },
  Wedding: {
    celebration: () =>
      "We hope you can join us as we begin this new chapter and share the day with the people closest to us.",
    closing: () => "Thank you for being part of our story. We can't wait to celebrate with you!",
  },
};

/** Used when a draft outlives its registered template and the occasion cannot be resolved. */
const UNKNOWN_OCCASION_COPY: OccasionCopy = {
  celebration: () => "We hope you can join us as we celebrate this special day.",
  closing: (their) =>
    `Thank you for being a wonderful part of ${their} life. We can't wait to celebrate with you!`,
};

function occasionCopy(invitation: InvitationShareContext): OccasionCopy {
  return invitation.occasion ? OCCASION_COPY[invitation.occasion] : UNKNOWN_OCCASION_COPY;
}

function invitationBody(invitation: InvitationShareContext): string {
  const title = normalizeMessageValue(invitation.title);
  const noun = invitation.occasion
    ? `${invitation.occasion.toLowerCase()} invitation`
    : "invitation";
  const celebration = occasionCopy(invitation).celebration(
    POSSESSIVE_DETERMINER[invitation.celebrantPronoun],
  );

  if (readsAsName(title)) {
    return `We're happy to share ${possessive(title)} ${noun} with you. ${celebration}`;
  }

  // A clause-like title is named on its own line, where it needs no grammar from us.
  return `We're happy to share our ${noun} with you.\n\n${title}\n\n${celebration}`;
}

function closing(invitation: InvitationShareContext): string {
  return occasionCopy(invitation).closing(POSSESSIVE_DETERMINER[invitation.celebrantPronoun]);
}

/**
 * The general link opens the invitation for reading and does not authorize a party RSVP, so
 * neither message promises one. This one also has no named recipient to greet.
 */
export function buildGeneralInvitationMessage(
  invitation: InvitationShareContext,
  invitationUrl: string,
): string {
  if (invitation.generalShareMessage) {
    return renderTemplate(
      invitation.generalShareMessage,
      templateValues(invitation, invitationUrl),
    );
  }

  return [
    GENERAL_GREETING,
    invitationBody(invitation),
    closing(invitation),
    `View the invitation here:\n${invitationUrl}`,
  ].join("\n\n");
}

export function buildPersonalInvitationMessage(
  invitation: InvitationShareContext,
  recipientName: string,
  invitationUrl: string,
): string {
  const recipient = normalizeMessageValue(recipientName);

  if (invitation.personalShareMessage) {
    return renderTemplate(invitation.personalShareMessage, {
      ...templateValues(invitation, invitationUrl),
      recipient,
    });
  }

  return [
    `Hi, ${recipient}`,
    invitationBody(invitation),
    closing(invitation),
    `View your invitation here:\n${invitationUrl}`,
  ].join("\n\n");
}
