import Link from "next/link";

import { CreatorShell } from "../../../src/components/dashboard/CreatorShell";
import { Envelope, Plus } from "../../../src/components/Icons";
import { ensurePersonalWorkspace } from "../../../src/server/auth/session";
import styles from "./Invitations.module.css";

export default async function InvitationsPage() {
  const { error, user } = await ensurePersonalWorkspace();

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
        {!error ? (
          <Link className={styles.primaryButton} href="/dashboard/templates">
            <Plus />
            New invitation
          </Link>
        ) : null}
      </header>

      {error ? (
        <section className={styles.workspaceError} role="alert">
          <p className={styles.label}>Workspace unavailable</p>
          <h2>Your workspace needs attention</h2>
          <p>
            Your account is secure, but the personal workspace could not be prepared. Confirm that
            the Invitica database migration has been applied, then reload this page.
          </p>
        </section>
      ) : (
        <section aria-labelledby="empty-library-heading" className={styles.library}>
          <div className={styles.libraryHeading}>
            <div>
              <p className={styles.label}>Your collection</p>
              <h2>Invitation library</h2>
            </div>
            <span>No invitations yet</span>
          </div>

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
              <h2 id="empty-library-heading">Your first invitation begins here.</h2>
              <p>
                Choose a design, add the details that make the celebration yours, and publish one
                memorable invitation for every guest.
              </p>
              <Link className={styles.emptyAction} href="/dashboard/templates">
                Create your first invitation
              </Link>
              <p className={styles.creationNote}>
                Explore the preview collection while invitation creation is being connected.
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
        </section>
      )}

      <footer className={styles.footer}>
        <span>Invitica invitation library</span>
        <span>Invitations, thoughtfully made.</span>
      </footer>
    </CreatorShell>
  );
}
