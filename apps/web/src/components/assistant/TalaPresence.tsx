"use client";

import { useAssistant } from "./AssistantProvider";
import { resolveTalaState, TalaMascot } from "./TalaMascot";

interface TalaPresenceProps {
  active?: boolean;
  className?: string | undefined;
  size?: "compact" | "standard" | undefined;
}

/** Connects Tala's expression to the shared assistant thread without inventing another store. */
export function TalaPresence({ active = true, className, size }: TalaPresenceProps) {
  const { messages, notice, proposal, status } = useAssistant();

  return (
    <TalaMascot
      className={className}
      size={size}
      state={resolveTalaState({
        active,
        hasNotice: notice !== null,
        hasProposal: proposal !== null,
        latestMessage: messages.at(-1),
        status,
      })}
    />
  );
}
