import { parseInvitationDocument } from "@invitica/invitation-schema";
import { resolveTemplateById } from "@invitica/template-kit";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LittleBlessingsDraftEditor } from "../src/components/invitations/LittleBlessingsDraftEditor";
import { saveLittleBlessingsAction } from "../src/server/invitations/actions";

vi.mock("../src/server/invitations/actions", () => ({
  loadInvitationPublicationStatusAction: vi.fn(),
  publishInvitationAction: vi.fn(),
  saveLittleBlessingsAction: vi.fn(),
}));

vi.mock("../src/server/media/actions", () => ({
  listInvitationImagesAction: vi.fn(),
  removeInvitationImageAction: vi.fn(),
  uploadInvitationImageAction: vi.fn(),
}));

// Each case renders the whole Little Blessings invitation — eleven sections,
// eight photographs, eight gift ideas, envelope, and map — beside the editor.
// In jsdom that costs a few seconds per render and exceeded the 5 s default
// once under full-suite load, so this file gets its own generous budget.
vi.setConfig({ testTimeout: 30_000 });

const invitationId = "71000000-0000-4000-8000-000000000001";
const littleBlessings = resolveTemplateById("little-blessings");
const document = parseInvitationDocument(structuredClone(littleBlessings.defaultDocument));

let root: HTMLElement;

function renderEditor() {
  const result = render(
    <LittleBlessingsDraftEditor
      initialAssets={[]}
      initialDocument={document}
      initialRevision={1}
      invitationId={invitationId}
      rendererKey={littleBlessings.rendererKey}
    />,
  );
  root = result.container;
  return result;
}

/** The section accordion cards, in the order the creator reads them. */
function sectionCards(): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("section[data-hidden]")];
}

function sectionNames(): string[] {
  return sectionCards().map(
    (card) => card.querySelector("button[aria-expanded]")?.textContent?.trim() ?? "",
  );
}

function card(name: string) {
  const match = sectionCards().find((candidate) =>
    candidate.querySelector("button[aria-expanded]")?.textContent?.includes(name),
  );
  if (!match) throw new Error(`No section card for ${name}`);
  return { element: match, ...within(match) };
}

function openSection(name: string) {
  const trigger = card(name).element.querySelector("button[aria-expanded]");
  if (!trigger) throw new Error(`No trigger for ${name}`);
  fireEvent.click(trigger);
}

/** The rendered invitation, which is the only place guest-facing copy belongs. */
function preview() {
  const frame = root.querySelector("[data-envelope-gated]");
  if (!frame) throw new Error("No invitation preview");
  return frame;
}

/** The hero splits the name across grid children, so read them in document order. */
function previewHeroName() {
  return [...preview().querySelectorAll("h1 > *")]
    .map((part) => part.textContent ?? "")
    .join(" ")
    .trim();
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(saveLittleBlessingsAction).mockReset();
});

function lastSavedDetails() {
  const [call] = vi.mocked(saveLittleBlessingsAction).mock.calls;
  if (!call) throw new Error("The save action was never called");
  return (call[0] as { details: Record<string, { props: never; visible: boolean }> }).details;
}

