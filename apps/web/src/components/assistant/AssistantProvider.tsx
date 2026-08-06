"use client";

import type { InvitationDocument } from "@invitica/invitation-schema";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AssistantApiMessage, ParsedGuestParty } from "../../contracts/assistant-api";
import type { SectionDocumentDetails } from "../../lib/invitations/little-blessings-details";
import { requestGuestParties } from "./guest-parsing";

export type AssistantStatus = "answering" | "idle";

/**
 * What the assistant does with the next thing the creator types.
 *
 * Explicit rather than inferred. "How do I publish?", "make it a garden wedding", and a
 * pasted guest list are three requests to three endpoints at three costs, and the only way
 * to tell them apart automatically would be to ask a model first — a billed call to decide
 * where to send the next one.
 */
export type AssistantMode = "document" | "guests" | "help";

/**
 * A drafted invitation waiting for the creator to accept it.
 *
 * Everything here was validated on the server before it was sent, so the client stores it
 * as-is and never re-derives it. It is kept in the shell rather than in the editor because
 * `/dashboard/assistant` and the editor are different routes: a proposal drafted on the page
 * has to survive the navigation to the editor that applies it.
 *
 * `revision` records which draft it was drafted against, so a proposal cannot be applied on
 * top of a draft that has moved on since.
 */
export interface AssistantProposal {
  details: SectionDocumentDetails;
  document: InvitationDocument;
  invitationId: string;
  revision: number;
}

/**
 * Guest rows waiting for the creator to review them in the Guest Desk.
 *
 * Held here for the same reason a document proposal is: the panel floats over every route
 * and the composer that creates these rows lives on one of them, so the parse has to survive
 * the navigation between them. Nothing is serialized through the URL or storage — these are
 * guests' names, and a URL is the one place in this product they must never appear.
 *
 * Every row has already passed `guestPartyInputSchema` on the server, so the client stores
 * them as-is and never re-derives them.
 */
export interface AssistantGuestList {
  invitationId: string;
  parties: ParsedGuestParty[];
}

interface AssistantContextValue {
  clear: () => void;
  clearGuestList: () => void;
  clearProposal: () => void;
  close: () => void;
  guestList: AssistantGuestList | null;
  /** The invitation the creator is currently working on, or null off an editor. */
  invitationId: null | string;
  isOpen: boolean;
  messages: AssistantApiMessage[];
  mode: AssistantMode;
  notice: null | string;
  open: () => void;
  proposal: AssistantProposal | null;
  send: (text: string) => Promise<void>;
  setInvitationId: (invitationId: null | string) => void;
  setMode: (mode: AssistantMode) => void;
  status: AssistantStatus;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider.");
  return value;
}

/**
 * For surfaces the assistant enhances but does not own.
 *
 * The invitation editor is the case this exists for: it has to work whether or not an
 * assistant is mounted above it, because the editor is the product and the assistant is an
 * addition to it. Throwing there would invert that — a component that edits invitations
 * would refuse to render because a help feature was absent.
 */
export function useOptionalAssistant() {
  return useContext(AssistantContext);
}

