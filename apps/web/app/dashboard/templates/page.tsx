import { randomUUID } from "node:crypto";
import { templateCatalog } from "@invitica/template-kit";

import { TemplateCatalog } from "../../../src/components/templates/TemplateCatalog";
import { ensurePersonalWorkspace } from "../../../src/server/auth/session";
import { listInvitationDrafts } from "../../../src/server/invitations/drafts";
import styles from "./Templates.module.css";

export default async function TemplatesPage() {
  const { error, supabase, workspaceId } = await ensurePersonalWorkspace();
  const creationRequestIds = Object.fromEntries(
    templateCatalog.map((template) => [template.id, randomUUID()]),
  );
  const drafts = !error && workspaceId ? await listInvitationDrafts(supabase, workspaceId) : [];

  return (
    <>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>Creator catalog</p>
        <h1>Templates</h1>
        <p className={styles.pageDescription}>
          Find a considered starting point for your celebration, then preview how it adapts across
          guest screens.
        </p>
      </header>

      {error || !workspaceId ? (
        <section className={styles.workspaceError} role="alert">
          <p className={styles.label}>Workspace unavailable</p>
          <h2>Your workspace needs attention</h2>
          <p>
            Your account is secure, but the personal workspace could not be prepared. Confirm that
            the Invitica database migration has been applied, then reload this page.
          </p>
        </section>
      ) : (
        <TemplateCatalog
          creationRequestIds={creationRequestIds}
          templates={templateCatalog}
          usedTemplateVersionIds={drafts.map((draft) => draft.templateVersionId)}
        />
      )}

      <footer className={styles.footer}>
        <span>Invitica template collection</span>
        <span>Curated beginnings for meaningful celebrations.</span>
      </footer>
    </>
  );
}
