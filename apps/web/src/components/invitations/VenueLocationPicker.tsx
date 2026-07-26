"use client";

import { buildMapTileUrl, interactiveMapStyles, MAP_ATTRIBUTION } from "@invitica/renderer";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  formatCoordinate,
  searchVenueLocations,
  type VenueSearchResult,
} from "../../lib/invitations/venue-geocoding";
import styles from "./VenueLocationPicker.module.css";

/**
 * Leaflet's own layout rules, plus the picker's pin. Injected here rather than relied on
 * from the preview renderer, which also injects them: the picker must not depend on a
 * sibling component happening to be mounted. Identical declarations, so a duplicate is
 * inert, and it is only in the document while the map panel is open.
 */
const mapStyles = `${interactiveMapStyles}
.vlp-marker { fill: #7a3442; fill-opacity: 0.9; stroke: #fffdf8; stroke-width: 3; }
`;

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;
const PLACED_ZOOM = 16;
const SEARCH_ZOOM = 17;
/** Metro Manila, so an unplaced map opens somewhere recognisable to a PH creator. */
const DEFAULT_CENTRE = { latitude: 14.5995, longitude: 120.9842 };
const DEFAULT_ZOOM = 11;
const MAX_ZOOM = 19;
const MIN_ZOOM = 3;

export interface VenueLocationPickerProps {
  readonly idPrefix: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly onChange: (next: { latitude: string; longitude: string }) => void;
  readonly reducedMotion?: boolean;
  readonly tileKey: string;
  readonly venueName: string;
}

type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "searching" }
  | { readonly kind: "results"; readonly results: readonly VenueSearchResult[] }
  | { readonly kind: "failed" };

type MapState = "hidden" | "loading" | "ready" | "failed";

interface LeafletMarker {
  setLatLng: (position: [number, number]) => void;
}

interface LeafletMap {
  remove: () => void;
  setView: (position: [number, number], zoom: number) => void;
}

function parseCoordinate(value: string, bound: number): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > bound) return null;
  return parsed;
}

/**
 * Lets a creator set a venue's coordinates by searching for the place or pointing at a
 * map, instead of typing latitude and longitude by hand.
 *
 * Three deliberate decisions:
 *
 * - **Search is the primary path and the keyboard path.** Choosing a result sets the
 *   coordinates outright, so placing a venue never requires dragging — the design rules
 *   forbid a drag-only critical action, and dragging a pin is awkward on a phone anyway.
 * - **Tapping the map moves the pin**, in addition to dragging it. A single tap is a
 *   far easier touch target than a 20 px marker.
 * - **Leaflet is dynamic-imported** when the creator opens the map, so the editor bundle
 *   does not carry it for the many sessions that never touch the venue section.
 *
 * Coordinates are reported as strings so the editor's change signature, autosave, and
 * validation keep treating them exactly like every other field.
 */
