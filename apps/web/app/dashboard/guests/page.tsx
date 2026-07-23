import { CreatorShell } from "../../../src/components/dashboard/CreatorShell";
import { GuestDesk } from "../../../src/components/guests/GuestDesk";
import { ensurePersonalWorkspace } from "../../../src/server/auth/session";
import { listDeliveredGuestInvitations, listGuestParties } from "../../../src/server/guests/guests";
import {
  emptyInvitationResultSummary,
  listInvitationResultSummaries,
} from "../../../src/server/guests/results";
import styles from "./Guests.module.css";

interface GuestsPageProps {
  searchParams: Promise<{ invitationId?: string | string[] }>;
}

export default async function GuestsPage({ searchParams }: GuestsPageProps) {
  const { error, supabase, user, workspaceId } = await ensurePersonalWorkspace();
  const query = await searchParams;
  const requestedInvitationId =
    typeof query.invitationId === "string" ? query.invitationId : undefined;
  const guestData =
    !error && workspaceId
      ? await Promise.all([
          listDeliveredGuestInvitations(supabase, workspaceId),
          listInvitationResultSummaries(supabase, workspaceId),
        ])
      : null;
  const invitations = guestData?.[0] ?? [];
  const resultSummaries = guestData?.[1] ?? {};
  const selectedInvitation =
    invitations.find((invitation) => invitation.invitationId === requestedInvitationId) ?? null;
  const parties =
    selectedInvitation && workspaceId
      ? await listGuestParties(supabase, workspaceId, selectedInvitation.invitationId)
      : [];

  return (
    <CreatorShell activePage="guests" email={user.email} metadata={user.user_metadata}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Guest desk</p>
          <h1>Guests &amp; RSVPs</h1>
          <p className={styles.pageDescription}>
            Follow addressed invitation links, real responses, and privacy-safe views in one careful
            ledger.
          </p>
        </div>
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
        <>
          <GuestDesk
            invitations={invitations}
            parties={parties}
            resultSummary={
              selectedInvitation
                ? (resultSummaries[selectedInvitation.invitationId] ??
                  emptyInvitationResultSummary(selectedInvitation.invitationId))
                : null
            }
            selectedInvitation={selectedInvitation}
          />
          <aside className={styles.privacyNote}>
            <p className={styles.label}>Private by design</p>
            <div>
              <h2>Guest information stays separate from the published invitation.</h2>
              <p>
                Names never enter immutable R2 snapshots. Personalized URLs carry only an opaque
                fragment token, and Invitica stores only its keyed hash.
              </p>
            </div>
          </aside>
        </>
      )}

      <footer className={styles.footer}>
        <span>Invitica guest desk</span>
        <span>Thoughtful invitations, respectfully managed.</span>
      </footer>
    </CreatorShell>
  );
}
