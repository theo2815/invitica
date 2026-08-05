import { notFound } from "next/navigation";

import { AssistantConversation } from "../../../src/components/assistant/AssistantConversation";
import { assistantEnabled } from "../../../src/server/assistant/budget";
import styles from "./Assistant.module.css";

export default function AssistantPage() {
  // The kill switch removes the route as well as the widget. A page that renders a composer
  // whose every request is refused would be worse than no page.
  if (!assistantEnabled()) notFound();

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Assistant</p>
          <h1>How Invitica works</h1>
          <p className={styles.pageDescription}>
            Ask about anything in Invitica. Answers come from Invitica's own help material, and the
            assistant never changes your invitations, your guests, or your replies.
          </p>
        </div>
      </header>

      <section className={styles.surface}>
        <AssistantConversation />
      </section>

      <footer className={styles.footer}>
        <span>Invitica assistant</span>
        <span>It explains; you decide.</span>
      </footer>
    </>
  );
}
