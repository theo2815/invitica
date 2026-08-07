import Link from "next/link";

import { AccountEmailForm } from "../../../src/components/settings/AccountEmailForm";
import { AccountNameForm } from "../../../src/components/settings/AccountNameForm";
import { AccountPasswordForm } from "../../../src/components/settings/AccountPasswordForm";
import { AssistantDataPanel } from "../../../src/components/settings/AssistantDataPanel";
import { DeleteAccountPanel } from "../../../src/components/settings/DeleteAccountPanel";
import styles from "../../../src/components/settings/Settings.module.css";
import { SettingsSection } from "../../../src/components/settings/SettingsSection";
import { SignOutEverywhere } from "../../../src/components/settings/SignOutEverywhere";
import { ThemePanel } from "../../../src/components/settings/ThemePanel";
import { readDeletionImpact } from "../../../src/server/account/deletion";
import { readCreatorIdentity } from "../../../src/server/account/identity";
import { readThemePreference } from "../../../src/server/account/theme";
import { assistantEnabled } from "../../../src/server/assistant/budget";
import { listAssistantConversations } from "../../../src/server/assistant/conversations";
import { readAssistantUsage } from "../../../src/server/assistant/usage";
import { requireConfirmedUser } from "../../../src/server/auth/session";

export const metadata = { title: "Settings" };

function formatJoinDate(value: string | undefined): string {
  if (!value) return "Unknown";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
}

export default async function SettingsPage() {
  const { supabase, user } = await requireConfirmedUser();
  const identity = readCreatorIdentity(user);
  const theme = await readThemePreference();

  // The shell shows only the first name, so it cannot be the value this form edits.
  const fullName =
    typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

  // Both reads are skipped entirely when the assistant is off, so the kill switch removes the
  // panel and its queries rather than rendering an empty one.
  const assistant = assistantEnabled();
  const [invitations, usage, conversations] = await Promise.all([
    readDeletionImpact(supabase),
    assistant ? readAssistantUsage(supabase) : Promise.resolve(null),
    assistant ? listAssistantConversations(supabase, user.id) : Promise.resolve([]),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Your account</p>
        <h1>Settings</h1>
        <p className={styles.pageDescription}>
          Your name, how you sign in, and what Invitica keeps for you.
        </p>
      </header>

      <div className={styles.sections}>
        <SettingsSection
          description="Invitica greets you by this name. Guests never see it."
          title="Name"
        >
          <AccountNameForm creatorName={fullName} />
        </SettingsSection>

        <SettingsSection
          description={
            identity.hasPassword
              ? "Changing this address needs a confirmation from both the old and the new inbox."
              : "This account signs in through Google, so its email address is managed there."
          }
          title="Email address"
        >
          {identity.hasPassword && user.email ? (
            <AccountEmailForm currentEmail={user.email} />
          ) : (
            <p className={styles.inlineNote}>
              You sign in as <strong>{user.email}</strong> through Google. Change the address in
              your Google account and it follows here.
            </p>
          )}
        </SettingsSection>

        <SettingsSection
          description="Enter your current password to set a new one. Every other signed-in device is signed out."
          title="Password"
        >
          {identity.hasPassword ? (
            <AccountPasswordForm />
          ) : (
            <p className={styles.inlineNote}>
              This account has no Invitica password — you sign in through Google.
            </p>
          )}
        </SettingsSection>

        <SettingsSection
          description="Applies to your Invitica workspace. Invitations keep their own design in every theme, so what a guest sees never changes."
          title="Theme"
        >
          <ThemePanel preference={theme} />
        </SettingsSection>

        {assistant ? (
          <SettingsSection
            description="Your saved conversations with Invi, and how much of today's allowance you have used."
            title="Invi data"
          >
            <AssistantDataPanel savedConversations={conversations.length} usage={usage} />
          </SettingsSection>
        ) : null}

        <SettingsSection
          description="Signed in on a shared or borrowed device? End every session at once."
          title="Sessions"
        >
          <SignOutEverywhere />
        </SettingsSection>

        <SettingsSection
          description="What this account is, and the terms it runs under."
          title="Account"
        >
          <dl className={styles.factList}>
            <div>
              <dt>Email</dt>
              <dd>{user.email ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Sign-in method</dt>
              <dd>{identity.providerLabels.join(", ") || "Unknown"}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{formatJoinDate(user.created_at)}</dd>
            </div>
            <div>
              <dt>Documents</dt>
              <dd>
                <Link href="/terms">Terms of Service</Link> ·{" "}
                <Link href="/privacy">Privacy Notice</Link>
              </dd>
            </div>
          </dl>
        </SettingsSection>

        <SettingsSection
          description="Permanent, and it takes your published invitations down with it."
          title="Delete account"
          tone="danger"
        >
          <DeleteAccountPanel
            invitationCount={invitations.total}
            publishedCount={invitations.published}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
