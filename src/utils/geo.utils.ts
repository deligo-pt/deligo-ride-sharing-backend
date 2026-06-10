// ─────────────────────────────────────────────────────────────────────────────
// Geospatial Utilities
//
// Pure, dependency-free geometric helpers used by the pricing engine and
// any future geofencing checks (e.g. restricted zones, airport surcharges).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single vertex of a geofence polygon, stored as [latitude, longitude].
 */
export type PolygonCoordinate = [number, number]; // [lat, lng]

/**
 * Determine whether a geographic point lies inside a polygon using the
 * **Ray-Casting algorithm** (Jordan curve theorem).
 *
 * The algorithm fires an imaginary horizontal ray from the test point toward
 * +∞ and counts how many polygon edges it crosses. An odd count means the
 * point is inside; an even count means outside. Edge and vertex cases are
 * handled correctly by the standard half-open interval approach.
 *
 * @param pointLat  Latitude of the point to test
 * @param pointLng  Longitude of the point to test
 * @param polygon   Array of [lat, lng] vertices defining a closed polygon.
 *                  The polygon does NOT need to repeat the first vertex at the end.
 * @returns         `true` if the point is inside the polygon, `false` otherwise.
 *
 * @example
 * const airportPolygon: PolygonCoordinate[] = [
 *   [40.6413, -73.7781],
 *   [40.6413, -73.7563],
 *   [40.6195, -73.7563],
 *   [40.6195, -73.7781],
 * ];
 * isPointInPolygon(40.6300, -73.7680, airportPolygon); // true
 */
export function isPointInPolygon(
  pointLat: number,
  pointLng: number,
  polygon: PolygonCoordinate[],
): boolean {
  const n = polygon.length;

  if (n < 3) {
    // A polygon needs at least 3 vertices
    return false;
  }

  let inside = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [iLat, iLng] = polygon[i];
    const [jLat, jLng] = polygon[j];

    // Check if the horizontal ray from (pointLat, pointLng) crosses
    // the edge between vertex i and vertex j.
    const intersects =
      iLng > pointLng !== jLng > pointLng &&                     // edge straddles the ray
      pointLat < ((jLat - iLat) * (pointLng - iLng)) / (jLng - iLng) + iLat; // ray is below the edge

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Parse a raw JSON value from Prisma (which stores the polygon as Json) into
 * a typed PolygonCoordinate array. Returns an empty array on malformed input
 * so callers can safely skip invalid zones.
 */
export function parsePolygon(raw: unknown): PolygonCoordinate[] {
  if (!Array.isArray(raw)) return [];

  const result: PolygonCoordinate[] = [];

  for (const vertex of raw) {
    if (
      Array.isArray(vertex) &&
      vertex.length >= 2 &&
      typeof vertex[0] === 'number' &&
      typeof vertex[1] === 'number'
    ) {
      result.push([vertex[0], vertex[1]]);
    } else {
      // Malformed vertex — skip the entire polygon to be safe
      return [];
    }
  }

  return result;
}
