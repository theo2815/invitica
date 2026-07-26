"use client";

import { useTransition } from "react";

import styles from "./CreatorRouteFeedback.module.css";

interface CreatorRouteErrorProps {
  description: string;
  reset: () => void;
  title: string;
}

export function CreatorRouteError({ description, reset, title }: CreatorRouteErrorProps) {
  const [pending, startRetry] = useTransition();

  return (
    <section aria-busy={pending || undefined} className={styles.error} role="alert">
      <p className={styles.eyebrow}>Something went wrong</p>
      <h1>{title}</h1>
      <p className={styles.description}>{description}</p>
      <button disabled={pending} onClick={() => startRetry(() => reset())} type="button">
        {pending ? "Trying again…" : "Try again"}
      </button>
    </section>
  );
}
