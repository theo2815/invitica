import Link from "next/link";

import { CreatorShell, getCreatorName } from "../../src/components/dashboard/CreatorShell";
import { ArrowRight, Plus, Users } from "../../src/components/Icons";
import { ensurePersonalWorkspace } from "../../src/server/auth/session";
import {
  emptyInvitationResultSummary,
  listInvitationResultSummaries,
} from "../../src/server/guests/results";
import { listInvitationDrafts } from "../../src/server/invitations/drafts";
import {
  type InvitationPublicationStatus,
  listInvitationPublicationStatuses,
} from "../../src/server/invitations/publications";
import styles from "./Dashboard.module.css";

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(new Date(value));
}

function publicationPresentation(
  publication: InvitationPublicationStatus | undefined,
  draftRevision: number,
) {
  if (!publication || publication.status === "idle") {
    return { detail: "Not published yet", label: "Draft", tone: "draft" };
  }
  if (publication.status === "delivered") {
    return publication.publishedRevision === draftRevision
      ? { detail: "The current draft is live", label: "Published", tone: "published" }
      : { detail: "Saved changes are not live yet", label: "Draft changes", tone: "draft" };
  }
  if (publication.status === "failed") {
    return {
      detail: publication.livePublicIdentifier
        ? "The previous version remains live"
        : "Publication needs to be retried",
      label: "Needs attention",
      tone: "attention",
    };
  }
  return {
    detail: publication.livePublicIdentifier
      ? "An update is being prepared"
      : "The first publication is being prepared",
    label: publication.status === "retrying" ? "Retrying" : "Publishing",
    tone: "publishing",
  };
}

