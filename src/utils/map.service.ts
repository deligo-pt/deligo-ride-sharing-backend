import axios from 'axios';
import { haversineKm } from '../domains/rides/pricing.service';

// ─────────────────────────────────────────────────────────────────────────────
// Map Service — Real-world routing via OSRM (public) or Mapbox (key-gated)
//
// Priority:
//   1. Mapbox Directions API   (if MAPBOX_ACCESS_TOKEN is set in env)
//   2. OSRM public demo server (free, no key required)
//   3. Haversine straight-line (fallback when both APIs are unavailable)
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteData {
  /** Metres from pickup to dropoff via actual road network */
  distanceMeters: number;
  /** Seconds estimated travel time (traffic-naive unless Mapbox with traffic) */
  durationSeconds: number;
  /** Encoded polyline string (geometry), if the provider returned one */
  polyline: string | null;
  /** Which data source was used */
  source: 'mapbox' | 'osrm' | 'haversine_fallback';
}

// ── OSRM public demo ──────────────────────────────────────────────────────────

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

async function getRouteFromOSRM(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<RouteData> {
  const url = `${OSRM_BASE}/${startLng},${startLat};${endLng},${endLat}`;

  const response = await axios.get<{
    code: string;
    routes: Array<{
      distance: number;
      duration: number;
      geometry?: string;
    }>;
  }>(url, {
    params: {
      overview: 'simplified',  // include compressed polyline
      geometries: 'polyline',  // encoded polyline format
    },
    timeout: 6_000, // 6 s — OSRM demo can be slow
  });

  if (response.data.code !== 'Ok' || !response.data.routes.length) {
    throw new Error(`OSRM returned non-OK code: ${response.data.code}`);
  }

  const route = response.data.routes[0];

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    polyline: route.geometry ?? null,
    source: 'osrm',
  };
}

// ── Mapbox Directions API ─────────────────────────────────────────────────────

const MAPBOX_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

async function getRouteFromMapbox(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  accessToken: string,
): Promise<RouteData> {
  const url = `${MAPBOX_BASE}/${startLng},${startLat};${endLng},${endLat}`;

  const response = await axios.get<{
    code: string;
    routes: Array<{
      distance: number;
      duration: number;
      geometry?: { coordinates: number[][] } | string;
    }>;
  }>(url, {
    params: {
      access_token: accessToken,
      overview: 'simplified',
      geometries: 'polyline',
    },
    timeout: 6_000,
  });

  if (response.data.code !== 'Ok' || !response.data.routes.length) {
    throw new Error(`Mapbox returned non-OK code: ${response.data.code}`);
  }

  const route = response.data.routes[0];
  const polyline =
    typeof route.geometry === 'string' ? route.geometry : null;

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    polyline,
    source: 'mapbox',
  };
}

// ── Haversine fallback ────────────────────────────────────────────────────────

/**
 * Build a synthetic RouteData from a straight-line Haversine distance.
 *
 * Adds a 1.35× road-distance factor and assumes 30 km/h average speed.
 * This is intentionally conservative so the estimate errs on the side of
 * being slightly higher than actual.
 */
function haversineFallback(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): RouteData {
  const straightKm = haversineKm(startLat, startLng, endLat, endLng);
  // Apply a road-factor to approximate actual driving distance
  const estimatedRoadKm = straightKm * 1.35;
  const distanceMeters = estimatedRoadKm * 1_000;
  // Assume 30 km/h average speed
  const durationSeconds = (estimatedRoadKm / 30) * 3_600;

  return {
    distanceMeters,
    durationSeconds,
    polyline: null,
    source: 'haversine_fallback',
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Fetch real-world route data for a pickup → dropoff pair.
 *
 * Tries Mapbox (if token present), then OSRM, then falls back to Haversine.
 * Never throws — callers always receive a RouteData object.
 */
export async function getRouteData(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<RouteData> {
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;

  // 1. Try Mapbox if configured
  if (mapboxToken) {
    try {
      return await getRouteFromMapbox(startLat, startLng, endLat, endLng, mapboxToken);
    } catch (err) {
      console.warn('[MapService] Mapbox failed, falling back to OSRM:', (err as Error).message);
    }
  }

  // 2. Try OSRM public demo
  try {
    return await getRouteFromOSRM(startLat, startLng, endLat, endLng);
  } catch (err) {
    console.warn('[MapService] OSRM failed, falling back to Haversine:', (err as Error).message);
  }

  // 3. Haversine fallback — always succeeds
  console.warn('[MapService] Using Haversine fallback for route calculation.');
  return haversineFallback(startLat, startLng, endLat, endLng);
}
