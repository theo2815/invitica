"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from "react";

/**
 * Lets a control outside the invitation editor settle the editor's draft before navigating.
 *
 * The assistant floats above every creator route, so its expand and apply controls can send
 * a creator away from an editor holding keystrokes autosave has not sent yet. Those controls
 * cannot reach the editor's save state — it belongs to a component further down the tree —
 * and moving that state up into the shell would put an editor concern in the shell for the
 * benefit of two buttons.
 *
 * So the editor registers the one thing callers actually need. There is at most one editor
 * mounted at a time, which is why this holds a single function rather than a set.
 */

interface DraftFlushValue {
  flush: () => Promise<void>;
  register: (flush: (() => Promise<void>) | null) => void;
}

const DraftFlushContext = createContext<DraftFlushValue | null>(null);

export function DraftFlushProvider({ children }: { children: ReactNode }) {
  const registered = useRef<(() => Promise<void>) | null>(null);

  const value = useMemo<DraftFlushValue>(
    () => ({
      // Resolves immediately when no editor is mounted, so a caller never has to ask
      // whether there is a draft to settle.
      flush: async () => {
        await registered.current?.();
      },
      register: (flush) => {
        registered.current = flush;
      },
    }),
    [],
  );

  return <DraftFlushContext.Provider value={value}>{children}</DraftFlushContext.Provider>;
}

/**
 * Returns a flush the caller can await before navigating. Safe outside the provider — it
 * resolves to a no-op, so a route rendered without the creator shell still works.
 */
export function useDraftFlush(): () => Promise<void> {
  const value = useContext(DraftFlushContext);
  return useCallback(async () => {
    await value?.flush();
  }, [value]);
}

/** Called by the editor. Registering `null` on unmount keeps a stale draft from being saved. */
export function useRegisterDraftFlush(): (flush: (() => Promise<void>) | null) => void {
  const value = useContext(DraftFlushContext);
  return useCallback(
    (flush: (() => Promise<void>) | null) => {
      value?.register(flush);
    },
    [value],
  );
}
