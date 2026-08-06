import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById, templateStarterDocument } from "@invitica/template-kit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeSectionProgress } from "../src/lib/invitations/section-progress";
import type { LoadAssistantInvitationResult } from "../src/server/assistant/actions";

const gardenPromise = resolveTemplateById("garden-promise");
const invitationId = "a1000000-0000-4000-8000-000000000001";

const loadInvitation = vi.fn(
  async (_input: unknown): Promise<LoadAssistantInvitationResult> => ({
    message: "unset",
    status: "error",
  }),
);

vi.mock("../src/server/assistant/actions", () => ({
  deleteAssistantConversationAction: async () => undefined,
  listAssistantConversationsAction: async () => [],
  loadAssistantConversationAction: async () => null,
  loadAssistantInvitationAction: (input: unknown) => loadInvitation(input),
  saveAssistantConversationAction: async () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/assistant",
  useRouter: () => ({ push: vi.fn() }),
}));

// The page's own preview is not what these cases are about, and rendering a whole Garden
// Promise invitation into jsdom is the slowest thing in this suite for no added evidence.
vi.mock("@invitica/renderer", () => ({
  resolveTemplateRenderer: () => () => <div data-testid="preview" />,
}));

const { AssistantProvider } = await import("../src/components/assistant/AssistantProvider");
const { AssistantWorkspace } = await import("../src/components/assistant/AssistantWorkspace");
const { DraftFlushProvider } = await import("../src/components/invitations/DraftFlushProvider");

/**
 * The section checklist on `/dashboard/assistant`.
 *
 * It answers one question — what is left to describe — and it has to answer it with the same
 * numbers the creator's editor prints, or a creator reading "Section 5" here and "Section 5"
 * there is looking at two different sections. That agreement is guarded in
 * `SectionProgress.test.ts`; what these cases hold is that the column shows it, and that the
 * two states are told apart by their words rather than only by their colour.
 */
function loaded(document: ReturnType<typeof parseInvitationDocument>) {
  loadInvitation.mockResolvedValue({
    assets: [],
    document,
    rendererKey: gardenPromise.rendererKey,
    revision: 1,
    sections: describeSectionProgress(document, gardenPromise),
    status: "loaded",
  });
}

function renderWorkspace() {
  return render(
    <AssistantProvider>
      <DraftFlushProvider>
        <AssistantWorkspace
          invitations={[
            { invitationId, templateName: "Garden Promise", title: "Amihan and Rafael" },
          ]}
        />
      </DraftFlushProvider>
    </AssistantProvider>,
  );
}

/** Drives the shared Select the way a creator does: open the combobox, click the option. */
async function choose() {
  fireEvent.click(screen.getByRole("combobox", { name: "Draft into" }));
  fireEvent.click(await screen.findByRole("option", { name: /Amihan and Rafael/ }));
  return screen.findByRole("list");
}

function freshDraft() {
  return parseInvitationDocument(structuredClone(templateStarterDocument(gardenPromise)));
}

beforeEach(() => {
  loadInvitation.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("the section checklist", () => {
  it("shows nothing until an invitation is chosen", () => {
    loaded(freshDraft());
    renderWorkspace();

    expect(screen.queryByText(/starting text/)).toBeNull();
  });

  it("counts what is left in the heading rather than making the creator count rows", async () => {
    const document = freshDraft();
    loaded(document);
    renderWorkspace();
    await choose();

    const total = document.sections.length;
    expect(screen.getByRole("heading", { level: 2 })).toHaveProperty(
      "textContent",
      `${total} sections still have the template's starting text.`,
    );
  });

  it("lists every section with the number and name the editor prints", async () => {
    loaded(freshDraft());
    renderWorkspace();
    const list = await choose();

    // Garden Promise numbers Wedding party fifth, and its own word for `participants` is
    // "Wedding party" rather than the schema type.
    expect(list.textContent).toContain("5. Wedding party");
    expect(list.textContent).not.toContain("participants");
  });

  it("names each state in words, so the list is not read by colour alone", async () => {
    const document = freshDraft();
    const hero = document.sections.find((section) => section.type === "hero");
    if (hero?.type !== "hero") throw new Error("The fixture has no hero section.");
    hero.props.title = "Amihan and Rafael";

    loaded(document);
    renderWorkspace();
    await choose();

    expect(screen.getAllByText("Written")).toHaveLength(1);
    expect(screen.getAllByText("Starting text")).toHaveLength(document.sections.length - 1);
  });

  it("marks a hidden section hidden rather than letting it read as unwritten work", async () => {
    const document = freshDraft();
    const gifts = document.sections.find((section) => section.type === "gifts");
    if (!gifts) throw new Error("The fixture has no gifts section.");
    gifts.visible = false;

    loaded(document);
    renderWorkspace();
    await choose();

    // The starter may already hide a section or two, so this counts rather than asserting one:
    // a creator who deliberately hid Gifts must not read "Starting text" as work still owed.
    const hidden = document.sections.filter((section) => !section.visible).length;
    expect(hidden).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hidden from guests/)).toHaveLength(hidden);
  });

  it("says the work is done rather than showing a list of ticks", async () => {
    const document = freshDraft();
    for (const section of document.sections) {
      (section.props as Record<string, unknown>).progressProbe = "changed";
    }

    loaded(document);
    renderWorkspace();
    await choose();

    expect(screen.getByRole("heading", { level: 2 })).toHaveProperty(
      "textContent",
      "Every section has your own words in it.",
    );
  });
});
