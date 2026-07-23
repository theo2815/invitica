import Link from "next/link";

import { CreatorShell } from "../../../src/components/dashboard/CreatorShell";
import { ArrowRight, Envelope, Plus } from "../../../src/components/Icons";
import { InvitationDeleteButton } from "../../../src/components/invitations/InvitationDeleteButton";
import { ensurePersonalWorkspace } from "../../../src/server/auth/session";
import { listInvitationDrafts } from "../../../src/server/invitations/drafts";
import {
  type InvitationPublicationStatus,
  listInvitationPublicationStatuses,
} from "../../../src/server/invitations/publications";
import styles from "./Invitations.module.css";

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(new Date(value));
}

function publicationBadge(
  publication: InvitationPublicationStatus | undefined,
  draftRevision: number,
) {
  if (!publication || publication.status === "idle") return { label: "Draft", tone: "draft" };
  if (publication.status === "delivered") {
    return publication.publishedRevision === draftRevision
      ? { label: "Published", tone: "published" }
      : { label: "Draft changes", tone: "draft" };
  }
  if (publication.status === "failed") return { label: "Needs attention", tone: "attention" };
  return { label: "Publishing", tone: "publishing" };
}

export default async function InvitationsPage() {
  const { error, supabase, user, workspaceId } = await ensurePersonalWorkspace();
  const [drafts, publicationStatuses] =
    !error && workspaceId
      ? await Promise.all([
          listInvitationDrafts(supabase, workspaceId),
          listInvitationPublicationStatuses(supabase, workspaceId),
        ])
      : [[], {} as Record<string, InvitationPublicationStatus>];

  return (
    <CreatorShell activePage="invitations" email={user.email} metadata={user.user_metadata}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Invitation library</p>
          <h1>Invitations</h1>
          <p className={styles.pageDescription}>
            Create and manage every celebration in one considered place.
          </p>
        </div>
        {!error && workspaceId ? (
          <Link className={styles.primaryButton} href="/dashboard/templates">
            <Plus />
            New invitation
          </Link>
        ) : null}
      </header>

      {error || !workspaceId ? (
        <section className={styles.workspaceError} role="alert">
          <p className={styles.label}>Workspace unavailable</p>
          <h2>Your workspace needs attention</h2>
          <p>
            Your account is secure, but the personal workspace could not be prepared. Confirm that
            the Invitica database migration has been applied, then reload this page.
          </p>
        </section>
      ) : (
        <section aria-labelledby="invitation-library-heading" className={styles.library}>
          <div className={styles.libraryHeading}>
            <div>
              <p className={styles.label}>Your collection</p>
              <h2 id="invitation-library-heading">Invitation library</h2>
            </div>
            <span>
              {drafts.length
                ? `${drafts.length} saved ${drafts.length === 1 ? "invitation" : "invitations"}`
                : "No invitations yet"}
            </span>
          </div>

          {drafts.length ? (
            <div className={styles.invitationGrid}>
              {drafts.map((draft, index) => {
                const badge = publicationBadge(
                  publicationStatuses[draft.invitationId],
                  draft.revision,
                );
                return (
                  <article className={styles.savedCard} key={draft.invitationId}>
                    <div
                      aria-label={`${draft.title} invitation artwork`}
                      className={styles.savedArtwork}
                      data-template={draft.manifest.listing.id}
                      role="img"
                    >
                      <span>No. {String(index + 1).padStart(2, "0")}</span>
                      <p>{draft.manifest.listing.occasion}</p>
                      <strong>{draft.title}</strong>
                      <small>{draft.dateLabel ?? "Date to be added"}</small>
                    </div>
                    <div className={styles.savedDetails}>
                      <div className={styles.savedMeta}>
                        <span data-status={badge.tone}>{badge.label}</span>
                        <small>Updated {formatUpdatedAt(draft.updatedAt)}</small>
                      </div>
                      <p className={styles.label}>{draft.manifest.listing.name}</p>
                      <h3>{draft.title}</h3>
                      <p>{draft.dateLabel ?? "Add the celebration date when you are ready."}</p>
                      <div className={styles.savedActions}>
                        <span>Revision {draft.revision}</span>
                        <div className={styles.savedActionButtons}>
                          {!publicationStatuses[draft.invitationId] ? (
                            <InvitationDeleteButton
                              invitationId={draft.invitationId}
                              title={draft.title}
                            />
                          ) : null}
                          <Link
                            aria-label="Continue editing"
                            href={`/dashboard/invitations/${draft.invitationId}`}
                          >
                            <span className={styles.desktopCardAction}>Continue editing</span>
                            <span className={styles.mobileCardAction}>Edit</span>
                            <ArrowRight />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <>
              <div className={styles.emptyState}>
                <div aria-hidden="true" className={styles.artwork}>
                  <span className={styles.artworkIndex}>No. 01</span>
                  <div className={styles.invitationCard}>
                    <span>Invitica</span>
                    <strong>A celebration awaits</strong>
                    <small>Made especially for your guests</small>
                  </div>
                  <div className={styles.envelopeFlap} />
                </div>

                <div className={styles.emptyCopy}>
                  <div className={styles.emptyIcon}>
                    <Envelope />
                  </div>
                  <p className={styles.label}>Begin your collection</p>
                  <h2>Your first invitation begins here.</h2>
                  <p>
                    Choose a design, add the details that make the celebration yours, and publish
                    one memorable invitation for every guest.
                  </p>
                  <Link className={styles.emptyAction} href="/dashboard/templates">
                    Create your first invitation
                  </Link>
                  <p className={styles.creationNote}>
                    Your draft will be saved here so you can return whenever you are ready.
                  </p>
                </div>
              </div>

              <ol aria-label="Invitation creation steps" className={styles.steps}>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Choose a design</strong>
                    <p>Begin with a curated template for the occasion.</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Make it personal</strong>
                    <p>Add your story, schedule, venue, media, and style.</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Publish and share</strong>
                    <p>Welcome guests through one private invitation link.</p>
                  </div>
                </li>
              </ol>
            </>
          )}
        </section>
      )}

      <footer className={styles.footer}>
        <span>Invitica invitation library</span>
        <span>Invitations, thoughtfully made.</span>
      </footer>
    </CreatorShell>
  );
}
