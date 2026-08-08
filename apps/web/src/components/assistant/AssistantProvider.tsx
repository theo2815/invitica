"use client";

import type { InvitationDocument } from "@invitica/invitation-schema";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type AssistantApiMessage,
  type AssistantConversationSummary,
  type AssistantMode,
  conversationTitle,
  conversationWindow,
  draftedMessage,
  guestConversationPayload,
  guestListMessage,
  guestQuestionsMessage,
  intakeQuestionsMessage,
  type ParsedGuestParty,
} from "../../contracts/assistant-api";
import type { SectionDocumentDetails } from "../../lib/invitations/little-blessings-details";
import {
  deleteAssistantConversationAction,
  listAssistantConversationsAction,
  loadAssistantConversationAction,
  readAssistantUsageAction,
  saveAssistantConversationAction,
} from "../../server/assistant/actions";
import type { AssistantUsage } from "../../server/assistant/usage";
import { requestGuestParties } from "./guest-parsing";

export type AssistantStatus = "answering" | "idle";

/**
 * How much is known about today's allowance.
 *
 * `idle` is not `unavailable`. Before a creator opens Invi nothing has been asked, and a
 * meter that reported "unavailable" for a question nobody put would be a false alarm on
 * every dashboard page. The read happens when the assistant is first opened, so a creator
 * who never uses it never pays for the round trip — which matters on the connections this
 * product is built for.
 */
export type AssistantUsageStatus = "idle" | "loading" | "ready" | "unavailable";

export type { AssistantUsage };

/**
 * The page the creator is on, in the words they would use for it.
 *
 * Named rather than sent as a path, because the answer this shapes is a sentence a creator
 * reads — "you are already on the Templates page" is useful, "you are on /dashboard/templates"
 * is Invitica talking to itself. Unknown routes send nothing at all.
 */
function describeSurface(pathname: null | string): string | undefined {
  if (!pathname) return undefined;

  if (pathname === "/dashboard") return "Overview";
  if (pathname === "/dashboard/templates") return "the Templates catalog";
  if (pathname === "/dashboard/invitations") return "their Invitations library";
  if (pathname === "/dashboard/guests") return "Guests & RSVPs, the Guest Desk";
  if (pathname === "/dashboard/assistant") return "the full Invi page";
  if (pathname.startsWith("/dashboard/invitations/")) return "the invitation editor";

  return undefined;
}

export type { AssistantMode };

/**
 * What Invi can actually do with the invitation currently in context.
 *
 * Neither of these is knowable from the id alone, and both decide whether a tab leads
 * somewhere: drafting needs the shared section-document editor, because the legacy Garden
 * Promise v1 editor has no surface that can apply a proposal, and organizing needs a published
 * invitation, because guest parties belong to one.
 *
 * Whoever sets the invitation states them, and both default to false. A wrong false costs a
 * suggestion that was not made; a wrong true sends a creator to a tab that refuses them.
 */
export interface AssistantInvitationAbilities {
  canDraft: boolean;
  canOrganize: boolean;
}

