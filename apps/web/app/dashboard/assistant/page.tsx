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
          <p className={styles.pageDescription}>
            Tala answers from Invitica&apos;s own help material. Choose an invitation and Tala can
            draft into it as well — you read the draft and apply it yourself, so nothing changes
            until you say so.
          </p>
        </div>
      </header>

      <div className={styles.pageLayout}>
        <section aria-label="Conversation with Tala" className={styles.surface}>
          <AssistantConversation />
        </section>

        <div className={styles.workspaceColumn}>
          <AssistantWorkspace invitations={invitations} />
        </div>
      </div>

      <footer className={styles.footer}>
        <span>Tala is Invitica&apos;s AI assistant.</span>
        <span>Tala drafts; you decide.</span>
      </footer>
    </>
  );
}