describe("Little Blessings editor", () => {
  it("lists the eleven curated sections with the reply section last", () => {
    renderEditor();
    const names = sectionNames();

    expect(names).toHaveLength(11);
    expect(names[0]).toContain("The celebrant");
    expect(names[3]).toContain("Where and when");
    expect(names.at(-1)).toContain("Celebrate with us");
  });

  it("updates the shared renderer preview and saves after the idle delay", async () => {
    vi.mocked(saveLittleBlessingsAction).mockResolvedValue({ revision: 2, status: "saved" });
    renderEditor();

    fireEvent.change(screen.getByLabelText(/The celebrant's name/), {
      target: { value: "Amara Joy" },
    });

    expect(previewHeroName()).toBe("Amara Joy");
    expect(screen.getByText("Unsaved changes")).toBeDefined();
    expect(saveLittleBlessingsAction).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(saveLittleBlessingsAction).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 1, invitationId }),
    );
    expect(lastSavedDetails().hero?.props).toMatchObject({ title: "Amara Joy" });
    expect(screen.getByText("Revision 2")).toBeDefined();
  });

  it("keeps the hero and Where and when visible and disables their switches", () => {
    renderEditor();
    const hero = card("The celebrant").getByRole("checkbox") as HTMLInputElement;
    const whereAndWhen = card("Where and when").getByRole("checkbox") as HTMLInputElement;

    expect(hero.disabled).toBe(true);
    expect(hero.checked).toBe(true);
    expect(whereAndWhen.disabled).toBe(true);
    expect(whereAndWhen.checked).toBe(true);
    expect(card("The celebrant").element.textContent).toContain("cannot be hidden");
  });

  it("hides an optional section without losing its content", async () => {
    vi.mocked(saveLittleBlessingsAction).mockResolvedValue({ revision: 2, status: "saved" });
    renderEditor();

    expect(preview().textContent).toContain("Until the celebration");
    fireEvent.click(card("Until the celebration").getByRole("checkbox"));
    expect(preview().textContent).not.toContain("Until the celebration");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    const countdown = lastSavedDetails().countdown as unknown as {
      props: { dateLabel: string };
      visible: boolean;
    };
    expect(countdown.visible).toBe(false);
    expect(countdown.props.dateLabel).toBe("Sunday, April 11, 2027 at 9:00 AM");
  });

  it("waits for a photograph before a new invitation's album can be shown", async () => {
    vi.mocked(saveLittleBlessingsAction).mockResolvedValue({ revision: 2, status: "saved" });
    const starter = littleBlessings.starterDocument;

    if (!starter) {
      throw new Error("Little Blessings must ship a starter document.");
    }

    const result = render(
      <LittleBlessingsDraftEditor
        initialAssets={[]}
        initialDocument={parseInvitationDocument(structuredClone(starter))}
        initialRevision={1}
        invitationId={invitationId}
        rendererKey={littleBlessings.rendererKey}
      />,
    );
    root = result.container;

    const album = card("Little moments").getByRole("checkbox") as HTMLInputElement;

    // Showing an empty album is a document the contract rejects, so the switch
    // explains itself rather than offering a state that cannot be saved.
    expect(album.disabled).toBe(true);
    expect(album.checked).toBe(false);
    expect(card("Little moments").element.textContent).toContain("Add a photograph");

    // The section is still editable while empty; a new draft must be able to
    // autosave every section it contains.
    openSection("Little moments");
    fireEvent.change(card("Little moments").getByLabelText(/^Heading/), {
      target: { value: "Our own little moments" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    const gallery = lastSavedDetails().gallery as unknown as {
      props: { heading: string; images: unknown[] };
      visible: boolean;
    };
    expect(gallery.visible).toBe(false);
    expect(gallery.props.images).toEqual([]);
    expect(gallery.props.heading).toBe("Our own little moments");
  });

  it("labels the reply section as personal-link only", () => {
    renderEditor();
    expect(card("Celebrate with us").element.textContent).toContain("personal link");
  });

  it("offers to hide the section instead of deleting the last photograph", () => {
    renderEditor();
    openSection("Little moments");

    for (let position = 8; position > 1; position -= 1) {
      fireEvent.click(
        card("Little moments").getByRole("button", { name: `Remove photograph ${position}` }),
      );
    }

    expect(
      card("Little moments").getAllByRole("button", { name: /^Remove photograph/ }),
    ).toHaveLength(1);

    fireEvent.click(card("Little moments").getByRole("button", { name: "Remove photograph 1" }));

    expect(screen.getByText(/needs at least one photograph/)).toBeDefined();
    expect(
      card("Little moments").getAllByRole("button", { name: /^Remove photograph/ }),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Hide this section instead" }));
    expect((card("Little moments").getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("stops adding photographs and gift ideas at eight", () => {
    renderEditor();

    openSection("Little moments");
    expect(card("Little moments").getByText("The album holds 8 photographs.")).toBeDefined();

    openSection("Gift ideas");
    const addGift = card("Gift ideas").getByRole("button", {
      name: /Add a gift idea/,
    }) as HTMLButtonElement;
    expect(addGift.disabled).toBe(true);
  });

  it("reorders a photograph within the album", () => {
    renderEditor();
    openSection("Little moments");

    const titles = () =>
      card("Little moments")
        .getAllByLabelText(/^Title/)
        .map((input) => (input as HTMLInputElement).value);
    const [first, second] = titles();

    fireEvent.click(
      card("Little moments").getByRole("button", { name: "Move photograph 2 earlier" }),
    );

    expect(titles().slice(0, 2)).toEqual([second, first]);
  });

  it("blocks autosave while a required field is empty and explains why", async () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText(/The celebrant's name/), { target: { value: "  " } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });

    expect(saveLittleBlessingsAction).not.toHaveBeenCalled();
    expect(screen.getByText(/Some required details are still empty/)).toBeDefined();
    expect(screen.getByRole("alert").textContent).toContain("Add this before");
  });

  it("keeps local text visible and offers recovery after a revision conflict", async () => {
    vi.mocked(saveLittleBlessingsAction).mockResolvedValue({
      message: "This draft changed in another session.",
      status: "conflict",
    });
    renderEditor();

    fireEvent.change(screen.getByLabelText(/The celebrant's name/), {
      target: { value: "A local version" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(previewHeroName()).toBe("A local version");
    expect(screen.getByRole("button", { name: "Copy unsaved details" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Discard and reload" })).toBeDefined();
  });

  it("previews the invitation a general-link guest receives without a reply section", () => {
    renderEditor();

    expect(preview().textContent).toContain("Celebrate with us");

    fireEvent.click(screen.getByRole("button", { name: "General link" }));

    expect(preview().textContent).not.toContain("Celebrate with us");
    expect(screen.getByText(/without a reply section/)).toBeDefined();
  });

  it("carries an unusually long Philippine name through to the preview", async () => {
    vi.mocked(saveLittleBlessingsAction).mockResolvedValue({ revision: 2, status: "saved" });
    const longName = "María de los Ángeles Beatriz Santos-Villanueva de la Cruz";
    renderEditor();

    fireEvent.change(screen.getByLabelText(/The celebrant's name/), {
      target: { value: longName },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(previewHeroName()).toBe(longName);
    expect(screen.getByText("Revision 2")).toBeDefined();
  });
});
