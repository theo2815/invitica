import { z } from "zod";

/**
 * Place search for the creator's venue picker, using MapTiler's geocoding API on the
 * same browser-exposed, domain-restricted key as the guest map (ADR-006).
 *
 * Creator-side only. A guest never searches — the published invitation carries finished
 * coordinates — so the Viewer's strict CSP is untouched by this and no snapshot ever
 * contains a key or a query.
 */
const MAX_RESULTS = 5;

/**
 * Loose rather than strict: the API returns many fields beyond the four used here, and
 * a provider adding one must not break venue search. Coordinate bounds are checked
 * because an out-of-range pair would be written into an invitation document.
 */
const geocodeFeatureSchema = z.object({
  center: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  place_name: z.string().min(1),
  place_type: z.array(z.string()).optional(),
  text: z.string().optional(),
});

const geocodeResponseSchema = z.object({ features: z.array(geocodeFeatureSchema).default([]) });

export interface VenueSearchResult {
  readonly label: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
}

export class VenueSearchUnavailableError extends Error {
  constructor() {
    super("Place search is unavailable.");
    this.name = "VenueSearchUnavailableError";
  }
}

/**
 * Searches for a place, biased to the Philippines because that is the launch market.
 * `signal` lets the caller drop a superseded keystroke's request.
 */
export async function searchVenueLocations(
  query: string,
  tileKey: string,
  signal?: AbortSignal,
): Promise<VenueSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed || !tileKey) return [];

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(trimmed)}.json`);
  url.searchParams.set("key", tileKey);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("country", "ph");
  url.searchParams.set("limit", String(MAX_RESULTS));

  const response = signal ? await fetch(url, { signal }) : await fetch(url);
  if (!response.ok) throw new VenueSearchUnavailableError();

  const parsed = geocodeResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new VenueSearchUnavailableError();

  return parsed.data.features.map((feature) => ({
    label: feature.place_name,
    latitude: feature.center[1],
    longitude: feature.center[0],
    name: feature.text ?? feature.place_name,
  }));
}

/** Rounded for display and storage; ~1 cm of precision is far past a venue's needs. */
export function formatCoordinate(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, "");
}
