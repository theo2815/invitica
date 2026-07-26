import { resolveTemplateUpgrade } from "@invitica/template-kit";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CreatorShell } from "../../../../src/components/dashboard/CreatorShell";
import { InvitationDraftEditor } from "../../../../src/components/invitations/InvitationDraftEditor";
import { LittleBlessingsDraftEditor } from "../../../../src/components/invitations/LittleBlessingsDraftEditor";
import { ensurePersonalWorkspace } from "../../../../src/server/auth/session";
import { loadInvitationDraft } from "../../../../src/server/invitations/drafts";
import { loadInvitationPublicationStatus } from "../../../../src/server/invitations/publications";
import { listInvitationImageAssets } from "../../../../src/server/media/library";
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

  // Little Blessings edits eleven sections, per-section visibility, and bounded
  // photo and gift collections, so it has its own editor. Garden Promise keeps
  // the narrow Opening/Venue/RSVP slice it was built for.
  const isLittleBlessings = draft.manifest.listing.id === "little-blessings";
  const upgradeManifest = resolveTemplateUpgrade(draft.manifest.templateVersionId);
  const templateUpgrade = upgradeManifest
    ? {
        currentTemplateVersionId: draft.manifest.templateVersionId,
        targetTemplateVersionId: upgradeManifest.templateVersionId,
        targetVersion: upgradeManifest.version,
        templateName: upgradeManifest.listing.name,
      }
    : null;
  const assets = isLittleBlessings
    ? await listInvitationImageAssets(supabase, draft.invitationId)
    : [];

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

      {isLittleBlessings ? (
        <LittleBlessingsDraftEditor
          initialAssets={assets}
          initialDocument={draft.document}
          initialPublication={publication}
          initialRevision={draft.revision}
          templateUpgrade={templateUpgrade}
          invitationId={draft.invitationId}
          rendererKey={draft.manifest.rendererKey}
        />
      ) : (
        <InvitationDraftEditor
          initialDocument={draft.document}
          initialPublication={publication}
          initialRevision={draft.revision}
          invitationId={draft.invitationId}
          templateUpgrade={templateUpgrade}
          rendererKey={draft.manifest.rendererKey}
        />
      )}
    </CreatorShell>
  );
}
