import Link from "next/link";
import { notFound } from "next/navigation";

import { CreatorShell } from "../../../../src/components/dashboard/CreatorShell";
import { InvitationDraftEditor } from "../../../../src/components/invitations/InvitationDraftEditor";
import { ensurePersonalWorkspace } from "../../../../src/server/auth/session";
import { loadInvitationDraft } from "../../../../src/server/invitations/drafts";
import { loadInvitationPublicationStatus } from "../../../../src/server/invitations/publications";
import styles from "./Draft.module.css";

interface InvitationDraftPageProps {
  params: Promise<{ invitationId: string }>;
}

export default async function InvitationDraftPage({ params }: InvitationDraftPageProps) {
  const { invitationId } = await params;
  const { error: workspaceError, supabase, user, workspaceId } = await ensurePersonalWorkspace();

  if (workspaceError || !workspaceId) {
    throw new Error("The creator workspace is unavailable.");
  }

  const [draft, publication] = await Promise.all([
    loadInvitationDraft(supabase, invitationId),
    loadInvitationPublicationStatus(supabase, invitationId),
  ]);

  if (!draft) {
    notFound();
  }
  return (
    <CreatorShell activePage="invitations" email={user.email} metadata={user.user_metadata}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/dashboard/invitations">Invitations</Link>
        <span aria-hidden="true">/</span>
        <span>Draft preview</span>
      </nav>

      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Saved invitation draft</p>
          <h1>{draft.manifest.listing.name}</h1>
          <p className={styles.pageDescription}>
            Your selected design is safely stored and rendered from the same invitation document
            your guests will eventually receive.
          </p>
        </div>
        <div className={styles.status}>
          <span>Draft</span>
          <small>Autosave editor</small>
        </div>
      </header>

      <InvitationDraftEditor
        initialDocument={draft.document}
        initialPublication={publication}
        initialRevision={draft.revision}
        invitationId={draft.invitationId}
        rendererKey={draft.manifest.rendererKey}
      />
    </CreatorShell>
  );
}
