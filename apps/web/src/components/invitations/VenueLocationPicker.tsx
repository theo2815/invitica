"use client";

import { buildMapTileUrl, interactiveMapStyles, MAP_ATTRIBUTION } from "@invitica/renderer";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  formatCoordinate,
  searchVenueLocations,
  type VenueSearchResult,
} from "../../lib/invitations/venue-geocoding";
import { Close } from "../Icons";
import styles from "./VenueLocationPicker.module.css";

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

type MapState = "idle" | "loading" | "ready" | "failed";

interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

interface LeafletMap {
  getCenter: () => LatLng;
  on: (event: string, handler: (payload: { latlng: LatLng }) => void) => void;
  panTo: (position: [number, number], options?: { animate?: boolean }) => void;
  remove: () => void;
  setView: (
    position: [number, number],
    zoom: number,
    options?: { animate?: boolean },
  ) => LeafletMap;
}

function parseCoordinate(value: string, bound: number): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > bound) return null;
  return parsed;
}

/**
 * Lets a creator set a venue's coordinates by searching for the place or aiming a map, instead of
 * typing latitude and longitude by hand.
 *
 * The map lives in a **full-screen picker** rather than a cramped inline panel, because pinning an
 * exact spot on a phone needs room to explore. Inside it:
 *
 * - **A fixed centre pin** marks the map's centre; the creator drags the map underneath it — the
 *   familiar phone-maps gesture — and a tap re-centres on the tapped point. Placing a venue never
 *   requires dragging a small marker, which the design rules forbid as a drag-only critical action.
 * - **Search is the keyboard path.** Choosing a result re-centres the map on it.
 * - **The selection is provisional until confirmed.** Nothing is written to the draft until the
 *   creator presses *Use this location*, so a stray pan can be abandoned with *Cancel*.
 * - **Leaflet is dynamic-imported** when the picker opens, so the editor bundle never carries it for
 *   the many sessions that never touch the venue section.
 *
 * Coordinates are reported as strings so the editor's change signature, autosave, and validation
 * keep treating them exactly like every other field.
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
  const [open, setOpen] = useState(false);
  const [mapState, setMapState] = useState<MapState>("idle");
  const [draft, setDraft] = useState<{ latitude: string; longitude: string } | null>(null);
  const [draftLabel, setDraftLabel] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  /** Opening centre + zoom, captured when the picker opens so the map effect has no coordinate deps. */
  const openViewRef = useRef<{ centre: [number, number]; zoom: number }>({
    centre: [DEFAULT_CENTRE.latitude, DEFAULT_CENTRE.longitude],
    zoom: DEFAULT_ZOOM,
  });

  const generatedId = useId();
  const resultsId = `${generatedId}-results`;
  const titleId = `${generatedId}-title`;

  const parsedLatitude = parseCoordinate(latitude, 90);
  const parsedLongitude = parseCoordinate(longitude, 180);
  const hasLocation = parsedLatitude !== null && parsedLongitude !== null;

  // Kept in a ref so the map's own event handlers always report through the newest callback without
  // the map being torn down and rebuilt on every editor keystroke.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const teardownMap = useCallback(() => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  const closePicker = useCallback(() => {
    teardownMap();
    setOpen(false);
    setMapState("idle");
    setQuery("");
    setSearch({ kind: "idle" });
    // The map is gone; the return focus lands the creator back on the trigger.
    window.requestAnimationFrame(() => openButtonRef.current?.focus());
  }, [teardownMap]);

  function openPicker() {
    openViewRef.current =
      parsedLatitude !== null && parsedLongitude !== null
        ? { centre: [parsedLatitude, parsedLongitude], zoom: PLACED_ZOOM }
        : { centre: [DEFAULT_CENTRE.latitude, DEFAULT_CENTRE.longitude], zoom: DEFAULT_ZOOM };
    setDraft(
      hasLocation
        ? {
            latitude: formatCoordinate(parsedLatitude),
            longitude: formatCoordinate(parsedLongitude),
          }
        : null,
    );
    setDraftLabel(hasLocation ? selectedLabel : null);
    setOpen(true);
    setMapState("loading");
  }

  function confirmSelection() {
    if (!draft) return;
    onChangeRef.current(draft);
    setSelectedLabel(draftLabel);
    closePicker();
  }

  function clearLocation() {
    onChange({ latitude: "", longitude: "" });
    setSelectedLabel(null);
  }

  // Debounced place search. Runs whenever the field has enough text; harmless while the picker is
  // closed because the field is cleared on close.
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

  // Built as an effect rather than in the click handler so the canvas is committed to the DOM before
  // Leaflet measures it. The opening centre is read from a ref, so coordinates are deliberately not
  // dependencies: re-running would tear the map down mid-adjustment.
  useEffect(() => {
    if (!open || mapState !== "loading") return;
    let cancelled = false;

    void (async () => {
      try {
        // Leaflet ships a UMD build, so its factories sit on the interop default.
        const leafletModule = await import("leaflet");
        const leaflet = leafletModule.default ?? leafletModule;
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;

        const { centre, zoom } = openViewRef.current;
        const instance = leaflet
          .map(canvas, {
            fadeAnimation: !reducedMotion,
            markerZoomAnimation: !reducedMotion,
            // Inside the modal there is no page to hijack, so the wheel may zoom the map.
            scrollWheelZoom: true,
            touchZoom: true,
            zoomAnimation: !reducedMotion,
          })
          .setView(centre, zoom);

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

        const map = instance as unknown as LeafletMap;
        const readCentre = () => {
          const centrePoint = map.getCenter();
          setDraft({
            latitude: formatCoordinate(centrePoint.lat),
            longitude: formatCoordinate(centrePoint.lng),
          });
        };
        // The centre pin marks whatever is under it, so the draft is always the map centre.
        map.on("moveend", readCentre);
        // A manual drag means the pin no longer sits on the searched place.
        map.on("dragstart", () => setDraftLabel(null));
        // A tap re-centres on the tapped point instead of asking for a precise marker hit.
        map.on("click", (event) => {
          setDraftLabel(null);
          map.panTo([event.latlng.lat, event.latlng.lng], { animate: !reducedMotion });
        });

        mapRef.current = map;
        readCentre();
        setMapState("ready");
      } catch {
        if (!cancelled) setMapState("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, mapState, reducedMotion, tileKey]);

  // Focus management and keyboard contract for the modal: initial focus, Escape to cancel, and a
  // Tab trap, matching the creator dialog convention.
  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => searchInputRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, closePicker]);

  useEffect(() => () => teardownMap(), [teardownMap]);

  function chooseResult(result: VenueSearchResult) {
    setDraftLabel(result.label);
    setDraft({
      latitude: formatCoordinate(result.latitude),
      longitude: formatCoordinate(result.longitude),
    });
    setQuery("");
    setSearch({ kind: "idle" });
    mapRef.current?.setView([result.latitude, result.longitude], SEARCH_ZOOM, {
      animate: !reducedMotion,
    });
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
      <div className={styles.summaryHead}>
        <p className={styles.summaryLabel}>
          Venue location
          <span>Pin the exact spot guests will navigate to</span>
        </p>
      </div>

      <div className={styles.locationSummary} data-set={hasLocation || undefined}>
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

      <button className={styles.openButton} onClick={openPicker} ref={openButtonRef} type="button">
        {hasLocation ? "Adjust the pin on a map" : "Open map to set the location"}
      </button>

      {open
        ? createPortal(
            // Portalled to the document body so the full-screen picker escapes any transformed or
            // clipping ancestor in the editor and reliably covers the viewport.
            <div className={styles.backdrop}>
              <section
                aria-labelledby={titleId}
                aria-modal="true"
                className={styles.dialog}
                ref={dialogRef}
                role="dialog"
              >
                <style>{interactiveMapStyles}</style>
                <header className={styles.dialogHeader}>
                  <div>
                    <p className={styles.eyebrow}>Venue map</p>
                    <h2 className={styles.dialogTitle} id={titleId}>
                      {venueName ? `Pin ${venueName}` : "Pin the venue"}
                    </h2>
                  </div>
                  <button
                    aria-label="Close the map"
                    className={styles.dialogClose}
                    onClick={closePicker}
                    type="button"
                  >
                    <Close />
                  </button>
                </header>

                <div className={styles.searchField}>
                  <label htmlFor={`${idPrefix}-place-search`}>
                    <span className={styles.searchLabel}>Search for the venue</span>
                    {/*
                  A search box and a list of buttons, deliberately not a combobox/listbox: that
                  pattern obliges arrow-key navigation this control does not implement. Tab reaches
                  each result natively, and the live region below announces what happened.
                */}
                    <input
                      autoComplete="off"
                      id={`${idPrefix}-place-search`}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="San Agustin Church, Intramuros"
                      ref={searchInputRef}
                      type="search"
                      value={query}
                    />
                  </label>

                  <p aria-live="polite" className={styles.searchStatus}>
                    {search.kind === "searching" ? "Searching places…" : null}
                    {search.kind === "failed"
                      ? "Place search is unavailable. Aim the map instead."
                      : null}
                    {search.kind === "results" && search.results.length === 0
                      ? "No matching place. Try a nearby landmark, or aim the map."
                      : null}
                    {search.kind === "results" && search.results.length > 0
                      ? `${search.results.length} matching ${search.results.length === 1 ? "place" : "places"}. Choose one to move the pin.`
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
                </div>

                <div className={styles.mapArea}>
                  <div
                    aria-busy={mapState === "loading" || undefined}
                    aria-label={
                      venueName
                        ? `Map for ${venueName}. Drag to aim the pin.`
                        : "Map. Drag to aim the pin."
                    }
                    className={styles.canvas}
                    data-state={mapState}
                    ref={canvasRef}
                    role="application"
                  />
                  {mapState === "ready" ? (
                    <span aria-hidden="true" className={styles.centerPin}>
                      {/* Mirrors MAP_PIN_SVG in the renderer; classes match its themeable defaults. */}
                      <svg
                        aria-hidden="true"
                        className="im-pin-svg"
                        focusable="false"
                        viewBox="0 0 24 32"
                      >
                        <path
                          className="im-pin-body"
                          d="M12 .75C5.65.75.5 5.9.5 12.25.5 20.5 12 31.25 12 31.25S23.5 20.5 23.5 12.25C23.5 5.9 18.35.75 12 .75Z"
                        />
                        <circle className="im-pin-dot" cx="12" cy="12.25" r="4.25" />
                      </svg>
                    </span>
                  ) : null}
                  {mapState === "loading" || mapState === "failed" ? (
                    <p aria-atomic="true" className={styles.mapFeedback} role="status">
                      {mapState === "loading"
                        ? "Loading the interactive map…"
                        : "The map could not load. Search for the venue above instead."}
                    </p>
                  ) : null}
                </div>

                <footer className={styles.dialogFooter}>
                  <p aria-live="polite" className={styles.readout}>
                    {mapState === "ready" && draft ? (
                      <>
                        <strong>{draftLabel ?? "Pin position"}</strong>
                        <span>
                          {draft.latitude}, {draft.longitude}
                        </span>
                      </>
                    ) : mapState === "failed" ? (
                      <span>Map unavailable</span>
                    ) : (
                      <span>Preparing the map…</span>
                    )}
                  </p>
                  <div className={styles.dialogActions}>
                    <button className={styles.cancelButton} onClick={closePicker} type="button">
                      Cancel
                    </button>
                    <button
                      className={styles.confirmButton}
                      disabled={mapState !== "ready" || !draft}
                      onClick={confirmSelection}
                      type="button"
                    >
                      Use this location
                    </button>
                  </div>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
