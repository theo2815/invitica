import { randomUUID } from "node:crypto";
import { resolveTemplateById, templateCatalog } from "@invitica/template-kit";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TemplateLivePreview } from "../../../../src/components/templates/TemplateLivePreview";
import { getOptionalConfirmedUser } from "../../../../src/server/auth/session";
import { listInvitationDrafts } from "../../../../src/server/invitations/drafts";

interface TemplatePreviewPageProps {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ intent?: string | string[] }>;
}

function registeredTemplate(templateId: string) {
  if (!templateCatalog.some((template) => template.id === templateId)) {
    return null;
  }

  return resolveTemplateById(templateId);
}

export async function generateMetadata({ params }: TemplatePreviewPageProps): Promise<Metadata> {
  const { templateId } = await params;
  const manifest = registeredTemplate(templateId);

  if (!manifest) {
    return { title: "Template preview unavailable — Invitica" };
  }

  return {
    description: `Experience the ${manifest.listing.name} invitation template before creating your own.`,
    robots: { follow: false, index: false },
    title: `${manifest.listing.name} preview — Invitica`,
  };
}

export default async function TemplatePreviewPage({
  params,
  searchParams,
}: TemplatePreviewPageProps) {
  const [{ templateId }, { intent }] = await Promise.all([params, searchParams]);
  const manifest = registeredTemplate(templateId);

  if (!manifest) {
    notFound();
  }

  const session = await getOptionalConfirmedUser();
  let usedBefore = false;

  if (session) {
    const { data: workspaceId, error } = await session.supabase.rpc("ensure_personal_workspace");
    if (!error && workspaceId) {
      try {
        const drafts = await listInvitationDrafts(session.supabase, workspaceId);
        usedBefore = drafts.some((draft) => draft.templateVersionId === manifest.templateVersionId);
      } catch {
        usedBefore = false;
      }
    }
  }

  return (
    <TemplateLivePreview
      authenticated={Boolean(session)}
      creationRequestId={randomUUID()}
      returningFromLogin={intent === "use"}
      templateId={manifest.listing.id}
      usedBefore={usedBefore}
    />
  );
}
