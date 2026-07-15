import styles from "./Templates.module.css";

export default function TemplatesLoading() {
  return (
    <main aria-label="Loading templates" className={styles.loadingPage} role="status">
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
        <div className={styles.loadingControls} />
        <div className={styles.loadingCards} />
      </div>
      <span className={styles.visuallyHidden}>Loading templates...</span>
    </main>
  );
}
