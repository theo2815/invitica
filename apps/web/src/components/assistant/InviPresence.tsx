"use client";

import { useAssistant } from "./AssistantProvider";
import { InviMascot, resolveInviState } from "./InviMascot";

interface InviPresenceProps {
  active?: boolean;
  className?: string | undefined;
  size?: "compact" | "standard" | undefined;
}

/** Connects Invi's expression to the shared assistant thread without inventing another store. */
export function InviPresence({ active = true, className, size }: InviPresenceProps) {
  const { messages, notice, proposal, status } = useAssistant();

  return (
    <InviMascot
      className={className}
      size={size}
      state={resolveInviState({
        active,
        hasNotice: notice !== null,
        hasProposal: proposal !== null,
        latestMessage: messages.at(-1),
        status,
      })}
    />
  );
}
