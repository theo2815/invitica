import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InteractiveMap } from "../../../packages/renderer/src/InteractiveMap";

const mapInstance: {
  attributionControl: { setPrefix: ReturnType<typeof vi.fn> };
  remove: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
} = {
  attributionControl: { setPrefix: vi.fn() },
  remove: vi.fn(),
  setView: vi.fn(),
};

mapInstance.setView.mockImplementation(() => mapInstance);
const marker = { addTo: vi.fn(() => marker) };

vi.mock("leaflet", () => ({
  default: {
    divIcon: vi.fn(() => ({})),
    map: vi.fn(() => mapInstance),
    marker: vi.fn(() => marker),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  },
}));

beforeEach(() => {
  mapInstance.remove.mockClear();
  mapInstance.setView.mockReset();
  mapInstance.setView.mockImplementation(() => mapInstance);
});

afterEach(() => cleanup());

function renderMap() {
  render(
    <InteractiveMap
      label="San Agustin Church"
      latitude={14.5896}
      longitude={120.9739}
      tileKey="test-map-key"
    />,
  );
}

describe("InteractiveMap feedback", () => {
  it("keeps the reserved map area informative while Leaflet loads", async () => {
    renderMap();

    fireEvent.click(await screen.findByRole("button", { name: "Show map" }));

    const loadingButton = screen.getByRole("button", { name: "Loading map" });
    expect(loadingButton).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toContain("Loading the interactive map");
    expect(
      screen.getByRole("region", { name: "Map of San Agustin Church" }).getAttribute("aria-busy"),
    ).toBe("true");

    await waitFor(() => expect(screen.getByRole("button", { name: "Hide map" })).toBeDefined());
  });

  it("explains a failed map and keeps retry available", async () => {
    mapInstance.setView.mockImplementationOnce(() => {
      throw new Error("Map failed");
    });
    renderMap();

    fireEvent.click(await screen.findByRole("button", { name: "Show map" }));

    const retry = await screen.findByRole("button", { name: "Try the map again" });
    expect(retry).toHaveProperty("disabled", false);
    expect(screen.getByRole("status").textContent).toContain("The map could not load");

    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("button", { name: "Hide map" })).toBeDefined());
  });
});
