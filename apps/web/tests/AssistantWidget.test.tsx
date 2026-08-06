import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantProvider } from "../src/components/assistant/AssistantProvider";
import { AssistantWidget } from "../src/components/assistant/AssistantWidget";

let pathname = "/dashboard";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** jsdom ships no `matchMedia`. This one answers the widget's single breakpoint query. */
function setViewport(compact: boolean) {
  window.matchMedia = ((query: string) => ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => false,
    matches: compact,
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function answerWith(text: string) {
  return vi.fn().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    ),
  );
}

function renderWidget(children?: React.ReactNode) {
  return render(
    <AssistantProvider>
      {children}
      <AssistantWidget />
    </AssistantProvider>,
  );
}

beforeEach(() => {
  pathname = "/dashboard";
  push.mockReset();
  setViewport(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the floating assistant", () => {
  it("opens from a labelled bubble and closes on Escape, returning focus", async () => {
    renderWidget();

    const bubble = screen.getByRole("button", {
      name: "Ask Tala, Invitica's AI assistant",
    });
    fireEvent.click(bubble);

    const panel = await screen.findByRole("dialog", {
      name: "Tala, Invitica's AI assistant",
    });
    expect(panel).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }),
    );
  });

  it("keeps the thread when the creator navigates with the panel open", async () => {
    vi.stubGlobal("fetch", answerWith("Open Guests & RSVPs, then copy each guest's link."));

    const view = renderWidget(<p>Overview</p>);
    fireEvent.click(screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }));
    fireEvent.click(await screen.findByText("How do I send personalized links?"));

    await screen.findByText("Open Guests & RSVPs, then copy each guest's link.");

    // What a route change looks like from the shell: the same provider, different children.
    pathname = "/dashboard/templates";
    view.rerender(
      <AssistantProvider>
        <p>Templates</p>
        <AssistantWidget />
      </AssistantProvider>,
    );

    expect(screen.getByText("Templates")).toBeTruthy();
    expect(screen.getByText("Open Guests & RSVPs, then copy each guest's link.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Tala, Invitica's AI assistant" })).toBeTruthy();
  });

  it("shows the full-view action on desktop and mobile", async () => {
    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }));
    expect(await screen.findByRole("button", { name: "Open full view" })).toBeTruthy();

    cleanup();
    setViewport(true);

    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Open full view" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open full view" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/assistant"));
  });

  it("shows Tala thinking while an answer is pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const view = renderWidget();

    fireEvent.click(screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }));
    fireEvent.click(await screen.findByText("How do I send personalized links?"));

    await waitFor(() =>
      expect(view.container.querySelector('[data-tala-state="thinking"]')).toBeTruthy(),
    );
    // The polite status now says what the visible indicator beside Tala says, so a
    // screen-reader user and a sighted one are told the same thing.
    expect(screen.getByText("Tala is thinking.")).toBeTruthy();
  });

  it("offers the expand control inside the editor now that a draft can be settled first", async () => {
    // Stage one withheld this control because leaving the editor could discard keystrokes
    // from a save that had not been sent. `useDraftFlush` settles the draft first, so the
    // control is available again — see the flush cases in DraftAutosave.test.tsx.
    pathname = "/dashboard/invitations/71000000-0000-4000-8000-000000000001";
    renderWidget();

    fireEvent.click(screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }));
    await screen.findByRole("dialog");

    fireEvent.click(await screen.findByRole("button", { name: "Open full view" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/assistant"));
  });

  it("does not float over the page that already shows the same thread", () => {
    pathname = "/dashboard/assistant";
    renderWidget();

    expect(screen.queryByRole("button", { name: "Ask Tala, Invitica's AI assistant" })).toBeNull();
  });

  it("surfaces a refusal without leaving a half-written answer behind", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: "You have used all of today's messages with Tala. They refresh tomorrow.",
            status: "refused",
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );

    renderWidget();
    fireEvent.click(screen.getByRole("button", { name: "Ask Tala, Invitica's AI assistant" }));
    fireEvent.click(await screen.findByText("How do I send personalized links?"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("refresh tomorrow");
    // The question stays so it can be asked again; the empty answer placeholder does not.
    expect(screen.getByText("How do I send personalized links?")).toBeTruthy();
    expect(document.querySelectorAll('[data-role="assistant"]')).toHaveLength(0);
  });
});
