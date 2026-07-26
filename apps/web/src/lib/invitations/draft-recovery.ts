import { z } from "zod";

/**
 * Last-resort recovery for editor changes that were never accepted by the server.
 *
 * The editor's own state machine keeps unsaved work on screen and always offers a
 * retry, so this only matters when the tab itself goes away: a browser crash, a
 * dead battery, or a creator who dismisses the leave-page warning. Without it the
 * only recovery is to type all eleven sections again.
 *
 * `sessionStorage` rather than `localStorage` on purpose — the snapshot dies with
 * the tab, so an abandoned draft cannot linger on a shared machine. It holds the
 * creator's own invitation content; guest names, links, and RSVPs live in separate
 * tables and never enter an invitation document.
 */
const SNAPSHOT_VERSION = 1;

/** Well above a full Little Blessings document, far below a sessionStorage quota. */
const MAX_SNAPSHOT_CHARACTERS = 512_000;

const snapshotSchema = z.strictObject({
  /** The serialized editor payload, exactly as the editor's change signature. */
  content: z.string().min(1).max(MAX_SNAPSHOT_CHARACTERS),
  /** The draft revision the content was edited against. */
  revision: z.number().int().positive(),
  savedAt: z.string().datetime({ offset: true }),
  version: z.literal(SNAPSHOT_VERSION),
});

export type DraftSnapshot = z.infer<typeof snapshotSchema>;

function storageKey(invitationId: string): string {
  return `invitica:draft-recovery:${invitationId}`;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    // Private-mode and hardened browsers throw on access rather than returning null.
    return null;
  }
}

/**
 * Reads a snapshot for this invitation. Anything unparseable is discarded rather
 * than repaired: a stored value is only worth offering if it is exactly the shape
 * this version wrote.
 */
export function readDraftSnapshot(invitationId: string): DraftSnapshot | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(storageKey(invitationId));
    if (!raw) return null;
    const parsed = snapshotSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    store.removeItem(storageKey(invitationId));
    return null;
  } catch {
    return null;
  }
}

export function writeDraftSnapshot(invitationId: string, content: string, revision: number): void {
  const store = storage();
  if (!store || content.length > MAX_SNAPSHOT_CHARACTERS) return;

  const snapshot: DraftSnapshot = {
    content,
    revision,
    savedAt: new Date().toISOString(),
    version: SNAPSHOT_VERSION,
  };

  try {
    store.setItem(storageKey(invitationId), JSON.stringify(snapshot));
  } catch {
    // A full quota must never interrupt editing; the on-screen draft is unaffected.
  }
}

export function clearDraftSnapshot(invitationId: string): void {
  try {
    storage()?.removeItem(storageKey(invitationId));
  } catch {
    // Nothing to do — the snapshot is advisory.
  }
}
