"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AssistantApiMessage } from "../../contracts/assistant-api";

export type AssistantStatus = "answering" | "idle";

interface AssistantContextValue {
  clear: () => void;
  close: () => void;
  isOpen: boolean;
  messages: AssistantApiMessage[];
  notice: null | string;
  open: () => void;
  send: (text: string) => Promise<void>;
  status: AssistantStatus;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider.");
  return value;
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
  // One answer at a time. Without this a second Enter while the first answer is still
  // streaming would spend a second message from the daily allowance and interleave the two.
  const inFlight = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || inFlight.current) return;

      inFlight.current = true;
      setNotice(null);
      setStatus("answering");

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
          setNotice(body.message ?? "The assistant is unavailable right now.");
          return;
        }

        if (!response.ok || !response.body) {
          setMessages(history);
          setNotice("The assistant is unavailable right now. Try again in a moment.");
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
          setNotice("The assistant did not manage an answer. Try asking again.");
        }
      } catch {
        setMessages(history);
        setNotice("Invitica could not reach the assistant. Check your connection and try again.");
      } finally {
        inFlight.current = false;
        setStatus("idle");
      }
    },
    [messages],
  );

  const value = useMemo<AssistantContextValue>(
    () => ({
      clear: () => {
        setMessages([]);
        setNotice(null);
      },
      close: () => setIsOpen(false),
      isOpen,
      messages,
      notice,
      open: () => setIsOpen(true),
      send,
      status,
    }),
    [isOpen, messages, notice, send, status],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
