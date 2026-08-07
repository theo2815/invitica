import Link from "next/link";

import { DeleteAccountConfirmForm } from "../../../../src/components/settings/DeleteAccountConfirmForm";
import {
  DELETION_LINK_MINUTES,
  type DeletionTokenState,
  resolveDeletionToken,
} from "../../../../src/server/account/deletion";
import { getOptionalConfirmedUser } from "../../../../src/server/auth/session";
import styles from "./Confirm.module.css";

export const metadata = {
  title: "Confirm account deletion",
  // A deletion link must never be followed by a crawler, and must never be indexed with its token.
  robots: { follow: false, index: false },
};

interface ConfirmPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

type PageState = DeletionTokenState | "missing" | "signed-out" | "unavailable";

export default async function ConfirmAccountDeletionPage({ searchParams }: ConfirmPageProps) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const session = await getOptionalConfirmedUser();

  let state: PageState;

  if (!token) {
    state = "missing";
  } else if (!session) {
    // Deliberately not `requireConfirmedUser`: that redirects to sign-in and drops the token.
    state = "signed-out";
  } else {
    try {
      // `claim: false` — reading this page must not spend the link. Only the button does.
      state = await resolveDeletionToken(session.supabase, token, false);
    } catch {
      state = "unavailable";
    }
  }

  const signInHref = `/login?next=${encodeURIComponent(`/account/delete/confirm?token=${token}`)}`;

  return (
    <main className={styles.page} data-surface="auth">
      <section className={styles.card}>
        <p className={styles.eyebrow}>Delete account</p>

        {state === "valid" && session?.user.email ? (
          <>
            <h1>Delete your Invitica account?</h1>
            <p className={styles.lead}>
              This is the last step. Everything below is removed permanently, and it cannot be
              undone.
            </p>
            <ul className={styles.consequences}>
              <li>Every invitation you have made, published or not.</li>
              <li>Every invitation link you have shared stops opening for your guests.</li>
              <li>Your guest lists and every reply your guests have sent.</li>
              <li>Your saved conversations with Invi.</li>
            </ul>
            <p className={styles.account}>
              Signed in as <strong>{session.user.email}</strong>.
            </p>
            <DeleteAccountConfirmForm token={token} />
          </>
        ) : null}

        {state === "signed-out" ? (
          <>
            <h1>Sign in to finish</h1>
            <p className={styles.lead}>
              A deletion link is not enough on its own. Sign in to the account you want to delete
              and this page will continue from here.
            </p>
            <Link className={styles.primaryLink} href={signInHref}>
              Sign in
            </Link>
          </>
        ) : null}

        {state === "expired" ? (
          <>
            <h1>This link has expired</h1>
            <p className={styles.lead}>
              Deletion links last {DELETION_LINK_MINUTES} minutes. Your account has not been
              changed. Start again from Settings if you still want to delete it.
            </p>
            <Link className={styles.primaryLink} href="/dashboard/settings">
              Back to Settings
            </Link>
          </>
        ) : null}

        {state === "used" ? (
          <>
            <h1>This link has already been used</h1>
            <p className={styles.lead}>
              A deletion link works once. If your account still exists, the deletion did not
              complete — start again from Settings.
            </p>
            <Link className={styles.primaryLink} href="/dashboard/settings">
              Back to Settings
            </Link>
          </>
        ) : null}

        {state === "unknown" || state === "missing" ? (
          <>
            <h1>This link is not valid here</h1>
            {/* One message covers a token that never existed, one that was replaced by a newer
                request, and one belonging to a different account. Separating them would tell
                whoever holds the link which guess was closest. */}
            <p className={styles.lead}>
              It may have been replaced by a newer request, or it may belong to a different account.
              Your account has not been changed.
            </p>
            <div className={styles.actions}>
              <Link className={styles.primaryLink} href="/dashboard/settings">
                Back to Settings
              </Link>
              <Link className={styles.secondaryLink} href="/login">
                Sign in as someone else
              </Link>
            </div>
          </>
        ) : null}

        {state === "unavailable" ? (
          <>
            <h1>We could not check this link</h1>
            <p className={styles.lead}>
              Something went wrong reaching Invitica. Nothing was deleted. Try the link again in a
              moment.
            </p>
            <Link className={styles.primaryLink} href="/dashboard/settings">
              Back to Settings
            </Link>
          </>
        ) : null}
      </section>
    </main>
  );
}