const NO_ABILITIES: AssistantInvitationAbilities = { canDraft: false, canOrganize: false };

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
  /** What the invitation in context supports. All false when none is selected. */
  abilities: AssistantInvitationAbilities;
  clearGuestList: () => void;
  clearProposal: () => void;
  close: () => void;
  /** The saved conversation this thread is being written to, or null before its first save. */
  conversationId: null | string;
  conversations: AssistantConversationSummary[];
  deleteConversation: (conversationId: string) => Promise<void>;
  /**
   * Rewinds to just before the creator's last message and hands its text back, so the
   * composer can be refilled with it.
   */
  editLastMessage: () => null | string;
  guestList: AssistantGuestList | null;
  historyStatus: AssistantHistoryStatus;
  /** The invitation the creator is currently working on, or null off an editor. */
  invitationId: null | string;
  isOpen: boolean;
  messages: AssistantApiMessage[];
  mode: AssistantMode;
  notice: null | string;
  open: () => void;
  openConversation: (conversationId: string) => Promise<void>;
  proposal: AssistantProposal | null;
  refreshConversations: () => Promise<void>;
  send: (text: string) => Promise<void>;
  /**
   * Names the invitation Invi is working against, and what may be done with it.
   *
   * The abilities travel with the id rather than in a setter of their own, so there is no
   * moment where the two disagree — an invitation swapped without them would otherwise keep
   * the last one's.
   */
  setInvitationId: (invitationId: null | string, abilities?: AssistantInvitationAbilities) => void;
  setMode: (mode: AssistantMode) => void;
  /** Starts a fresh thread. The one on screen stays in history rather than being lost. */
  startNewConversation: () => void;
  status: AssistantStatus;
  /** Abandons the answer in flight. Whatever arrived stays on screen. */
  stop: () => void;
  /** True from the moment the creator stops an answer until they send the next one. */
  stopped: boolean;
  /** Today's allowance, or null until it has been read successfully. */
  usage: AssistantUsage | null;
  /** Reads today's allowance again. Safe to call repeatedly; it never writes. */
  refreshUsage: () => Promise<void>;
  usageStatus: AssistantUsageStatus;
}

