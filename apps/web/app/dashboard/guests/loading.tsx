import styles from "./Guests.module.css";

export default function GuestsLoading() {
  return (
    <main aria-label="Loading guests and RSVPs" className={styles.loadingPage} role="status">
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
        <div className={styles.loadingContext} />
        <div className={styles.loadingSummary} />
        <div className={styles.loadingLedger} />
      </div>
      <span className={styles.visuallyHidden}>Loading guests and RSVPs...</span>
    </main>
  );
}
