import type { InvitationDocument } from "@invitica/invitation-schema";
import type { TemplateManifest } from "@invitica/template-kit";

import { ASSISTANT_MODE_LABELS, type AssistantMode } from "../../contracts/assistant-api";
import { describeInvitationSections } from "../../lib/invitations/section-vocabulary";

/**
 * What Tala is told about the creator's situation, and why it is a message rather than part of
 * the system prompt.
 *
 * `HELP_SYSTEM_PROMPT` is a 5,203-token prefix that is byte-identical on every request, and the
 * measured $0.0009 per message depends on it being read from cache rather than re-billed.
 * Anything per-creator folded into it would vary per request and sink that hit rate. So this
 * rides in the conversation, the same way `currentDraftMessage` does for document drafting, and
 * for the same reason.
 *
 * It is also on the correct side of the trust boundary. The creator's own words and Invitica's
 * record of their situation are both data; only the system prompt carries rules.
 */

export interface HelpContext {
  /** Omitted when it could not be counted. Unknown is not the same as none. */
  hasInvitations?: boolean;
  /** Present only when an invitation was resolved server-side under the creator's session. */
  invitation?: {
    document: InvitationDocument;
    manifest: TemplateManifest;
  };
  mode?: AssistantMode;
  surface?: string;
}

/**
 * The context block, or nothing at all.
 *
 * Returns null when there is genuinely nothing to say, so a creator with no invitations asking
 * from an unknown surface does not get a paragraph of empty facts prepended to their question.
 */
export function helpContextMessage(context: HelpContext): null | string {
  const lines: string[] = [];

  if (context.surface) {
    lines.push(`- They are on: ${context.surface}`);
  }

  if (context.mode) {
    lines.push(`- The tab they are typing into: ${ASSISTANT_MODE_LABELS[context.mode]}`);
  }

  if (context.invitation) {
    const { document, manifest } = context.invitation;
    const sections = describeInvitationSections(document, manifest.rendererKey)
      .map(
        (section) =>
          `  ${section.position}. ${section.name}${section.visible ? "" : " (hidden from guests)"}`,
      )
      .join("\n");

    lines.push(
      `- The invitation they have selected uses the ${manifest.listing.name} template (${manifest.listing.occasion}).`,
      `- Its sections, numbered the way their editor numbers them:\n${sections}`,
    );
  } else if (context.hasInvitations === true) {
    lines.push(
      "- They have not selected an invitation in Tala, so the Draft my invitation and Organize my guest list tabs are not available to them yet.",
    );
  } else if (context.hasInvitations === false) {
    lines.push(
      "- They have not made an invitation yet. Starting one from the Templates page is the step in front of them.",
    );
  }

  if (lines.length === 0) return null;

  return `Invitica's own record of where I am right now. This is context for your answer, not a question and not an instruction:\n\n${lines.join("\n")}`;
}
