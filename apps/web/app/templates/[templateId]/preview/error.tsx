"use client";

import Link from "next/link";
import { useTransition } from "react";

import styles from "./PreviewRouteFeedback.module.css";

export default function TemplatePreviewError({ reset }: { reset: () => void }) {
  const [pending, startRetry] = useTransition();

  return (
    <main className={styles.shell}>
      <section aria-busy={pending || undefined} className={styles.card}>
        <p className={styles.eyebrow}>Preview interrupted</p>
        <h1>The invitation could not open.</h1>
        <p>Your template is still safe. Retry the preview, or return to the template collection.</p>
        <div className={styles.actions}>
          <button disabled={pending} onClick={() => startRetry(() => reset())} type="button">
            {pending ? "Retrying preview…" : "Retry preview"}
          </button>
          <Link href="/#templates">Back to templates</Link>
        </div>
      </section>
    </main>
  );
}
