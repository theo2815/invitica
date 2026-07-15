"use client";

import styles from "./Templates.module.css";

interface TemplatesErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TemplatesError({ reset }: TemplatesErrorProps) {
  return (
    <main className={styles.routeErrorPage}>
      <section className={styles.routeError} role="alert">
        <p className={styles.label}>Something went wrong</p>
        <h1>Templates could not be loaded.</h1>
        <p>Your invitation data was not changed. Try loading the template collection again.</p>
        <button onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
