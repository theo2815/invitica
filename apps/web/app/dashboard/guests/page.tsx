import { GuestDesk } from "../../../src/components/guests/GuestDesk";
import { ensurePersonalWorkspace } from "../../../src/server/auth/session";
import {
  listDeliveredGuestInvitations,
  listGuestPartyPage,
  listTrashedGuestParties,
} from "../../../src/server/guests/guests";
import {
  emptyInvitationResultSummary,
  listInvitationResultSummaries,
} from "../../../src/server/guests/results";
import styles from "./Guests.module.css";

interface GuestsPageProps {
  searchParams: Promise<{ invitationId?: string | string[] }>;
}

export default async function GuestsPage({ searchParams }: GuestsPageProps) {
  const { error, supabase, workspaceId } = await ensurePersonalWorkspace();
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
  const partyData =
    selectedInvitation && workspaceId
      ? await Promise.all([
          listGuestPartyPage(supabase, workspaceId, selectedInvitation.invitationId, {
            offset: 0,
            query: "",
            responseFilter: "all",
          }),
          listTrashedGuestParties(supabase, workspaceId, selectedInvitation.invitationId),
        ])
      : null;
  const partyPage = partyData?.[0] ?? { hasMore: false, nextOffset: 0, parties: [] };
  const trashedParties = partyData?.[1] ?? [];

  return (
    <>
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
            hasMoreParties={partyPage.hasMore}
            nextPartyOffset={partyPage.nextOffset}
            parties={partyPage.parties}
            resultSummary={
              selectedInvitation
                ? (resultSummaries[selectedInvitation.invitationId] ??
                  emptyInvitationResultSummary(selectedInvitation.invitationId))
                : null
            }
            selectedInvitation={selectedInvitation}
            trashedParties={trashedParties}
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
    </>
  );
}
