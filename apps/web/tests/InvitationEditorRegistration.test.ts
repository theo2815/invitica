import { describe, expect, it } from "vitest";

import { InvitationDraftEditor } from "../src/components/invitations/InvitationDraftEditor";
import {
  resolveInvitationEditorRegistration,
  UnknownInvitationEditorError,
} from "../src/components/invitations/invitation-editor-registration";
import { SectionDocumentDraftEditor } from "../src/components/invitations/LittleBlessingsDraftEditor";

describe("invitation editor registration", () => {
  it("maps each versioned editor contract to its component and data requirements", () => {
    expect(resolveInvitationEditorRegistration("focused-event-v1")).toEqual({
      component: InvitationDraftEditor,
      editorKey: "focused-event-v1",
      loadsImageAssets: false,
    });
    expect(resolveInvitationEditorRegistration("section-document-v1")).toEqual({
      component: SectionDocumentDraftEditor,
      editorKey: "section-document-v1",
      loadsImageAssets: true,
    });
  });

  it("rejects an editor key the deployed application does not know", () => {
    expect(() => resolveInvitationEditorRegistration("future-editor-v1")).toThrow(
      UnknownInvitationEditorError,
    );
  });
});
