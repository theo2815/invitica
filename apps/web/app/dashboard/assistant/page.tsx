import { notFound } from "next/navigation";

import { AssistantConversation } from "../../../src/components/assistant/AssistantConversation";
import {
  AssistantWorkspace,
  type AssistantWorkspaceInvitation,
} from "../../../src/components/assistant/AssistantWorkspace";
import { TalaPresence } from "../../../src/components/assistant/TalaPresence";
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
        <TalaPresence className={styles.pageMascot} />
        <div className={styles.pageHeading}>
          <p className={styles.eyebrow}>Tala · Invitica AI</p>
          <h1>Ask Tala, or draft an invitation</h1>
          {/* The three jobs are listed in full beside the picker, where a creator is
              already deciding what to do. This says the one thing that governs all of
              them: Tala proposes, and nothing it produces is saved without a click. */}
          <p className={styles.pageDescription}>
            Tala answers from Invitica&apos;s own help material, drafts into an invitation you
            choose, and sorts a pasted guest list. It never saves anything — you read what it
            produces and apply it yourself.
          </p>
        </div>
      </header>

      {/* The workspace owns the layout, so the invitation picker can sit above the
          conversation on a phone and beside it on a wide screen. */}
      <AssistantWorkspace invitations={invitations}>
        <section aria-label="Conversation with Tala" className={styles.surface}>
          <AssistantConversation />
        </section>
      </AssistantWorkspace>
    </>
  );
}
