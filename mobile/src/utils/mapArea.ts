/**
 * Map area helpers: the Map tab loads only the tests inside the area on screen
 * (plus a margin around it), instead of the newest tests from anywhere.
 */

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Most tests the Map asks the server for in one area. */
export const MAP_TEST_LIMIT = 1000;

/** True when `inner` lies completely inside `outer`. */
export function boundsContain(outer: MapBounds, inner: MapBounds): boolean {
  return (
    inner.minLat >= outer.minLat &&
    inner.maxLat <= outer.maxLat &&
    inner.minLng >= outer.minLng &&
    inner.maxLng <= outer.maxLng
  );
}

/** Reads a bounds object sent by the map page; null when anything is missing or not a number. */
export function parseBounds(value: any): MapBounds | null {
  if (!value) return null;
  const keys: (keyof MapBounds)[] = ['minLat', 'maxLat', 'minLng', 'maxLng'];
  if (
    !keys.every(k => typeof value[k] === 'number' && Number.isFinite(value[k]))
  )
    return null;
  if (value.minLat > value.maxLat || value.minLng > value.maxLng) return null;
  return {
    minLat: value.minLat,
    maxLat: value.maxLat,
    minLng: value.minLng,
    maxLng: value.maxLng,
  };
}

/** Query parameters for /v1/crowdsource/map. Without bounds it falls back to the newest tests anywhere. */
export function mapQueryParams(
  filters: { operator: string; technology: string; metric: string },
  bounds: MapBounds | null,
): Record<string, string> {
  const params: Record<string, string> = {
    ...filters,
    limit: String(MAP_TEST_LIMIT),
  };
  if (bounds) {
    params.minLat = bounds.minLat.toFixed(5);
    params.maxLat = bounds.maxLat.toFixed(5);
    params.minLng = bounds.minLng.toFixed(5);
    params.maxLng = bounds.maxLng.toFixed(5);
  }
  return params;
}

/**
 * Whether the visible area needs a new server request. Not needed when the same filters were
 * already loaded for a larger area that contains it and that load was complete (under the limit);
 * a load that hit the limit may be missing tests, so zooming in asks again.
 */
export function needsMapFetch(
  last: { key: string; bounds: MapBounds; complete: boolean } | null,
  filterKey: string,
  visible: MapBounds,
): boolean {
  if (!last || last.key !== filterKey) return true;
  return !(last.complete && boundsContain(last.bounds, visible));
}
