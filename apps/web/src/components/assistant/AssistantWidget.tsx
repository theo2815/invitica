"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Close, Collapse, Expand } from "../Icons";
import { useDraftFlush } from "../invitations/DraftFlushProvider";
import styles from "./Assistant.module.css";
import { AssistantConversation } from "./AssistantConversation";
import { useAssistant } from "./AssistantProvider";
import { TalaMascot } from "./TalaMascot";
import { TalaPresence } from "./TalaPresence";

const COMPACT_QUERY = "(max-width: 900px)";
const ASSISTANT_PAGE = "/dashboard/assistant";

/** Starts `false` on the server and first client render, then follows the shared breakpoint. */
function useCompactViewport() {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const sync = () => setIsCompact(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return isCompact;
}

export function AssistantWidget() {
  const { close, isOpen, open } = useAssistant();
  const pathname = usePathname();
  const router = useRouter();
  const flushDraft = useDraftFlush();
  const isCompact = useCompactViewport();
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);
  /**
   * Whether the panel is at its taller size.
   *
   * Held here rather than in the provider because it describes this control's geometry and
   * nothing else — the page has no panel to expand. It survives closing, reopening, and
   * navigating, because the widget is mounted by the shell and only ever renders `null`;
   * a creator who has said once that they want the taller panel should not have to say it
   * again on the next route.
   */
  const [expanded, setExpanded] = useState(false);

  /**
   * Saves before it navigates, and never the other way round. The editor's own link guard
   * would otherwise meet this with a confirm dialog asking the creator to choose between
   * their unsaved work and the page they asked for — a choice there is no longer any reason
   * to make them make. A button rather than a link for the same reason: that guard watches
   * anchors.
   */
  async function openFullView() {
    if (leaving) return;
    setLeaving(true);
    try {
      await flushDraft();
      close();
      router.push(ASSISTANT_PAGE);
    } finally {
      setLeaving(false);
    }
  }

  /**
   * Puts focus inside the sheet without opening the keyboard.
   *
   * Only on compact, and only because the sheet is modal: leaving focus on the bubble that
   * the sheet has just hidden would strand a keyboard or screen-reader user outside the
   * thing they opened. Desktop needs none of this — the panel is not modal, the page behind
   * it stays usable, and the composer takes focus instead.
   */
  useEffect(() => {
    if (!isOpen || !isCompact) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [isCompact, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        bubbleRef.current?.focus();
        return;
      }

      // The mobile sheet covers the screen, so it is modal and Tab must not walk out of it
      // into content nobody can see. The desktop panel floats beside a page that stays
      // usable, so trapping there would be wrong.
      if (event.key !== "Tab" || !isCompact || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, isCompact, isOpen]);

  // The floating widget would sit on top of the page that shows the very same thread.
  if (pathname === ASSISTANT_PAGE) return null;

  return (
    <div className={styles.widget} data-open={isOpen}>
      {isOpen ? (
        <div
          aria-label="Tala, Invitica's AI assistant"
          aria-modal={isCompact ? true : undefined}
          className={styles.panel}
          data-expanded={expanded}
          id={panelId}
          ref={panelRef}
          role="dialog"
          // The sheet takes the screen, so focus has to land inside it. It lands on the
          // panel rather than the composer: focusing a textarea on a phone raises the
          // keyboard over the thread the creator just opened, before they have read a
          // word of it. On desktop the composer keeps the focus, because there is no
          // keyboard to raise and typing is what they came to do.
          tabIndex={isCompact ? -1 : undefined}
        >
          <header className={styles.panelHeader}>
            <div className={styles.panelIdentity}>
              <TalaPresence className={styles.panelMascot} size="compact" />
              <div className={styles.panelHeading}>
                <p className={styles.panelEyebrow}>Invitica AI</p>
                <h2 className={styles.panelTitle}>Tala</h2>
              </div>
            </div>
            <div className={styles.panelActions}>
              <button
                className={styles.panelAction}
                disabled={leaving}
                onClick={() => void openFullView()}
                type="button"
              >
                {leaving ? "Saving…" : "Open full view"}
                {leaving ? null : <ArrowUpRight />}
              </button>

              {/* Desktop only. The mobile sheet already fills the viewport, so there is
                  nothing for this to do there. */}
              {isCompact ? null : (
                <button
                  aria-pressed={expanded}
                  className={styles.panelIconAction}
                  onClick={() => setExpanded((current) => !current)}
                  title={expanded ? "Use the smaller panel" : "Make the panel taller"}
                  type="button"
                >
                  {expanded ? <Collapse /> : <Expand />}
                  <span className={styles.visuallyHidden}>
                    {expanded ? "Use the smaller panel" : "Make the panel taller"}
                  </span>
                </button>
              )}

              <button
                className={styles.panelIconAction}
                onClick={() => {
                  close();
                  bubbleRef.current?.focus();
                }}
                title="Close Tala"
                type="button"
              >
                <Close />
                <span className={styles.visuallyHidden}>Close Tala</span>
              </button>
            </div>
          </header>

          <AssistantConversation autoFocus={!isCompact} />
        </div>
      ) : null}

      <button
        aria-controls={isOpen ? panelId : undefined}
        aria-expanded={isOpen}
        className={styles.bubble}
        onClick={() => (isOpen ? close() : open())}
        ref={bubbleRef}
        type="button"
      >
        <span aria-hidden="true" className={styles.bubbleGlyph}>
          {isOpen ? <Close /> : <TalaMascot size="compact" state="idle" />}
        </span>
        <span className={styles.visuallyHidden}>
          {isOpen ? "Close Tala" : "Ask Tala, Invitica's AI assistant"}
        </span>
      </button>
    </div>
  );
}
