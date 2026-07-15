import Link from "next/link";

import { CreatorShell } from "../../../src/components/dashboard/CreatorShell";
import { ArrowRight, Plus, Users } from "../../../src/components/Icons";
import { ensurePersonalWorkspace } from "../../../src/server/auth/session";
import styles from "./Guests.module.css";

const summaries = [
  { label: "Guest parties", note: "Households and groups" },
  { label: "Invited guests", note: "Across every party" },
  { label: "Attending", note: "Confirmed responses" },
  { label: "Awaiting reply", note: "Not yet responded" },
];

export default async function GuestsPage() {
  const { error, user } = await ensurePersonalWorkspace();

  return (
    <CreatorShell activePage="guests" email={user.email} metadata={user.user_metadata}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Guest desk</p>
          <h1>Guests & RSVPs</h1>
          <p className={styles.pageDescription}>
            Organize guest parties, private invitation links, and responses in one careful ledger.
          </p>
        </div>
        {!error ? (
          <div className={styles.headerActions}>
            <button disabled title="Guest import is not available yet" type="button">
              Import guest list
            </button>
            <button disabled title="Guest management is not available yet" type="button">
              <Plus />
              Add guest party
            </button>
          </div>
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
        <div className={styles.workspace}>
          <section className={styles.invitationContext}>
            <div className={styles.contextCopy}>
              <p className={styles.label}>Invitation context</p>
              <h2>No invitation selected</h2>
              <p>
                Guest parties and responses belong to a published invitation. Start with an
                invitation, then return here to prepare private links and welcome RSVPs.
              </p>
              <Link href="/dashboard/invitations">
                View invitations <ArrowRight />
              </Link>
            </div>

            <div aria-hidden="true" className={styles.ledgerArtwork}>
              <span className={styles.artworkLabel}>Private guest ledger</span>
              <div className={styles.ledgerSheet}>
                <span>Guest party</span>
                <i />
                <i />
                <i />
                <small>Responses arrive here</small>
              </div>
            </div>
          </section>

          <section aria-label="RSVP overview" className={styles.summaryGrid}>
            {summaries.map((summary) => (
              <article key={summary.label}>
                <p>{summary.label}</p>
                <strong>
                  <span className={styles.visuallyHidden}>Not available</span>
                  <span aria-hidden="true">&mdash;</span>
                </strong>
                <span>{summary.note}</span>
              </article>
            ))}
          </section>

          <section aria-labelledby="guest-ledger-heading" className={styles.ledgerSection}>
            <div className={styles.ledgerHeader}>
              <div>
                <p className={styles.label}>Guest records</p>
                <h2 id="guest-ledger-heading">Guest ledger</h2>
              </div>
              <div className={styles.ledgerControls}>
                <label>
                  <span>Search guests</span>
                  <input disabled placeholder="Search guest parties" type="search" />
                </label>
                <label>
                  <span>RSVP status</span>
                  <select disabled>
                    <option>All responses</option>
                  </select>
                </label>
              </div>
            </div>

            <div className={styles.tableFrame}>
              <table aria-label="Guest ledger">
                <thead>
                  <tr>
                    <th scope="col">Guest party</th>
                    <th scope="col">Invitation</th>
                    <th scope="col">Link status</th>
                    <th scope="col">RSVP</th>
                    <th scope="col">Party size</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={5}>
                      <div className={styles.ledgerEmpty}>
                        <span aria-hidden="true">
                          <Users />
                        </span>
                        <p>No guest parties to show.</p>
                        <small>
                          Search and response filters will become available with your first guest
                          list.
                        </small>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <aside className={styles.privacyNote}>
            <p className={styles.label}>Private by design</p>
            <div>
              <h2>Guest information deserves careful handling.</h2>
              <p>
                Invitica will keep contact details out of public links and separate private guest
                records from the invitation your guests open.
              </p>
            </div>
          </aside>
        </div>
      )}

      <footer className={styles.footer}>
        <span>Invitica guest desk</span>
        <span>Thoughtful invitations, respectfully managed.</span>
      </footer>
    </CreatorShell>
  );
}
