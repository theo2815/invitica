import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VenueLocationPicker } from "../src/components/invitations/VenueLocationPicker";

const tileKey = "test-map-key";

// Leaflet is dynamic-imported by the picker. jsdom has no layout, so the real library
// cannot lay out a map; the factories are stubbed and the picker's own contract asserted.
const mapInstance: {
  attributionControl: { setPrefix: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setView: ReturnType<typeof vi.fn>;
} = {
  attributionControl: { setPrefix: vi.fn() },
  on: vi.fn(),
  remove: vi.fn(),
  // Leaflet chains: `map(...).setView(...)` returns the map, and the picker relies on it.
  setView: vi.fn(() => mapInstance),
};
const marker = { addTo: vi.fn(() => marker), setLatLng: vi.fn() };

vi.mock("leaflet", () => {
  const map = vi.fn(() => mapInstance);
  return {
    default: {
      circleMarker: vi.fn(() => marker),
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
  vi.useFakeTimers();
  mapInstance.setView.mockClear();
  mapInstance.on.mockClear();
  marker.setLatLng.mockClear();
  fetchMock = vi.fn().mockResolvedValue(geocodeResponse([sanAgustin]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

async function search(text: string) {
  fireEvent.change(screen.getByLabelText(/Find the venue/), {
    target: { value: text },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe("VenueLocationPicker", () => {
  it("reports no location until one is set", () => {
    renderPicker();
    expect(screen.getByText("No location set")).toBeDefined();
    expect(screen.getByText(/directions link without a map/)).toBeDefined();
  });

  // The whole point of the change: a creator sets coordinates without typing them.
  it("sets both coordinates from a chosen search result", async () => {
    const onChange = renderPicker();
    await search("San Agustin");

    expect(screen.getByRole("button", { name: /San Agustin Church/ })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /San Agustin Church/ }));

    expect(onChange).toHaveBeenCalledWith({ latitude: "14.5896", longitude: "120.9739" });
  });

  it("biases the search to the Philippines and does not query short input", async () => {
    renderPicker();
    await search("Sa");
    expect(fetchMock).not.toHaveBeenCalled();

    await search("San Agustin");
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.pathname).toContain("San%20Agustin");
    expect(requested.searchParams.get("country")).toBe("ph");
    expect(requested.searchParams.get("key")).toBe(tileKey);
  });

  it("debounces to one request per settled query", async () => {
    renderPicker();
    const input = screen.getByLabelText(/Find the venue/);
    fireEvent.change(input, { target: { value: "San A" } });
    fireEvent.change(input, { target: { value: "San Ag" } });
    fireEvent.change(input, { target: { value: "San Agustin" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("explains an empty result instead of looking broken", async () => {
    fetchMock.mockResolvedValue(geocodeResponse([]));
    renderPicker();
    await search("Nowhere at all");

    expect(screen.getByText(/No matching place/)).toBeDefined();
  });

  it("falls back to the map when place search fails", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({}), ok: false } as Response);
    renderPicker();
    await search("San Agustin");

    expect(screen.getByText(/Place search is unavailable/)).toBeDefined();
  });

  it("rejects a coordinate outside its valid range rather than storing it", async () => {
    fetchMock.mockResolvedValue(geocodeResponse([{ ...sanAgustin, center: [120.9739, 999] }]));
    renderPicker();
    await search("San Agustin");

    expect(screen.queryByRole("list", { name: "Matching places" })).toBeNull();
    expect(screen.getByText(/Place search is unavailable/)).toBeDefined();
  });

  it("clears both coordinates together", () => {
    const onChange = renderPicker({ latitude: "14.5896", longitude: "120.9739" });
    expect(screen.getByText("Location set")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Remove location" }));
    expect(onChange).toHaveBeenCalledWith({ latitude: "", longitude: "" });
  });

  it("treats a lone latitude as no location at all", () => {
    renderPicker({ latitude: "14.5896" });
    expect(screen.getByText("No location set")).toBeDefined();
  });

  it("loads the map on request and reports the pin position", async () => {
    // Real timers here: the map is awaited through a dynamic import, and `waitFor`
    // cannot make progress while the clock is faked.
    vi.useRealTimers();
    renderPicker({ latitude: "14.5896", longitude: "120.9739" });

    fireEvent.click(screen.getByRole("button", { name: "Check the pin on the map" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Hide map" })).toBeDefined());
    expect(screen.getByRole("application", { name: /Map for San Agustin Church/ })).toBeDefined();
    expect(screen.getByText(/Tap anywhere on the map to move the pin/)).toBeDefined();
  });

  it("replaces the blank map canvas with accessible loading feedback", async () => {
    vi.useRealTimers();
    renderPicker({ latitude: "14.5896", longitude: "120.9739" });

    fireEvent.click(screen.getByRole("button", { name: "Check the pin on the map" }));

    const loadingButton = screen.getByRole("button", { name: "Loading map…" });
    expect(loadingButton).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toContain("Loading the interactive map");
    expect(screen.getByRole("application").getAttribute("aria-busy")).toBe("true");

    await waitFor(() => expect(screen.getByRole("button", { name: "Hide map" })).toBeDefined());
  });

  it("offers an explicit retry after the map fails", async () => {
    vi.useRealTimers();
    mapInstance.setView.mockImplementationOnce(() => {
      throw new Error("Map failed");
    });
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Point at the map instead" }));

    const retry = await screen.findByRole("button", { name: "Try loading the map again" });
    expect(retry).toHaveProperty("disabled", false);
    expect(screen.getByRole("status").textContent).toContain("The map could not load");

    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("button", { name: "Hide map" })).toBeDefined());
  });

  it("moves the pin when the map is tapped", async () => {
    vi.useRealTimers();
    const onChange = renderPicker({ latitude: "14.5896", longitude: "120.9739" });
    fireEvent.click(screen.getByRole("button", { name: "Check the pin on the map" }));
    await waitFor(() => expect(mapInstance.on).toHaveBeenCalled());

    const [event, handler] = mapInstance.on.mock.calls[0] ?? [];
    expect(event).toBe("click");
    (handler as (payload: { latlng: { lat: number; lng: number } }) => void)({
      latlng: { lat: 14.6, lng: 121 },
    });

    expect(onChange).toHaveBeenCalledWith({ latitude: "14.6", longitude: "121" });
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
