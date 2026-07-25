"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * MapTiler raster style used for guest venue maps. Raster tiles load as plain `<img>` elements, so
 * the published Viewer only has to allow `https://api.maptiler.com` in `img-src` (ADR-006).
 */
const MAPTILER_STYLE = "basic-v2";
const DEFAULT_ZOOM = 16;
const MAX_ZOOM = 19;
const MIN_ZOOM = 3;

/** Required by both the MapTiler terms and the ODbL licence covering OpenStreetMap data. */
export const MAP_ATTRIBUTION =
  '<a href="https://www.maptiler.com/" target="_blank" rel="noreferrer">MapTiler</a> | &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>';

/**
 * Tile template for the client-exposed, domain-restricted MapTiler key. The key rides in the tile
 * URL by design; it is supplied at render time and never written into a publication snapshot.
 */
export function buildMapTileUrl(tileKey: string): string {
  return `https://api.maptiler.com/maps/${MAPTILER_STYLE}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(tileKey)}`;
}

export interface InteractiveMapProps {
  latitude: number;
  longitude: number;
  /** Venue name, used for the accessible map label. */
  label: string;
  reducedMotion?: boolean;
  tileKey: string;
}

type MapState = "idle" | "loading" | "ready" | "failed";

const TOGGLE_LABEL: Record<MapState, string> = {
  idle: "Show map",
  loading: "Loading map",
  ready: "Hide map",
  failed: "Try the map again",
};

/**
 * Click-to-load venue map shared by every invitation family (ADR-006). Nothing is fetched until the
 * guest asks for it: Leaflet is dynamic-imported on the first tap so it stays out of the initial
 * guest bundle, and no tile request — and therefore no guest IP — reaches MapTiler otherwise. The
 * control only appears after hydration, so guests without JavaScript are never shown an inert
 * button and keep the directions link the template renders alongside it.
 */
