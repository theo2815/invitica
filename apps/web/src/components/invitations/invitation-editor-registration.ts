import type { TemplateEditorKey } from "@invitica/template-kit";
import type { ComponentType } from "react";

import { InvitationDraftEditor } from "./InvitationDraftEditor";
import type { InvitationEditorProps } from "./invitation-editor-contract";
import { SectionDocumentDraftEditor } from "./LittleBlessingsDraftEditor";

export interface InvitationEditorRegistration {
  component: ComponentType<InvitationEditorProps>;
  editorKey: TemplateEditorKey;
  loadsImageAssets: boolean;
}

const invitationEditorRegistrations: Record<TemplateEditorKey, InvitationEditorRegistration> = {
  "focused-event-v1": {
    component: InvitationDraftEditor,
    editorKey: "focused-event-v1",
    loadsImageAssets: false,
  },
  "section-document-v1": {
    component: SectionDocumentDraftEditor,
    editorKey: "section-document-v1",
    loadsImageAssets: true,
  },
};

export class UnknownInvitationEditorError extends Error {
  constructor(editorKey: string) {
    super(`Unknown invitation editor: ${editorKey}`);
    this.name = "UnknownInvitationEditorError";
  }
}

export function resolveInvitationEditorRegistration(
  editorKey: string,
): InvitationEditorRegistration {
  const registration =
    invitationEditorRegistrations[editorKey as keyof typeof invitationEditorRegistrations];

  if (!registration) {
    throw new UnknownInvitationEditorError(editorKey);
  }

  return registration;
}
