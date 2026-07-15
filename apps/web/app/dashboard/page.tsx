import Link from "next/link";

import { CreatorShell, getCreatorName } from "../../src/components/dashboard/CreatorShell";
import { ArrowRight, Plus, Users } from "../../src/components/Icons";
import { ensurePersonalWorkspace } from "../../src/server/auth/session";
import styles from "./Dashboard.module.css";

export default async function DashboardPage() {
  const { error, user } = await ensurePersonalWorkspace();
  const creatorName = getCreatorName(user.user_metadata);

  return (
    <CreatorShell activePage="overview" email={user.email} metadata={user.user_metadata}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Personal workspace</p>
          <h1>{creatorName ? `Good morning, ${creatorName}.` : "Good morning."}</h1>
          <p className={styles.pageDescription}>
            Bring every thoughtful detail of your celebrations together.
          </p>
        </div>
        {!error ? (
          <Link className={styles.primaryButton} href="/dashboard/templates">
            <Plus />
            Create invitation
          </Link>
        ) : null}
      </header>

      {error ? (
        <div className={styles.error} role="alert">
          <p className={styles.cardLabel}>Workspace unavailable</p>
          <h2>Your workspace needs attention</h2>
          <p className={styles.errorDescription}>
            Your account is secure, but the personal workspace could not be prepared. Confirm that
            the Invitica database migration has been applied, then reload this page.
          </p>
        </div>
      ) : (
        <div className={styles.dashboardGrid}>
          <section aria-labelledby="invitations-heading" id="invitations">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionLabel}>Invitation desk</p>
                <h2 id="invitations-heading">Your invitations</h2>
              </div>
              <span className={styles.emptyCount}>No invitations yet</span>
            </div>

            <div className={styles.emptyState}>
              <div className={styles.emptyCopy}>
                <span aria-hidden="true" className={styles.folioNumber}>
                  01
                </span>
                <p className={styles.cardLabel}>A beautiful beginning</p>
                <h2>Create something worth opening.</h2>
                <p>
                  Choose a considered design, add the details that make the celebration yours, then
                  publish one memorable invitation for every guest.
                </p>
                <Link className={styles.textLink} href="/dashboard/templates">
                  Browse templates <ArrowRight />
                </Link>
              </div>

              <div aria-hidden="true" className={styles.folioPreview}>
                <div className={styles.folioEnvelope}>
                  <span>Invitica</span>
                  <strong>Your celebration</strong>
                  <small>Thoughtfully invited</small>
                </div>
              </div>
            </div>
          </section>

          <aside className={styles.rail}>
            <section className={styles.gettingStarted}>
              <p className={styles.sectionLabel}>Getting started</p>
              <h2>Three steps to share.</h2>
              <ol>
                <li>
                  <span>1</span>
                  <div>
                    <strong>Choose a template</strong>
                    <p className={styles.stepDescription}>Start with an occasion-ready design.</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <strong>Add your details</strong>
                    <p className={styles.stepDescription}>
                      Shape the story, schedule, venue, and style.
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <strong>Publish and share</strong>
                    <p className={styles.stepDescription}>
                      Send your private link and welcome responses.
                    </p>
                  </div>
                </li>
              </ol>
            </section>

            <section className={styles.responses} id="responses">
              <div className={styles.responseIcon}>
                <Users />
              </div>
              <p className={styles.sectionLabel}>Guest responses</p>
              <h2>Responses will gather here.</h2>
              <p className={styles.responseDescription}>
                After your first invitation is published, you can follow RSVPs in one place.
              </p>
              <Link className={styles.textLink} href="/dashboard/guests">
                Manage guests & RSVPs <ArrowRight />
              </Link>
            </section>
          </aside>
        </div>
      )}

      <footer className={styles.footer}>
        <span>Invitica creator workspace</span>
        <span>Invitations, thoughtfully made.</span>
      </footer>
    </CreatorShell>
  );
}
