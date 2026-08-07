"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteOrigin } from "../auth/redirects";
import { requireConfirmedUser } from "../auth/session";
import type { AuthActionState } from "../auth/types";
import {
  validateCreatorName,
  validateEmailChange,
  validatePasswordChange,
} from "../auth/validation";
import {
  AccountDeletionError,
  createDeletionToken,
  DELETION_LINK_MINUTES,
  openDeletionRequest,
  purgeAndDeleteAccount,
  resolveDeletionToken,
} from "./deletion";
import { accountDeletionEmail } from "./deletion-email";
import { emailSendingConfigured, sendEmail } from "./email";
import { readCreatorIdentity } from "./identity";
import { isThemePreference, THEME_COOKIE, themeCookieOptions } from "./theme";

/**
 * Account management for a creator who is already signed in.
 *
 * These are deliberately separate from `server/auth/actions.ts`, which handles getting *into*
 * an account and is gated by `publicAuthLocked()` for the closed beta. Nothing here is public:
 * every action re-derives the session through `requireConfirmedUser`, so the beta lock does not
 * apply and must not be copied in. A creator who is signed in changing their own password is
 * not the public sign-up the lock exists to close.
 */

export async function updateCreatorName(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = validateCreatorName(formData);

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const { supabase } = await requireConfirmedUser();
  // `user_metadata.full_name` is what the creator shell reads (`CreatorShell.tsx`), so it is
  // the one this writes. `profiles.display_name` from migration `0001` is updatable and has
  // never been read or written by the application; writing both would create two answers to
  // the same question with no rule for which wins.
  const { error } = await supabase.auth.updateUser({ data: { full_name: result.data.fullName } });

  if (error) {
    return { error: "Your name could not be saved. Please try again." };
  }

  // The shell renders the name on every creator route, so the whole authenticated layout is
  // stale until this clears.
  revalidatePath("/dashboard", "layout");

  return { error: null, notice: "Your name has been updated." };
}

export async function changePassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = validatePasswordChange(formData);

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  const { supabase, user } = await requireConfirmedUser();
  const identity = readCreatorIdentity(user);

  if (!identity.hasPassword || !user.email) {
    return {
      error: "This account signs in through Google, so it has no Invitica password to change.",
    };
  }

  // Re-verify before changing. A live session is not proof that the person holding it knows
  // the password — an unlocked laptop is enough for that — and a password change is what
  // locks the real owner out.
  const { error: verificationError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: result.data.currentPassword,
  });

  if (verificationError) {
    return {
      error: null,
      fieldErrors: { currentPassword: "That is not your current password." },
    };
  }

  const { error } = await supabase.auth.updateUser({ password: result.data.password });

  if (error) {
    return { error: "Your password could not be changed. Please try again." };
  }

  // Every other signed-in device keeps working on the old password otherwise, which defeats
  // the reason most people change one. This session survives; the others do not.
  await supabase.auth.signOut({ scope: "others" });

  return {
    error: null,
    notice:
      "Your password has been changed. Any other device signed in to Invitica was signed out.",
  };
}

export async function changeEmailAddress(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { supabase, user } = await requireConfirmedUser();
  const identity = readCreatorIdentity(user);

  if (!identity.hasPassword) {
    return {
      error: "This account signs in through Google, so its email address is managed there.",
    };
  }

  const result = validateEmailChange(formData, user.email);

  if (!result.ok) {
    return { error: null, fieldErrors: result.fieldErrors };
  }

  // Without `emailRedirectTo`, Supabase returns a confirming creator to the Site URL — the public
  // landing page — with no sign that anything happened. Both links now come back through the app's
  // own `/auth/confirm`, which verifies the `email_change` token and lands them on Settings.
  const { error } = await supabase.auth.updateUser(
    { email: result.data.email },
    { emailRedirectTo: `${getSiteOrigin()}/auth/confirm?next=/dashboard/settings` },
  );

  if (error) {
    return {
      error: "That email address could not be used. It may already belong to another account.",
    };
  }

  // Supabase writes the new address only after both links are followed, so nothing has
  // changed yet and the creator keeps signing in with the current address until it has.
  return {
    error: null,
    notice: `Confirm the change from both inboxes. We sent a link to ${user.email} and to ${result.data.email}; the address changes once both are confirmed.`,
  };
}

