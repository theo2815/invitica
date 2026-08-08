import styles from "./CreatorRouteFeedback.module.css";

interface CreatorRouteSkeletonProps {
  label: string;
  variant: "assistant" | "editor" | "guests" | "invitations" | "overview" | "templates";
}

export function CreatorRouteSkeleton({ label, variant }: CreatorRouteSkeletonProps) {
  return (
    <section aria-label={label} className={styles.skeleton} data-variant={variant} role="status">
      <span className={styles.visuallyHidden}>{label}…</span>
      <div aria-hidden="true" className={styles.skeletonHeader}>
        <span />
        <span />
        <span />
      </div>
      <div aria-hidden="true" className={styles.skeletonPanel} />
      <div aria-hidden="true" className={styles.skeletonCards}>
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
