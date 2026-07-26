"use client";

import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

interface PendingFormButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  idleContent: ReactNode;
  pendingContent: ReactNode;
}

export const PendingFormButton = forwardRef<HTMLButtonElement, PendingFormButtonProps>(
  function PendingFormButton(
    { disabled, idleContent, pendingContent, ...buttonProps },
    forwardedRef,
  ) {
    const { pending } = useFormStatus();

    return (
      <button
        {...buttonProps}
        aria-busy={pending || undefined}
        data-pending={pending}
        disabled={disabled || pending}
        ref={forwardedRef}
      >
        {pending ? pendingContent : idleContent}
      </button>
    );
  },
);