/**
 * Step one of two. Opens a deletion request and emails the link that completes it.
 *
 * Nothing is deleted here, and the wording says so. The account stays fully usable until the link
 * is followed, and asking again replaces the previous link rather than adding a second one.
 */
export async function requestAccountDeletion(): Promise<AuthActionState> {
  const { supabase, user } = await requireConfirmedUser();

  if (!user.email) {
    return { error: "This account has no email address to confirm a deletion from." };
  }

  if (!emailSendingConfigured()) {
    return {
      error: "Account deletion is unavailable because Invitica cannot send email right now.",
    };
  }

  const { hash, token } = createDeletionToken();

  try {
    await openDeletionRequest(supabase, hash);
  } catch {
    return { error: "The deletion request could not be started. Please try again." };
  }

  const confirmUrl = `${getSiteOrigin()}/account/delete/confirm?token=${encodeURIComponent(token)}`;

  try {
    await sendEmail({ to: user.email, ...accountDeletionEmail(confirmUrl) });
  } catch {
    return {
      error: "We could not send the confirmation email. Please try again in a moment.",
    };
  }

  return {
    error: null,
    notice: `Check ${user.email}. The link expires in ${DELETION_LINK_MINUTES} minutes, and your account is untouched until you follow it.`,
  };
}

/**
 * Step two. Claims the token and, only if that succeeds, takes the account apart.
 *
 * The claim is a single database statement, so two clicks cannot both win it — which matters,
 * because what follows purges published invitations from the guest edge and is not work to run
 * twice.
 */
export async function confirmAccountDeletion(token: unknown): Promise<AuthActionState> {
  if (typeof token !== "string" || token.length === 0) {
    return { error: "This deletion link is not valid." };
  }

  const { supabase, user } = await requireConfirmedUser();

  let state: Awaited<ReturnType<typeof resolveDeletionToken>>;

  try {
    state = await resolveDeletionToken(supabase, token, true);
  } catch {
    return { error: "The deletion link could not be checked. Please try again." };
  }

  if (state !== "claimed") {
    return deletionStateMessage(state);
  }

  try {
    await purgeAndDeleteAccount(supabase, user.id);
  } catch (cause) {
    return {
      error:
        cause instanceof AccountDeletionError
          ? cause.message
          : "Your account could not be deleted. Please try again.",
    };
  }

  // The session's user no longer exists; clearing the cookies is what stops every subsequent
  // request from being an authentication error instead of a signed-out page.
  await supabase.auth.signOut();
  redirect("/login?message=account-deleted");
}

function deletionStateMessage(state: "expired" | "unknown" | "used" | "valid"): AuthActionState {
  if (state === "expired") {
    return { error: "This deletion link has expired. Start again from Settings." };
  }
  if (state === "used") {
    return { error: "This deletion link has already been used." };
  }
  return { error: "This deletion link is not valid. Start again from Settings." };
}

export async function setThemePreference(preference: unknown): Promise<void> {
  // The only untrusted input any of these actions takes, so it is checked against the union
  // rather than written through. A rejected value leaves the current choice alone.
  if (!isThemePreference(preference)) return;

  (await cookies()).set(THEME_COOKIE, preference, themeCookieOptions());

  // The attribute is stamped in the root layout, so the whole tree re-renders with the new
  // palette — no client-side class swap, and nothing to keep in sync.
  revalidatePath("/", "layout");
}

export async function signOutEverywhere(): Promise<void> {
  const { supabase } = await requireConfirmedUser();

  // `global` ends this session too, which is the honest reading of "everywhere" and means the
  // creator finishes on the sign-in page rather than on a settings page they are no longer
  // authorized for.
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?message=signed-out-everywhere");
}

export async function deleteAssistantConversations(): Promise<AuthActionState> {
  const { supabase, user } = await requireConfirmedUser();

  // Row-level security already restricts the delete to this creator; the explicit filter is
  // the same deliberate duplication `server/assistant/conversations.ts` documents, and here a
  // missing filter would be a delete with no `where` clause at all.
  const { error } = await supabase
    .from("assistant_conversations")
    .delete()
    .eq("creator_id", user.id);

  if (error) {
    return { error: "Your saved conversations could not be deleted. Please try again." };
  }

  revalidatePath("/dashboard/assistant");
  revalidatePath("/dashboard/settings");

  return { error: null, notice: "Every saved conversation has been deleted." };
}
