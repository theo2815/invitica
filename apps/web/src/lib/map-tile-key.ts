/**
 * Client-exposed, domain-restricted MapTiler key for the guest venue map (ADR-006). Next inlines
 * the value at build time, so creator previews render the same map guests will see. When it is not
 * configured the renderer simply keeps the venue's directions link.
 */
export function getMapTileKey(): string {
  return process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";
}
