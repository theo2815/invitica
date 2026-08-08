"use client";

import { useState, useTransition } from "react";
import styles from "../../../app/account/delete/confirm/Confirm.module.css";
import { confirmAccountDeletion } from "../../server/account/actions";
import { AlertCircle } from "../Icons";

/**
 * The final act. One button, and no dialog in front of it.
 *
 * A third confirmation would be theatre: the creator has already confirmed in Settings and opened
 * a link from their own inbox, and a dialog stacked on a page that exists only to ask this
 * question teaches people to click through warnings. What this does instead is name the work while
 * it runs — the purge reaches R2 once per published invitation, so on a slow connection this is
 * measured in seconds, and a button that simply sits there looks broken.
 */
export function DeleteAccountConfirmForm({ token }: { token: string }) {
  const [error, setError] = useState<null | string>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      // A success redirects and never returns, so anything that comes back is a failure.
      const result = await confirmAccountDeletion(token);
      setError(result.error ?? "Your account could not be deleted. Please try again.");
    });
  }

  return (
    <>
      {error ? (
        <p className={styles.error} role="alert">
          <AlertCircle />
          <span>{error}</span>
        </p>
      ) : null}

      <button className={styles.destructive} disabled={pending} onClick={confirm} type="button">
        {pending ? "Deleting your account…" : "Delete my account permanently"}
      </button>

      {pending ? (
        <p className={styles.progress} role="status">
          Taking your published invitations off the guest links, then removing your account. Do not
          close this page.
        </p>
      ) : null}
    </>
  );
}
