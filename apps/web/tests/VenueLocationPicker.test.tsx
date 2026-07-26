import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VenueLocationPicker } from "../src/components/invitations/VenueLocationPicker";

const tileKey = "test-map-key";

// Leaflet is dynamic-imported by the picker. jsdom has no layout, so the real library cannot lay out
// a map; the factories are stubbed and the picker's own contract asserted. A single mutable centre
// stands in for the map's viewport so `getCenter` and pan/`setView` behave consistently.
let centre = { lat: 14.5995, lng: 120.9842 };
const mapInstance: {
  attributionControl: { setPrefix: ReturnType<typeof vi.fn> };
  getCenter: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  panTo: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
} = {
  attributionControl: { setPrefix: vi.fn() },
  getCenter: vi.fn(() => centre),
  on: vi.fn(),
  panTo: vi.fn((position: [number, number]) => {
    centre = { lat: position[0], lng: position[1] };
  }),
  remove: vi.fn(),
  setView: vi.fn((position: [number, number]) => {
    centre = { lat: position[0], lng: position[1] };
    return mapInstance;
  }),
};

vi.mock("leaflet", () => {
  const map = vi.fn(() => mapInstance);
  return {
    default: {
      map,
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    },
  };
});

function geocodeResponse(features: unknown[]) {
  return { json: async () => ({ features }), ok: true } as Response;
}

const sanAgustin = {
  center: [120.9739, 14.5896],
  place_name: "San Agustin Church, Intramuros, Manila",
  text: "San Agustin Church",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  centre = { lat: 14.5995, lng: 120.9842 };
  mapInstance.setView.mockClear();
  mapInstance.on.mockClear();
  mapInstance.panTo.mockClear();
  mapInstance.remove.mockClear();
  mapInstance.setView.mockImplementation((position: [number, number]) => {
    centre = { lat: position[0], lng: position[1] };
    return mapInstance;
  });
  fetchMock = vi.fn().mockResolvedValue(geocodeResponse([sanAgustin]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPicker(overrides: { latitude?: string; longitude?: string } = {}) {
  const onChange = vi.fn();
  render(
    <VenueLocationPicker
      idPrefix="venue"
      latitude={overrides.latitude ?? ""}
      longitude={overrides.longitude ?? ""}
      onChange={onChange}
      tileKey={tileKey}
      venueName="San Agustin Church"
    />,
  );
  return onChange;
}

async function openMap() {
  fireEvent.click(screen.getByRole("button", { name: "Open map to set the location" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Use this location" })).toHaveProperty(
      "disabled",
      false,
    ),
  );
}

async function search(text: string) {
  fireEvent.change(screen.getByLabelText(/Search for the venue/), { target: { value: text } });
}

describe("VenueLocationPicker", () => {
  it("reports no location until one is set", () => {
    renderPicker();
    expect(screen.getByText("No location set")).toBeDefined();
    expect(screen.getByRole("button", { name: /Open map to set the location/ })).toBeDefined();
  });

  it("summarises a placed location and offers to adjust it", () => {
    renderPicker({ latitude: "14.5896", longitude: "120.9739" });
    expect(screen.getByText("Location set")).toBeDefined();
    expect(screen.getByText("14.5896, 120.9739")).toBeDefined();
    expect(screen.getByRole("button", { name: /Adjust the pin on a map/ })).toBeDefined();
  });

  it("clears both coordinates together", () => {
    const onChange = renderPicker({ latitude: "14.5896", longitude: "120.9739" });
    fireEvent.click(screen.getByRole("button", { name: "Remove location" }));
    expect(onChange).toHaveBeenCalledWith({ latitude: "", longitude: "" });
  });

  it("treats a lone latitude as no location at all", () => {
    renderPicker({ latitude: "14.5896" });
    expect(screen.getByText("No location set")).toBeDefined();
  });

  it("opens the full-screen picker and reaches a ready map", async () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Open map to set the location/ }));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("Loading the interactive map");

    await openMap();
    expect(screen.getByRole("application", { name: /Map for San Agustin Church/ })).toBeDefined();
  });

  // The whole point of the change: a creator sets coordinates without typing them.
  it("sets both coordinates from a chosen search result after confirming", async () => {
    const onChange = renderPicker();
    await openMap();
    await search("San Agustin");

    const result = await screen.findByRole("button", { name: /San Agustin Church/ });
    fireEvent.click(result);
    // Choosing does not write to the draft yet — the creator confirms first.
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use this location" }));
    expect(onChange).toHaveBeenCalledWith({ latitude: "14.5896", longitude: "120.9739" });
  });

  it("commits the map centre the pin sits on when the map is dragged", async () => {
    const onChange = renderPicker();
    await openMap();

    const moveHandler = mapInstance.on.mock.calls.find(([event]) => event === "moveend")?.[1] as
      | (() => void)
      | undefined;
    expect(moveHandler).toBeDefined();
    centre = { lat: 14.6, lng: 121 };
    act(() => moveHandler?.());

    fireEvent.click(screen.getByRole("button", { name: "Use this location" }));
    expect(onChange).toHaveBeenCalledWith({ latitude: "14.6", longitude: "121" });
  });

  it("re-centres on a tapped point instead of requiring a marker hit", async () => {
    renderPicker();
    await openMap();

    const clickHandler = mapInstance.on.mock.calls.find(([event]) => event === "click")?.[1] as
      | ((payload: { latlng: { lat: number; lng: number } }) => void)
      | undefined;
    expect(clickHandler).toBeDefined();
    act(() => clickHandler?.({ latlng: { lat: 14.7, lng: 121.1 } }));

    expect(mapInstance.panTo).toHaveBeenCalledWith([14.7, 121.1], expect.anything());
  });

  it("cancelling never writes to the draft", async () => {
    const onChange = renderPicker();
    await openMap();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape without writing", async () => {
    const onChange = renderPicker();
    await openMap();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("biases the search to the Philippines and passes the key", async () => {
    renderPicker();
    await openMap();
    await search("San Agustin");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.pathname).toContain("San%20Agustin");
    expect(requested.searchParams.get("country")).toBe("ph");
    expect(requested.searchParams.get("key")).toBe(tileKey);
  });

  it("explains a failed map and keeps the choice unconfirmable", async () => {
    mapInstance.setView.mockImplementationOnce(() => {
      throw new Error("Map failed");
    });
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Open map to set the location/ }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("The map could not load"),
    );
    expect(screen.getByRole("button", { name: "Use this location" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps manual entry available when no map key is configured", () => {
    const onChange = vi.fn();
    render(
      <VenueLocationPicker
        idPrefix="venue"
        latitude=""
        longitude=""
        onChange={onChange}
        tileKey=""
        venueName="San Agustin Church"
      />,
    );

    expect(screen.getByText(/no map key is configured/)).toBeDefined();
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "14.5896" } });
    expect(onChange).toHaveBeenCalledWith({ latitude: "14.5896", longitude: "" });
  });
});