export type AssistantHistoryStatus = "idle" | "loading";

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
  const [invitationId, setInvitationIdState] = useState<null | string>(null);
  const [abilities, setAbilities] = useState<AssistantInvitationAbilities>(NO_ABILITIES);
  const [proposal, setProposal] = useState<AssistantProposal | null>(null);
  const [guestList, setGuestList] = useState<AssistantGuestList | null>(null);
  const [conversationId, setConversationIdState] = useState<null | string>(null);
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([]);
  const [historyStatus, setHistoryStatus] = useState<AssistantHistoryStatus>("idle");
  const [stopped, setStopped] = useState(false);
  const [usage, setUsage] = useState<AssistantUsage | null>(null);
  const [usageStatus, setUsageStatus] = useState<AssistantUsageStatus>("idle");
  // One read at a time. Opening the panel and finishing a turn in the same moment would
  // otherwise put two identical round trips on a connection that may not have room for one.
  const usageInFlight = useRef(false);
  const surface = describeSurface(usePathname());
  // One answer at a time. Without this a second Enter while the first answer is still
  // streaming would spend a second message from the daily allowance and interleave the two.
  const inFlight = useRef(false);
  /**
   * The answer currently in flight, so Stop can abandon it.
   *
   * A streamed help answer stops where it stopped and keeps what arrived. A draft or a
   * guest parse is one request, so stopping abandons the response rather than shortening
   * it — the message was already spent and the model may still finish server-side. That is
   * what the creator asked for: a way out of a turn they did not mean to start.
   */
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Read by `persist`, which runs after several awaits.
   *
   * A ref rather than the state above because a creator who opens a different saved thread
   * mid-answer must not have the answer written into it — the closure `send` captured
   * would still hold the old id.
   */
  const conversationIdRef = useRef<null | string>(null);

  const setConversationId = useCallback((next: null | string) => {
    conversationIdRef.current = next;
    setConversationIdState(next);
  }, []);

  const setInvitationId = useCallback(
    (next: null | string, nextAbilities?: AssistantInvitationAbilities) => {
      setInvitationIdState(next);
      // Releasing the invitation releases the abilities with it. Left behind, they would
      // describe an invitation that is no longer on screen.
      const resolved = next && nextAbilities ? nextAbilities : NO_ABILITIES;
      setAbilities(resolved);

      /**
       * The mode goes with them when it can no longer be honoured.
       *
       * Mode survived navigation while the invitation did not, and nothing reconciled the
       * two. A creator who left the Guest Desk in organizing mode arrived on the next route
       * with `mode === "guests"` and no invitation: the tabs were hidden, so nothing showed
       * it, the composer still said "Paste your guest list", and `send` fell through to the
       * help endpoint because organizing needs both. They pasted a guest list into a box
       * that asked for one and got an answer to it as a question.
       *
       * Falling back to help is the safe direction — it is the mode that needs nothing.
       */
      setMode((current) =>
        (current === "document" && !resolved.canDraft) ||
        (current === "guests" && !resolved.canOrganize)
          ? "help"
          : current,
      );
    },
    [],
  );

  /**
   * Re-reads today's allowance from the database rather than counting in the browser.
   *
   * Counting here would be wrong in four ordinary ways: a refused message spends nothing,
   * a reload forgets, a second device is invisible, and the Manila midnight rollover
   * happens whether or not this tab is awake. The read is a primary-key lookup on one row
   * and it never writes, so calling it after every turn costs a creator nothing.
   *
   * A failure leaves the last good numbers on screen if there are any, and only reports
   * `unavailable` when there is nothing to show. A meter that blanks itself on one dropped
   * request would be less useful than a slightly stale one.
   */
  const refreshUsage = useCallback(async () => {
    if (usageInFlight.current) return;
    usageInFlight.current = true;
    setUsageStatus((current) => (current === "ready" ? current : "loading"));

    try {
      const next = await readAssistantUsageAction();
      if (next) {
        setUsage(next);
        setUsageStatus("ready");
      } else {
        setUsageStatus((current) => (current === "ready" ? current : "unavailable"));
      }
    } catch {
      setUsageStatus((current) => (current === "ready" ? current : "unavailable"));
    } finally {
      usageInFlight.current = false;
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await listAssistantConversationsAction());
    } catch {
      // History is a convenience over a conversation that already works without it. A list
      // that will not load leaves the creator talking to Invi, not looking at an error.
    }
  }, []);

  /**
   * Writes the thread to history after a turn settles.
   *
   * Deliberately not awaited by the caller and deliberately silent on failure: a save that
   * did not happen costs a record, and interrupting the creator over it would cost the
   * conversation they were having.
   */
  const persist = useCallback(
    async (thread: AssistantApiMessage[]) => {
      if (thread.length === 0) return;

      try {
        const saved = await saveAssistantConversationAction({
          conversationId: conversationIdRef.current,
          messages: thread,
          title: conversationTitle(thread),
        });

        if (!saved) return;
        setConversationId(saved);
        await refreshConversations();
      } catch {
        // As above.
      }
    },
    [refreshConversations, setConversationId],
  );

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || inFlight.current) return;

      // The abilities are checked here as well as when the mode was chosen. Routing a
      // message is the last point at which a stale mode can still cost a creator the wrong
      // endpoint, so it is the one place worth stating the rule twice.
      const drafting = mode === "document" && invitationId !== null && abilities.canDraft;
      const organizing = mode === "guests" && invitationId !== null && abilities.canOrganize;

      const controller = new AbortController();
      abortRef.current = controller;
      inFlight.current = true;
      setNotice(null);
      setStopped(false);
      setStatus("answering");

      // Filtered so an answer that failed halfway cannot send an empty message the
      // contract rejects, and windowed so a thread continued from history cannot outgrow
      // the twenty messages one request may carry.
      const history: AssistantApiMessage[] = [
        ...messages.filter((message) => message.content.trim().length > 0),
        { content: question, role: "user" },
      ];

      function settle() {
        abortRef.current = null;
        inFlight.current = false;
        setStatus("idle");
        // Every path through this function has spent a message by the time it settles,
        // including the refused and the stopped ones — the allowance is taken before the
        // provider is reached. Re-reading here is what keeps the meter honest about that.
        void refreshUsage();
      }

      if (organizing) {
        setMessages(history);

        // The rows already on screen ride with the turn, so "the Santos family is six" is
        // answered against the list the creator is looking at rather than re-derived from
        // their first paste. Built here and never stored: it must not enter the thread, and
        // through the thread, history.
        const carried = guestList?.invitationId === invitationId ? guestList.parties : undefined;

        const result = await requestGuestParties(
          invitationId,
          guestConversationPayload(history, carried),
          controller.signal,
        );

        if (controller.signal.aborted) {
          setStopped(true);
          settle();
          void persist(history);
          return;
        }

        if (result.status === "refused") {
          setNotice(result.message);
          settle();
          void persist(history);
          return;
        }

        // Nothing could be sorted, and Invi said what it needs. The rows already on screen
        // stay exactly as they are — a question is not a reason to take them away.
        if (result.status === "questions") {
          const asked: AssistantApiMessage[] = [
            ...history,
            { content: guestQuestionsMessage(result.questions), role: "assistant" },
          ];
          setMessages(asked);
          settle();
          void persist(asked);
          return;
        }

        setGuestList({ invitationId, parties: result.parties });
        // Invitica's own sentence, not the model's. The rows themselves are the answer and
        // they are listed underneath where a creator can count them; restating them as
        // prose would be a second, less reliable copy of other people's names. Any questions
        // after it are the model's own words, because they are about this creator's list.
        const answered: AssistantApiMessage[] = [
          ...history,
          {
            content: guestListMessage(result.parties.length, result.questions),
            role: "assistant",
          },
        ];
        setMessages(answered);
        settle();
        void persist(answered);
        return;
      }

      if (drafting) {
        setMessages(history);
        let settled = history;

        try {
          const response = await fetch("/api/creator/assistant/document", {
            body: JSON.stringify({ invitationId, messages: conversationWindow(history) }),
            headers: { "content-type": "application/json" },
            method: "POST",
            signal: controller.signal,
          });

          const body = (await response.json()) as {
            details?: SectionDocumentDetails;
            document?: InvitationDocument;
            message?: string;
            questions?: string[];
            revision?: number;
            status?: string;
          };

          const questions = body.questions ?? [];

          // Intake found nothing to draft and asked instead. No proposal is staged, because
          // there is none — the expensive call never ran. The questions go into the thread as
          // an ordinary answer, so replying to them is just the next message.
          if (body.status === "questions" && questions.length > 0) {
            settled = [
              ...history,
              { content: intakeQuestionsMessage(questions), role: "assistant" },
            ];
            setMessages(settled);
            return;
          }

          if (body.status !== "proposed" || !body.document || !body.details) {
            setNotice(body.message ?? "Invi is unavailable right now.");
            return;
          }

          setProposal({
            details: body.details,
            document: body.document,
            invitationId,
            revision: body.revision ?? 0,
          });
          // The sentence around the draft is Invitica's, not the model's: the draft itself is
          // the answer and it is shown in the preview where the creator can judge it, so
          // restating it as prose would be a second, less reliable copy. Any questions after
          // it are the model's own words, because they are about this creator's invitation.
          settled = [...history, { content: draftedMessage(questions), role: "assistant" }];
          setMessages(settled);
        } catch {
          if (controller.signal.aborted) setStopped(true);
          else setNotice("Invitica could not reach Invi. Check your connection and try again.");
        } finally {
          settle();
          void persist(settled);
        }

        return;
      }

      // The question goes up on its own. Stage one paired it with an empty assistant
      // message so the thread had somewhere to stream into; that empty bubble is what
      // rendered as a bare horizontal line, and `isThinking` in the conversation now
      // covers the gap until the first chunk arrives.
      setMessages(history);
      let settled = history;

      try {
        const response = await fetch("/api/creator/assistant", {
          body: JSON.stringify({
            // What the creator can see from where they are standing. The server re-resolves
            // the invitation under their own session and treats the rest as wording input,
            // so nothing here is trusted for more than choosing a sentence.
            context: {
              mode,
              ...(invitationId ? { invitationId } : {}),
              ...(surface ? { surface } : {}),
            },
            messages: conversationWindow(history),
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });

        // A refusal and an error both come back as JSON; only a real answer streams as text.
        if (response.headers.get("content-type")?.includes("application/json")) {
          const body = (await response.json()) as { message?: string };
          setNotice(body.message ?? "Invi is unavailable right now.");
          return;
        }

        if (!response.ok || !response.body) {
          setNotice("Invi is unavailable right now. Try again in a moment.");
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          settled = [...history, { content: answer, role: "assistant" }];
          setMessages(settled);
        }

        // A stopped answer keeps what arrived. Only an answer that was allowed to run and
        // produced nothing is a failure worth saying so about.
        if (!answer.trim() && !controller.signal.aborted) {
          settled = history;
          setMessages(history);
          setNotice("Invi did not manage an answer. Try asking again.");
        }
      } catch {
        if (controller.signal.aborted) setStopped(true);
        else setNotice("Invitica could not reach Invi. Check your connection and try again.");
      } finally {
        if (controller.signal.aborted) setStopped(true);
        settle();
        void persist(settled);
      }
    },
    [abilities, guestList, invitationId, messages, mode, persist, refreshUsage, surface],
  );

  /**
   * Opening is the first moment a creator has asked anything about Invi, so it is the
   * first moment worth reading their allowance. Every later read is a refresh.
   */
  const open = useCallback(() => {
    setIsOpen(true);
    void refreshUsage();
  }, [refreshUsage]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * The way out of a question sent by accident.
   *
   * Enter sends, which is what makes the composer quick and also what makes a half-typed
   * question reach Invi. This takes that message back off the thread and returns its text,
   * so the creator finishes writing it and sends it again into the same conversation
   * rather than starting another one beside it.
   *
   * Everything after it goes too — an answer to a question that is being rewritten is an
   * answer to a question that no longer exists.
   */
  const editLastMessage = useCallback(() => {
    if (inFlight.current) return null;

    const index = messages.map((message) => message.role).lastIndexOf("user");
    if (index === -1) return null;

    const text = messages[index]?.content ?? null;
    const rewound = messages.slice(0, index);

    setMessages(rewound);
    setNotice(null);
    setStopped(false);
    void persist(rewound);

    return text;
  }, [messages, persist]);

  const startNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setNotice(null);
    setProposal(null);
    setGuestList(null);
    setStopped(false);
    setConversationId(null);
  }, [setConversationId]);

  const openConversation = useCallback(
    async (nextConversationId: string) => {
      if (inFlight.current) return;

      setHistoryStatus("loading");

      try {
        const thread = await loadAssistantConversationAction({
          conversationId: nextConversationId,
        });

        if (!thread || thread.length === 0) {
          setNotice("That conversation is no longer available.");
          return;
        }

        setMessages(thread);
        setConversationId(nextConversationId);
        setNotice(null);
        setStopped(false);
        // A staged draft and parsed guest rows belong to the thread that produced them.
        // Carrying them into a different conversation would offer a creator changes whose
        // reasons are no longer on screen.
        setProposal(null);
        setGuestList(null);
      } catch {
        setNotice("That conversation could not be opened. Try again in a moment.");
      } finally {
        setHistoryStatus("idle");
      }
    },
    [setConversationId],
  );

  const deleteConversation = useCallback(
    async (targetConversationId: string) => {
      try {
        await deleteAssistantConversationAction({ conversationId: targetConversationId });
      } catch {
        return;
      }

      // Deleting the thread on screen empties it. Leaving it there would show a
      // conversation the creator has just said they want no record of.
      if (conversationIdRef.current === targetConversationId) startNewConversation();
      await refreshConversations();
    },
    [refreshConversations, startNewConversation],
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
      abilities,
      clearGuestList,
      clearProposal,
      close: () => setIsOpen(false),
      conversationId,
      conversations,
      deleteConversation,
      editLastMessage,
      guestList,
      historyStatus,
      invitationId,
      isOpen,
      messages,
      mode,
      notice,
      open,
      openConversation,
      proposal,
      refreshConversations,
      refreshUsage,
      send,
      setInvitationId,
      setMode,
      startNewConversation,
      status,
      stop,
      stopped,
      usage,
      usageStatus,
    }),
    [
      abilities,
      clearGuestList,
      clearProposal,
      conversationId,
      conversations,
      deleteConversation,
      editLastMessage,
      guestList,
      historyStatus,
      invitationId,
      isOpen,
      messages,
      mode,
      notice,
      open,
      openConversation,
      proposal,
      refreshConversations,
      refreshUsage,
      send,
      setInvitationId,
      startNewConversation,
      status,
      stop,
      stopped,
      usage,
      usageStatus,
    ],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
