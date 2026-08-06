import Link from "next/link";
import type { ReactNode } from "react";

import { assistantEnabled } from "../../server/assistant/budget";
import { AssistantProvider } from "../assistant/AssistantProvider";
import { AssistantWidget } from "../assistant/AssistantWidget";
import { BrandMark } from "../BrandMark";
import { DraftFlushProvider } from "../invitations/DraftFlushProvider";
import { CreatorNavigation, CreatorRouteFocus } from "./CreatorNavigation";
import styles from "./CreatorShell.module.css";
import { ProfileMenu } from "./ProfileMenu";
import { PullToRefresh } from "./PullToRefresh";

interface CreatorShellProps {
  children: ReactNode;
  email: string | undefined;
  metadata: Record<string, unknown>;
}

export function getCreatorName(metadata: Record<string, unknown>) {
  const fullName = metadata.full_name;

  if (typeof fullName !== "string") {
    return null;
  }

  return fullName.trim().split(/\s+/)[0] || null;
}

export function CreatorShell({ children, email, metadata }: CreatorShellProps) {
  const creatorName = getCreatorName(metadata);
  // Read on the server, so the kill switch removes the widget, its thread, and its client
  // code rather than hiding a feature that is still shipped and still reachable.
  const assistant = assistantEnabled();

  // `data-surface` lets `globals.css` raise the document background to this shell's header colour.
  // iOS fills the status-bar strip from the document, not from the header element, so without it
  // the strip stays cream and seams against the lighter header.
  return (
    <div className={styles.page} data-surface="creator">
      <a className="skip-link" href="#creator-content">
        Skip to creator content
      </a>

      <aside className={styles.sidebar}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>

        <CreatorNavigation showAssistant={assistant} variant="desktop" />

        <ProfileMenu creatorName={creatorName} email={email} variant="desktop" />
      </aside>

      <header className={styles.mobileHeader}>
        <Link aria-label="Invitica home" className={styles.brand} href="/">
          <BrandMark />
        </Link>
        <ProfileMenu creatorName={creatorName} email={email} variant="mobile" />
      </header>

      {/* Both providers wrap the content as well as the widget: the assistant so
          `/dashboard/assistant` reads the same thread the floating panel holds, and the
          flush registry so the panel's controls can settle an open editor's draft before
          they navigate away from it. */}
      <DraftFlushProvider>
        <AssistantProvider>
          <main className={styles.content} id="creator-content" tabIndex={-1}>
            {children}
          </main>

          <CreatorNavigation variant="mobile" />
          <CreatorRouteFocus />
          <PullToRefresh />
          {assistant ? <AssistantWidget /> : null}
        </AssistantProvider>
      </DraftFlushProvider>
    </div>
  );
}