export default async function DashboardPage() {
  const { error, supabase, user, workspaceId } = await ensurePersonalWorkspace();
  const creatorName = getCreatorName(user.user_metadata);
  const dashboardData =
    !error && workspaceId
      ? await Promise.all([
          listInvitationDrafts(supabase, workspaceId),
          listInvitationPublicationStatuses(supabase, workspaceId),
          listInvitationResultSummaries(supabase, workspaceId),
        ])
      : null;
  const drafts = dashboardData?.[0] ?? [];
  const publicationStatuses = dashboardData?.[1] ?? {};
  const resultSummaries = dashboardData?.[2] ?? {};
  const workspaceTotals = drafts.reduce(
    (totals, draft) => {
      const result =
        resultSummaries[draft.invitationId] ?? emptyInvitationResultSummary(draft.invitationId);
      const publication = publicationStatuses[draft.invitationId];
      return {
        attendingGuests: totals.attendingGuests + result.attendingGuests,
        awaitingParties: totals.awaitingParties + result.awaitingParties,
        liveInvitations: totals.liveInvitations + (publication?.livePublicIdentifier ? 1 : 0),
        views: totals.views + result.viewCount,
      };
    },
    { attendingGuests: 0, awaitingParties: 0, liveInvitations: 0, views: 0 },
  );
  const attentionCount = drafts.filter((draft) => {
    const presentation = publicationPresentation(
      publicationStatuses[draft.invitationId],
      draft.revision,
    );
    return presentation.tone === "attention" || presentation.label === "Draft changes";
  }).length;

  return (
    <CreatorShell activePage="overview" email={user.email} metadata={user.user_metadata}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Personal workspace</p>
          <h1>{creatorName ? `Welcome back, ${creatorName}.` : "Welcome back."}</h1>
          <p className={styles.pageDescription}>
            See what is live, who has replied, and what needs your attention.
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
      ) : drafts.length === 0 ? (
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
      ) : (
        <>
          <section aria-label="Workspace results" className={styles.workspaceSummary}>
            <article>
              <span>Invitations</span>
              <strong>{drafts.length}</strong>
              <small>Saved in this workspace</small>
            </article>
            <article>
              <span>Live invitations</span>
              <strong>{workspaceTotals.liveInvitations}</strong>
              <small>Confirmed guest delivery</small>
            </article>
            <article>
              <span>Attending guests</span>
              <strong>{workspaceTotals.attendingGuests}</strong>
              <small>Across responding parties</small>
            </article>
            <article>
              <span>Awaiting reply</span>
              <strong>{workspaceTotals.awaitingParties}</strong>
              <small>Parties without a response</small>
            </article>
            <article>
              <span>Views</span>
              <strong>{workspaceTotals.views}</strong>
              <small>Approximate page loads</small>
            </article>
          </section>

          <div className={styles.dashboardGrid}>
            <section aria-labelledby="invitations-heading" id="invitations">
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.sectionLabel}>Invitation desk</p>
                  <h2 id="invitations-heading">Your invitations</h2>
                </div>
                <span className={styles.emptyCount}>
                  {drafts.length} saved {drafts.length === 1 ? "invitation" : "invitations"}
                </span>
              </div>

              <div className={styles.invitationList}>
                {drafts.map((draft) => {
                  const publication = publicationStatuses[draft.invitationId];
                  const presentation = publicationPresentation(publication, draft.revision);
                  const result =
                    resultSummaries[draft.invitationId] ??
                    emptyInvitationResultSummary(draft.invitationId);
                  return (
                    <article className={styles.invitationRow} key={draft.invitationId}>
                      <div className={styles.invitationIdentity}>
                        <div>
                          <p className={styles.cardLabel}>{draft.manifest.listing.name}</p>
                          <h3>{draft.title}</h3>
                          <p>{draft.dateLabel ?? "Date to be added"}</p>
                        </div>
                        <div className={styles.lifecycle}>
                          <span data-tone={presentation.tone}>{presentation.label}</span>
                          <small>{presentation.detail}</small>
                        </div>
                      </div>
                      <dl className={styles.invitationMetrics}>
                        <div>
                          <dt>Guest parties</dt>
                          <dd>{result.guestPartyCount}</dd>
                        </div>
                        <div>
                          <dt>Attending</dt>
                          <dd>{result.attendingGuests}</dd>
                        </div>
                        <div>
                          <dt>Awaiting</dt>
                          <dd>{result.awaitingParties}</dd>
                        </div>
                        <div>
                          <dt>Views</dt>
                          <dd>{result.viewCount}</dd>
                        </div>
                      </dl>
                      <div className={styles.invitationActions}>
                        <small>Updated {formatUpdatedAt(draft.updatedAt)}</small>
                        <div>
                          {publication?.livePublicIdentifier ? (
                            <Link
                              aria-label="Guests & RSVPs"
                              href={`/dashboard/guests?invitationId=${encodeURIComponent(draft.invitationId)}`}
                            >
                              <span className={styles.desktopActionLabel}>Guests &amp; RSVPs</span>
                              <span className={styles.mobileActionLabel}>Guests</span>
                            </Link>
                          ) : null}
                          <Link
                            aria-label="Continue editing"
                            href={`/dashboard/invitations/${draft.invitationId}`}
                          >
                            <span className={styles.desktopActionLabel}>Continue editing</span>
                            <span className={styles.mobileActionLabel}>Edit</span>
                            <ArrowRight />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className={styles.rail}>
              <section className={styles.gettingStarted}>
                <p className={styles.sectionLabel}>Needs attention</p>
                <h2>
                  {attentionCount
                    ? `${attentionCount} invitation update${attentionCount === 1 ? "" : "s"}`
                    : "Nothing urgent"}
                </h2>
                <p className={styles.responseDescription}>
                  {attentionCount
                    ? "Open the marked invitations to publish saved changes or retry delivery."
                    : "Published invitations and saved drafts have no known delivery issue."}
                </p>
                <Link className={styles.textLink} href="/dashboard/invitations">
                  Review invitation library <ArrowRight />
                </Link>
              </section>

              <section className={styles.responses} id="responses">
                <div className={styles.responseIcon}>
                  <Users />
                </div>
                <p className={styles.sectionLabel}>Guest responses</p>
                <h2>
                  {workspaceTotals.attendingGuests
                    ? `${workspaceTotals.attendingGuests} attending so far.`
                    : "Responses are ready to follow."}
                </h2>
                <p className={styles.responseDescription}>
                  View party-level attendance, messages, link state, and approximate invitation
                  views in the private ledger.
                </p>
                <Link className={styles.textLink} href="/dashboard/guests">
                  Manage guests &amp; RSVPs <ArrowRight />
                </Link>
              </section>
            </aside>
          </div>
        </>
      )}

      <footer className={styles.footer}>
        <span>Invitica creator workspace</span>
        <span>Invitations, thoughtfully made.</span>
      </footer>
    </CreatorShell>
  );
}