export function VenueLocationPicker({
  idPrefix,
  latitude,
  longitude,
  onChange,
  reducedMotion = false,
  tileKey,
  venueName,
}: VenueLocationPickerProps) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [mapState, setMapState] = useState<MapState>("hidden");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const generatedId = useId();
  const resultsId = `${generatedId}-results`;

  const parsedLatitude = parseCoordinate(latitude, 90);
  const parsedLongitude = parseCoordinate(longitude, 180);
  const hasLocation = parsedLatitude !== null && parsedLongitude !== null;

  // Kept in a ref so the map's own event handlers always report through the newest
  // callback without the map being torn down and rebuilt on every editor keystroke.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const place = useCallback((nextLatitude: number, nextLongitude: number) => {
    onChangeRef.current({
      latitude: formatCoordinate(nextLatitude),
      longitude: formatCoordinate(nextLongitude),
    });
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH || !tileKey) {
      setSearch({ kind: "idle" });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearch({ kind: "searching" });
      void searchVenueLocations(trimmed, tileKey, controller.signal).then(
        (results) => setSearch({ kind: "results", results }),
        (error: unknown) => {
          // An aborted keystroke is not a failure; a newer request owns the state.
          if (error instanceof Error && error.name === "AbortError") return;
          setSearch({ kind: "failed" });
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, tileKey]);

  // Built as an effect rather than in the click handler so the canvas is committed to
  // the DOM before Leaflet measures it.
  //
  // The coordinates are read for the opening centre only, and are deliberately not
  // dependencies: re-running would tear the map down and rebuild it underneath a creator
  // who is still adjusting the pin. A separate effect below moves the marker instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies(hasLocation): opening centre only.
  // biome-ignore lint/correctness/useExhaustiveDependencies(parsedLatitude): opening centre only.
  // biome-ignore lint/correctness/useExhaustiveDependencies(parsedLongitude): opening centre only.
  useEffect(() => {
    if (mapState !== "loading") return;
    let cancelled = false;

    void (async () => {
      try {
        // Leaflet ships a UMD build, so its factories sit on the interop default.
        const leafletModule = await import("leaflet");
        const leaflet = leafletModule.default ?? leafletModule;
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;

        const centre: [number, number] = hasLocation
          ? [parsedLatitude, parsedLongitude]
          : [DEFAULT_CENTRE.latitude, DEFAULT_CENTRE.longitude];
        const instance = leaflet
          .map(canvas, {
            fadeAnimation: !reducedMotion,
            markerZoomAnimation: !reducedMotion,
            // The picker sits in a scrolling inspector; wheel zoom would hijack it.
            scrollWheelZoom: false,
            touchZoom: true,
            zoomAnimation: !reducedMotion,
          })
          .setView(centre, hasLocation ? PLACED_ZOOM : DEFAULT_ZOOM);

        instance.attributionControl.setPrefix(
          '<a href="https://leafletjs.com/" target="_blank" rel="noreferrer">Leaflet</a>',
        );
        leaflet
          .tileLayer(buildMapTileUrl(tileKey), {
            attribution: MAP_ATTRIBUTION,
            maxZoom: MAX_ZOOM,
            minZoom: MIN_ZOOM,
            tileSize: 512,
            zoomOffset: -1,
          })
          .addTo(instance);

        const marker = leaflet
          .circleMarker(centre, { className: "vlp-marker", interactive: false, radius: 10 })
          .addTo(instance);

        instance.on("click", (event: { latlng: { lat: number; lng: number } }) => {
          place(event.latlng.lat, event.latlng.lng);
        });

        mapRef.current = instance as unknown as LeafletMap;
        markerRef.current = marker as unknown as LeafletMarker;
        setMapState("ready");
      } catch {
        if (!cancelled) setMapState("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapState, place, reducedMotion, tileKey]);

  // Follows coordinates set from anywhere — a search result, a tap, or a restored draft.
  useEffect(() => {
    if (mapState !== "ready" || !hasLocation) return;
    markerRef.current?.setLatLng([parsedLatitude, parsedLongitude]);
  }, [hasLocation, mapState, parsedLatitude, parsedLongitude]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    },
    [],
  );

  function chooseResult(result: VenueSearchResult) {
    place(result.latitude, result.longitude);
    setSelectedLabel(result.label);
    setQuery("");
    setSearch({ kind: "idle" });
    // Opening the map is the confirmation step: the creator sees where the pin landed
    // before the invitation is saved with it.
    if (mapState === "hidden" || mapState === "failed") setMapState("loading");
    else mapRef.current?.setView([result.latitude, result.longitude], SEARCH_ZOOM);
  }

  function clearLocation() {
    onChange({ latitude: "", longitude: "" });
    setSelectedLabel(null);
  }

  if (!tileKey) {
    return (
      <div className={styles.picker}>
        <p className={styles.unavailable} role="status">
          The venue map is unavailable because no map key is configured, so the invitation will show
          its directions link only. Coordinates can still be entered by hand.
        </p>
        <div className={styles.manualPair}>
          <label htmlFor={`${idPrefix}-latitude`}>
            Latitude
            <input
              id={`${idPrefix}-latitude`}
              inputMode="decimal"
              maxLength={20}
              onChange={(event) => onChange({ latitude: event.target.value, longitude })}
              value={latitude}
            />
          </label>
          <label htmlFor={`${idPrefix}-longitude`}>
            Longitude
            <input
              id={`${idPrefix}-longitude`}
              inputMode="decimal"
              maxLength={20}
              onChange={(event) => onChange({ latitude, longitude: event.target.value })}
              value={longitude}
            />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.picker}>
      <div className={styles.searchField}>
        <label htmlFor={`${idPrefix}-place-search`}>
          Find the venue
          <span>Search a place, then confirm the pin</span>
        </label>
        {/*
          A search box and a list of buttons, deliberately not a combobox/listbox. That
          pattern obliges arrow-key navigation and `aria-activedescendant`, which this
          control does not implement — claiming the roles would tell a screen-reader user
          to expect keys that do nothing. Tab reaches each result natively, and the live
          region below announces what happened.
        */}
        <input
          autoComplete="off"
          id={`${idPrefix}-place-search`}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="San Agustin Church, Intramuros"
          type="search"
          value={query}
        />
      </div>

      <p aria-live="polite" className={styles.searchStatus}>
        {search.kind === "searching" ? "Searching places…" : null}
        {search.kind === "failed" ? "Place search is unavailable. Point at the map instead." : null}
        {search.kind === "results" && search.results.length === 0
          ? "No matching place. Try a nearby landmark, or point at the map."
          : null}
        {search.kind === "results" && search.results.length > 0
          ? `${search.results.length} matching ${search.results.length === 1 ? "place" : "places"}. Choose one to set the location.`
          : null}
      </p>

      {search.kind === "results" && search.results.length > 0 ? (
        <ul aria-label="Matching places" className={styles.results} id={resultsId}>
          {search.results.map((result) => (
            <li key={`${result.latitude},${result.longitude},${result.label}`}>
              <button onClick={() => chooseResult(result)} type="button">
                <strong>{result.name}</strong>
                <small>{result.label}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.locationSummary}>
        {hasLocation ? (
          <>
            <p>
              <strong>Location set</strong>
              <span>
                {selectedLabel ??
                  `${formatCoordinate(parsedLatitude)}, ${formatCoordinate(parsedLongitude)}`}
              </span>
            </p>
            <button onClick={clearLocation} type="button">
              Remove location
            </button>
          </>
        ) : (
          <p>
            <strong>No location set</strong>
            <span>The invitation will show its directions link without a map.</span>
          </p>
        )}
      </div>

      <button
        className={styles.mapToggle}
        onClick={() => {
          if (mapState === "ready") {
            mapRef.current?.remove();
            mapRef.current = null;
            markerRef.current = null;
            setMapState("hidden");
            return;
          }
          if (mapState !== "loading") setMapState("loading");
        }}
        type="button"
      >
        {mapState === "ready"
          ? "Hide map"
          : mapState === "loading"
            ? "Loading map…"
            : hasLocation
              ? "Check the pin on the map"
              : "Point at the map instead"}
      </button>

      {mapState === "hidden" ? null : (
        <div className={styles.mapPanel}>
          <style>{mapStyles}</style>
          <div
            aria-label={
              venueName
                ? `Map for ${venueName}. Tap to place the pin.`
                : "Map. Tap to place the pin."
            }
            className={styles.canvas}
            data-state={mapState}
            ref={canvasRef}
            role="application"
          />
          {mapState === "ready" ? (
            <p className={styles.mapHint}>
              Tap anywhere on the map to move the pin. Searching for the venue above also sets it.
            </p>
          ) : null}
          {mapState === "failed" ? (
            <p className={styles.mapHint} role="status">
              The map could not load. Search for the venue above instead.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