/**
 * Holds the assistant thread for the whole creator session.
 *
 * It lives in the creator shell rather than in a route because the point of a floating
 * assistant is that a creator can ask a question without leaving what they were doing. A
 * thread that reset on the first tap of Invitations would remove the reason it floats.
 * `/dashboard/assistant` reads the same thread from here, so expanding is a change of
 * room, not a fresh start.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<AssistantApiMessage[]>([]);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [notice, setNotice] = useState<null | string>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<AssistantMode>("help");
  const [invitationId, setInvitationId] = useState<null | string>(null);
  const [proposal, setProposal] = useState<AssistantProposal | null>(null);
  const [guestList, setGuestList] = useState<AssistantGuestList | null>(null);
  // One answer at a time. Without this a second Enter while the first answer is still
  // streaming would spend a second message from the daily allowance and interleave the two.
  const inFlight = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || inFlight.current) return;

      const drafting = mode === "document" && invitationId !== null;
      const organizing = mode === "guests" && invitationId !== null;

      inFlight.current = true;
      setNotice(null);
      setStatus("answering");

      if (organizing) {
        const history: AssistantApiMessage[] = [
          ...messages.filter((message) => message.content.trim().length > 0),
          { content: question, role: "user" },
        ];
        setMessages(history);

        const result = await requestGuestParties(invitationId, history);

        if (result.status === "refused") {
          setNotice(result.message);
        } else {
          setGuestList({ invitationId, parties: result.parties });
          // Invitica's own sentence, not the model's. The rows themselves are the answer and
          // they are listed underneath where a creator can count them; restating them as
          // prose would be a second, less reliable copy of other people's names.
          setMessages([
            ...history,
            {
              content:
                result.parties.length === 1
                  ? "I found 1 invitation in that list. Open the Guest Desk to check it before anything is created."
                  : `I found ${result.parties.length} invitations in that list. Open the Guest Desk to check them before anything is created.`,
              role: "assistant",
            },
          ]);
        }

        inFlight.current = false;
        setStatus("idle");
        return;
      }

      if (drafting) {
        const history: AssistantApiMessage[] = [
          ...messages.filter((message) => message.content.trim().length > 0),
          { content: question, role: "user" },
        ];
        setMessages(history);

        try {
          const response = await fetch("/api/creator/assistant/document", {
            body: JSON.stringify({ invitationId, messages: history }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });

          const body = (await response.json()) as {
            details?: SectionDocumentDetails;
            document?: InvitationDocument;
            message?: string;
            revision?: number;
            status?: string;
          };

          if (body.status !== "proposed" || !body.document || !body.details) {
            setNotice(body.message ?? "Tala is unavailable right now.");
            return;
          }

          setProposal({
            details: body.details,
            document: body.document,
            invitationId,
            revision: body.revision ?? 0,
          });
          // The thread carries a sentence Invitica wrote, not the model's output. The draft
          // itself is the answer, and it is shown in the preview where the creator can judge
          // it — restating it as prose would be a second, less reliable copy.
          setMessages([
            ...history,
            {
              content:
                "I have drafted this into your invitation. Look it over in the preview, then keep it or discard it.",
              role: "assistant",
            },
          ]);
        } catch {
          setNotice("Invitica could not reach Tala. Check your connection and try again.");
        } finally {
          inFlight.current = false;
          setStatus("idle");
        }

        return;
      }

      // Built before the empty placeholder is added, and filtered, so an answer that failed
      // halfway cannot send an empty message the contract will reject.
      const history: AssistantApiMessage[] = [
        ...messages.filter((message) => message.content.trim().length > 0),
        { content: question, role: "user" },
      ];

      setMessages([...history, { content: "", role: "assistant" }]);

      try {
        const response = await fetch("/api/creator/assistant", {
          body: JSON.stringify({ messages: history }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });

        // A refusal and an error both come back as JSON; only a real answer streams as text.
        if (response.headers.get("content-type")?.includes("application/json")) {
          const body = (await response.json()) as { message?: string };
          setMessages(history);
          setNotice(body.message ?? "Tala is unavailable right now.");
          return;
        }

        if (!response.ok || !response.body) {
          setMessages(history);
          setNotice("Tala is unavailable right now. Try again in a moment.");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setMessages([...history, { content: answer, role: "assistant" }]);
        }

        if (!answer.trim()) {
          setMessages(history);
          setNotice("Tala did not manage an answer. Try asking again.");
        }
      } catch {
        setMessages(history);
        setNotice("Invitica could not reach Tala. Check your connection and try again.");
      } finally {
        inFlight.current = false;
        setStatus("idle");
      }
    },
    [invitationId, messages, mode],
  );

  // Stable across renders because the editor holds it in a `useCallback` dependency list;
  // an identity that changed with every streamed chunk would rebuild that callback, and
  // with it every field handler in the editor, on each token.
  const clearProposal = useCallback(() => setProposal(null), []);

  /**
   * Called once the Guest Desk has taken the rows, and by Start over.
   *
   * Worth being deliberate about: these are guests' names sitting in browser memory, so they
   * are dropped as soon as the surface that needs them has them rather than being left in
   * the shell for the rest of the session.
   */
  const clearGuestList = useCallback(() => setGuestList(null), []);

  const value = useMemo<AssistantContextValue>(
    () => ({
      clear: () => {
        setMessages([]);
        setNotice(null);
        setProposal(null);
        setGuestList(null);
      },
      clearGuestList,
      clearProposal,
      close: () => setIsOpen(false),
      guestList,
      invitationId,
      isOpen,
      messages,
      mode,
      notice,
      open: () => setIsOpen(true),
      proposal,
      send,
      setInvitationId,
      setMode,
      status,
    }),
    [
      clearGuestList,
      clearProposal,
      guestList,
      invitationId,
      isOpen,
      messages,
      mode,
      notice,
      proposal,
      send,
      status,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
