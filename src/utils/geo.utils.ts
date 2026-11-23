export type PolygonCoordinate = [number, number]; // [lat, lng]

export function isPointInPolygon(
  pointLat: number,
  pointLng: number,
  polygon: PolygonCoordinate[],
): boolean {
  const n = polygon.length;

  if (n < 3) {
    return false;
  }

  let inside = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [iLat, iLng] = polygon[i];
    const [jLat, jLng] = polygon[j];

    const intersects =
      iLng > pointLng !== jLng > pointLng &&
      pointLat < ((jLat - iLat) * (pointLng - iLng)) / (jLng - iLng) + iLat;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

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
      return [];
    }
  }

  return result;
}
