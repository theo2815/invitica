"use client";

import styles from "./Invitations.module.css";

interface InvitationsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function InvitationsError({ reset }: InvitationsErrorProps) {
  return (
    <main className={styles.routeErrorPage}>
      <section className={styles.routeError} role="alert">
        <p className={styles.label}>Something went wrong</p>
        <h1>Invitations could not be loaded.</h1>
        <p>Your invitation data was not changed. Try loading this workspace again.</p>
        <button onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
