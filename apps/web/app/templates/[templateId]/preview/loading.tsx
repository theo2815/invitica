import styles from "./PreviewRouteFeedback.module.css";

export default function TemplatePreviewLoading() {
  return (
    <main aria-busy="true" className={styles.shell}>
      <section aria-atomic="true" className={styles.card} role="status">
        <p className={styles.eyebrow}>Invitica preview</p>
        <h1>Preparing the invitation…</h1>
        <p>The full template will appear here as soon as it is ready.</p>
      </section>
    </main>
  );
}
