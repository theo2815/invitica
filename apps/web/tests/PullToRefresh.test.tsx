import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PullToRefresh } from "../src/components/dashboard/PullToRefresh";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

function setViewport(isMobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: isMobile,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value, writable: true });
}

/** jsdom has no constructible `TouchEvent`, so the shape the handlers read is built by hand. */
function touchEvent(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: [{ clientY }] });
  return event;
}

function pull(from: number, to: number) {
  window.dispatchEvent(touchEvent("touchstart", from));
  const move = touchEvent("touchmove", to);
  window.dispatchEvent(move);
  window.dispatchEvent(touchEvent("touchend", to));
  return move;
}

afterEach(cleanup);

beforeEach(() => {
  refresh.mockReset();
  setViewport(true);
  setScrollY(0);
  document.body.innerHTML = "";
});

describe("pull to refresh", () => {
  it("refreshes after a pull past the threshold at the top of the page", async () => {
    render(<PullToRefresh />);

    // 72px of travel needs 144px of finger, because the gesture resists by half.
    pull(100, 260);

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("cancels the touch it is handling so the browser's own gesture cannot also run", () => {
    render(<PullToRefresh />);

    expect(pull(100, 260).defaultPrevented).toBe(true);
  });

  it("ignores a pull that stops short of the threshold", async () => {
    render(<PullToRefresh />);

    pull(100, 160);

    await waitFor(() => expect(refresh).not.toHaveBeenCalled());
  });

  it("leaves ordinary scrolling alone when the page is not at the top", () => {
    render(<PullToRefresh />);
    setScrollY(400);

    const move = pull(100, 260);

    expect(move.defaultPrevented).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not reload a decision in progress", () => {
    document.body.innerHTML = '<div role="dialog">Delete this invitation?</div>';
    render(<PullToRefresh />);

    pull(100, 260);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("stays out of the way on desktop, which has a reload control already", () => {
    setViewport(false);
    render(<PullToRefresh />);

    const move = pull(100, 260);

    expect(move.defaultPrevented).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("announces the refresh rather than relying on the moving indicator", async () => {
    render(<PullToRefresh />);

    pull(100, 260);

    await waitFor(() => expect(screen.getByText("Refreshing this page…")).toBeDefined());
  });
});