export function InteractiveMap({
  label,
  latitude,
  longitude,
  reducedMotion = false,
  tileKey,
}: InteractiveMapProps) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<MapState>("idle");
  const canvasRef = useRef<HTMLElement>(null);
  const mapRef = useRef<{ remove: () => void } | null>(null);
  const panelId = useId();

  useEffect(() => setHydrated(true), []);

  // Loading runs as an effect rather than inside the click handler so the canvas is guaranteed to be
  // committed to the DOM before Leaflet measures it.
  useEffect(() => {
    if (state !== "loading") return;

    let cancelled = false;
    void (async () => {
      try {
        // Leaflet ships a UMD build, so bundlers expose its factories on the interop default
        // rather than as statically analyzable named exports.
        const leafletModule = await import("leaflet");
        const leaflet = leafletModule.default ?? leafletModule;
        const { circleMarker, map: createMap, tileLayer } = leaflet;
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;

        const instance = createMap(canvas, {
          fadeAnimation: !reducedMotion,
          markerZoomAnimation: !reducedMotion,
          // The map sits inside a scrolling invitation; wheel zoom would hijack the page.
          scrollWheelZoom: false,
          // Two-finger pinch zoom, stated rather than inherited: Leaflet's default is its own
          // `Browser.touch` heuristic, and guests on this map are expected to pinch.
          touchZoom: true,
          zoomAnimation: !reducedMotion,
        }).setView([latitude, longitude], DEFAULT_ZOOM);

        // Leaflet's stock prefix carries a flag emoji, which does not belong on an invitation.
        instance.attributionControl.setPrefix(
          '<a href="https://leafletjs.com/" target="_blank" rel="noreferrer">Leaflet</a>',
        );

        tileLayer(buildMapTileUrl(tileKey), {
          attribution: MAP_ATTRIBUTION,
          maxZoom: MAX_ZOOM,
          minZoom: MIN_ZOOM,
          tileSize: 512,
          zoomOffset: -1,
        }).addTo(instance);

        // A circle marker is drawn as SVG, so the map needs no marker image asset and stays
        // themeable from the template stylesheet.
        circleMarker([latitude, longitude], {
          className: "im-marker",
          interactive: false,
          radius: 9,
        }).addTo(instance);

        mapRef.current = instance;
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [label, latitude, longitude, reducedMotion, state, tileKey]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  function toggle() {
    if (state === "loading") return;
    if (state === "ready") {
      mapRef.current?.remove();
      mapRef.current = null;
      setState("idle");
      return;
    }
    setState("loading");
  }

  if (!hydrated) return null;

  return (
    <div className="im-map">
      <button
        aria-controls={panelId}
        aria-expanded={state !== "idle"}
        className="im-toggle"
        onClick={toggle}
        type="button"
      >
        {TOGGLE_LABEL[state]}
      </button>
      {state === "idle" ? null : (
        <div className="im-panel" id={panelId}>
          <section
            aria-label={`Map of ${label}`}
            className="im-canvas"
            data-state={state}
            ref={canvasRef}
          />
          {state === "ready" ? (
            <p className="im-notice im-hint">
              Drag to move the map, or pinch with two fingers to zoom.
            </p>
          ) : null}
          {state === "failed" ? (
            <p className="im-notice" role="status">
              The map could not load. Use “Get directions” instead.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Layout rules Leaflet needs to position its panes, tiles, and controls, adapted from Leaflet's own
 * stylesheet (BSD-2-Clause, © Volodymyr Agafonkin) so the published Viewer never has to load a
 * third-party stylesheet under its strict CSP. Appearance is left to the template: only structural
 * rules and neutral defaults live here.
 */
export const interactiveMapStyles = `
.im-map { display: grid; justify-items: center; gap: 0.7rem; margin-top: 0.7rem; }
.im-panel { width: 100%; }
.im-canvas { height: 15rem; }
.im-notice { margin: 0.6rem 0 0; font-size: 0.8rem; }
.im-hint { font-size: 0.72rem; }

.leaflet-pane,
.leaflet-tile,
.leaflet-marker-icon,
.leaflet-marker-shadow,
.leaflet-tile-container,
.leaflet-pane > svg,
.leaflet-pane > canvas,
.leaflet-zoom-box,
.leaflet-image-layer,
.leaflet-layer { position: absolute; top: 0; left: 0; }
.leaflet-container { overflow: hidden; background: #e7e2e4; -webkit-tap-highlight-color: transparent; }
.leaflet-tile,
.leaflet-marker-icon,
.leaflet-marker-shadow { user-select: none; -webkit-user-drag: none; }
.leaflet-tile::selection { background: transparent; }
.leaflet-container .leaflet-overlay-pane svg { max-width: none !important; max-height: none !important; }
.leaflet-container .leaflet-tile-pane img,
.leaflet-container .leaflet-tile { max-width: none !important; max-height: none !important; width: auto; padding: 0; }
.leaflet-container img.leaflet-tile { mix-blend-mode: plus-lighter; }
.leaflet-container.leaflet-touch-zoom { touch-action: pan-x pan-y; }
.leaflet-container.leaflet-touch-drag { touch-action: none; touch-action: pinch-zoom; }
.leaflet-container.leaflet-touch-drag.leaflet-touch-zoom { touch-action: none; }
.leaflet-tile { visibility: hidden; filter: inherit; }
.leaflet-tile-loaded { visibility: inherit; }
.leaflet-zoom-box { z-index: 800; box-sizing: border-box; width: 0; height: 0; }
.leaflet-pane { z-index: 400; }
.leaflet-tile-pane { z-index: 200; }
.leaflet-overlay-pane { z-index: 400; }
.leaflet-shadow-pane { z-index: 500; }
.leaflet-marker-pane { z-index: 600; }
.leaflet-tooltip-pane { z-index: 650; }
.leaflet-popup-pane { z-index: 700; }
.leaflet-map-pane canvas { z-index: 100; }
.leaflet-map-pane svg { z-index: 200; }
.leaflet-control { position: relative; z-index: 800; float: left; clear: both; pointer-events: auto; cursor: auto; }
.leaflet-top,
.leaflet-bottom { position: absolute; z-index: 1000; pointer-events: none; }
.leaflet-top { top: 0; }
.leaflet-bottom { bottom: 0; }
.leaflet-left { left: 0; }
.leaflet-right { right: 0; }
.leaflet-right .leaflet-control { float: right; }
.leaflet-top .leaflet-control { margin-top: 0.6rem; }
.leaflet-bottom .leaflet-control { margin-bottom: 0.6rem; }
.leaflet-left .leaflet-control { margin-left: 0.6rem; }
.leaflet-right .leaflet-control { margin-right: 0.6rem; }
.leaflet-zoom-animated { transform-origin: 0 0; }
.leaflet-zoom-anim .leaflet-zoom-animated { transition: transform 0.25s cubic-bezier(0, 0, 0.25, 1); }
.leaflet-zoom-anim .leaflet-tile,
.leaflet-pan-anim .leaflet-tile { transition: none; }
.leaflet-zoom-anim .leaflet-zoom-hide { visibility: hidden; }
.leaflet-grab { cursor: grab; }
.leaflet-dragging .leaflet-grab,
.leaflet-dragging .leaflet-grab .leaflet-interactive { cursor: grabbing; }
.leaflet-marker-icon,
.leaflet-marker-shadow,
.leaflet-image-layer,
.leaflet-pane > svg path,
.leaflet-tile-container { pointer-events: none; }
.leaflet-control-attribution { padding: 0 0.4rem; font-size: 0.62rem; line-height: 1.6; }
.leaflet-control-attribution a { text-decoration: underline; }
.leaflet-bar { overflow: hidden; border-radius: 0.4rem; }
.leaflet-bar a {
  display: block;
  width: 2.5rem;
  height: 2.5rem;
  border-bottom: 1px solid rgb(0 0 0 / 12%);
  font-size: 1.1rem;
  font-weight: 620;
  line-height: 2.5rem;
  text-align: center;
  text-decoration: none;
}
.leaflet-bar a:last-child { border-bottom: 0; }
.leaflet-bar a.leaflet-disabled { cursor: default; opacity: 0.45; }
.leaflet-container:focus-visible,
.leaflet-bar a:focus-visible { outline: 3px solid currentcolor; outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  .leaflet-zoom-anim .leaflet-zoom-animated { transition: none; }
}
`;
