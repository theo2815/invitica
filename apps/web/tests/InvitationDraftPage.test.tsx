import { resolveTemplateById } from "@invitica/template-kit";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InvitationDraftPage from "../app/dashboard/invitations/[invitationId]/page";
import { ensurePersonalWorkspace } from "../src/server/auth/session";
import { loadInvitationDraft } from "../src/server/invitations/drafts";
import { loadInvitationPublicationStatus } from "../src/server/invitations/publications";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));

vi.mock("../src/server/auth/actions", () => ({
  signOut: vi.fn(),
}));

vi.mock("../src/server/auth/session", () => ({
  ensurePersonalWorkspace: vi.fn(),
}));

vi.mock("../src/server/invitations/drafts", () => ({
  loadInvitationDraft: vi.fn(),
}));

vi.mock("../src/server/invitations/publications", () => ({
  loadInvitationPublicationStatus: vi.fn(),
}));

const invitationId = "71000000-0000-4000-8000-000000000001";
const gardenPromise = resolveTemplateById("garden-promise");

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(ensurePersonalWorkspace).mockReset();
  vi.mocked(loadInvitationDraft).mockReset();
  vi.mocked(loadInvitationPublicationStatus).mockReset();
  vi.mocked(loadInvitationPublicationStatus).mockResolvedValue({
    errorCode: null,
    livePublicIdentifier: null,
    publicationId: null,
    publishedRevision: null,
    status: "idle",
  });
  vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
    error: null,
    supabase: {} as never,
    user: {
      email: "maria@example.com",
      user_metadata: { full_name: "Maria Santos" },
    } as never,
    workspaceId: "workspace-id",
  });
});

describe("persisted invitation draft page", () => {
  it("renders the stored document through the shared production renderer", async () => {
    vi.mocked(loadInvitationDraft).mockResolvedValue({
      document: gardenPromise.defaultDocument,
      invitationId,
      manifest: gardenPromise,
      revision: 1,
    });

    const { container } = render(
      await InvitationDraftPage({ params: Promise.resolve({ invitationId }) }),
    );

    expect(screen.getByRole("heading", { level: 1, name: "Garden Promise" })).toBeDefined();
    expect(screen.getByText("Revision 1")).toBeDefined();
    expect(screen.getByRole("button", { name: /Open invitation for/ })).toBeDefined();
    expect(screen.queryByText("Untie and open invitation")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Mara & Joaquin" })).toBeNull();
    expect(container.querySelector("[data-envelope-gated] h1")?.textContent).toBe("Mara & Joaquin");
    expect(loadInvitationDraft).toHaveBeenCalledWith(expect.anything(), invitationId);
  });

  it("does not reveal a draft that is absent under workspace RLS", async () => {
    vi.mocked(loadInvitationDraft).mockResolvedValue(null);

    await expect(
      InvitationDraftPage({ params: Promise.resolve({ invitationId }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("fails closed when the creator workspace is unavailable", async () => {
    vi.mocked(ensurePersonalWorkspace).mockResolvedValue({
      error: { message: "unavailable" } as never,
      supabase: {} as never,
      user: { email: "maria@example.com", user_metadata: {} } as never,
      workspaceId: null,
    });

    await expect(
      InvitationDraftPage({ params: Promise.resolve({ invitationId }) }),
    ).rejects.toThrow("The creator workspace is unavailable.");
    expect(loadInvitationDraft).not.toHaveBeenCalled();
  });
});
