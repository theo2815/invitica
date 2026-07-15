import styles from "./Invitations.module.css";

export default function InvitationsLoading() {
  return (
    <main aria-label="Loading invitations" className={styles.loadingPage} role="status">
      <aside aria-hidden="true" className={styles.loadingSidebar}>
        <span className={styles.loadingBrand} />
        <span />
        <span />
        <span />
        <span />
      </aside>
      <div aria-hidden="true" className={styles.loadingContent}>
        <div className={styles.loadingTitle} />
        <div className={styles.loadingRule} />
        <div className={styles.loadingPanel} />
        <div className={styles.loadingSteps} />
      </div>
      <span className={styles.visuallyHidden}>Loading invitations…</span>
    </main>
  );
}
