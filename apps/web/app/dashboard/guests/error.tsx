"use client";

import styles from "./Guests.module.css";

interface GuestsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GuestsError({ reset }: GuestsErrorProps) {
  return (
    <main className={styles.routeErrorPage}>
      <section className={styles.routeError} role="alert">
        <p className={styles.label}>Something went wrong</p>
        <h1>Guests and RSVPs could not be loaded.</h1>
        <p>No guest information was changed. Try loading this workspace again.</p>
        <button onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
