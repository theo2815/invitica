import { notFound } from "next/navigation";

import { AssistantConversation } from "../../../src/components/assistant/AssistantConversation";
import {
  AssistantWorkspace,
  type AssistantWorkspaceInvitation,
} from "../../../src/components/assistant/AssistantWorkspace";
import { InviPresence } from "../../../src/components/assistant/InviPresence";
import { assistantEnabled } from "../../../src/server/assistant/budget";
import { ensurePersonalWorkspace } from "../../../src/server/auth/session";
import { listInvitationDrafts } from "../../../src/server/invitations/drafts";
import styles from "./Assistant.module.css";

export default async function AssistantPage() {
  // The kill switch removes the route as well as the widget. A page that renders a composer
  // whose every request is refused would be worse than no page.
  if (!assistantEnabled()) notFound();

  const { error: workspaceError, supabase, workspaceId } = await ensurePersonalWorkspace();

  if (workspaceError || !workspaceId) {
    throw new Error("The creator workspace is unavailable.");
  }

  const drafts = await listInvitationDrafts(supabase, workspaceId);

  // Only the shared section-document editor can stage a proposal. Legacy Garden Promise v1
  // keeps its narrow editor and its own save path, so offering to draft into it would
  // produce something with nowhere to go.
  const invitations: AssistantWorkspaceInvitation[] = drafts
    .filter((draft) => draft.manifest.editorKey === "section-document-v1")
    .map((draft) => ({
      invitationId: draft.invitationId,
      templateName: draft.manifest.listing.name,
      title: draft.title,
    }));

  return (
    <>
      <header className={styles.pageHeader}>
        <InviPresence className={styles.pageMascot} />
        <div className={styles.pageHeading}>
          <p className={styles.eyebrow}>Invi · Invitica AI</p>
          <h1>Ask Invi, or draft an invitation</h1>
          {/* The three jobs are listed in full beside the picker, where a creator is
              already deciding what to do, and again on the mode switch. Naming them a
              third time cost three lines at 390 px and pushed the conversation down the
              page. What is left is the one thing that governs all three: Invi proposes,
              and nothing it produces reaches an invitation without a click. */}
          <p className={styles.pageDescription}>
            Nothing Invi produces is saved until you apply it yourself.
          </p>
        </div>
      </header>

      {/* The workspace owns the layout, so the invitation picker can sit above the
          conversation on a phone and beside it on a wide screen. */}
      <AssistantWorkspace invitations={invitations}>
        <section aria-label="Conversation with Invi" className={styles.surface}>
          <AssistantConversation />
        </section>
      </AssistantWorkspace>
    </>
  );
}
