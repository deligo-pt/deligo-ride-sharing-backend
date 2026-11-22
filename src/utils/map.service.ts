import axios from 'axios';
import { haversineKm } from '../modules/ride/pricing.service';
import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Map Service — Real-world routing via OSRM (public) or Mapbox (key-gated)
//
// Priority:
//   1. Mapbox Directions API   (if MAPBOX_ACCESS_TOKEN is set in env)
//   2. OSRM public demo server (free, no key required)
//   3. Haversine straight-line (fallback when both APIs are unavailable)
//
// Both getRouteData() (2 points) and getMultiStopRouteData() (N points) share
// the same underlying provider helpers — coordinates are joined with semicolons
// in "lng,lat" order as required by both OSRM and Mapbox.
// ─────────────────────────────────────────────────────────────────────────────

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteData {
  /** Total road-network distance in metres across all waypoints */
  distanceMeters: number;
  /** Total estimated travel time in seconds across all waypoints */
  durationSeconds: number;
  /** Encoded polyline string (geometry), if the provider returned one */
  polyline: string | null;
  /** Which data source was used */
  source: 'mapbox' | 'osrm' | 'haversine_fallback';
}

// ── Internal coordinate serialiser ────────────────────────────────────────────

/** Converts an array of {lat,lng} pairs to OSRM/Mapbox waypoint string. */
function toWaypointString(coords: Coordinate[]): string {
  return coords.map((c) => `${c.lng},${c.lat}`).join(';');
}

// ── OSRM public demo ──────────────────────────────────────────────────────────

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

async function getRouteFromOSRM(coords: Coordinate[]): Promise<RouteData> {
  const url = `${OSRM_BASE}/${toWaypointString(coords)}`;

  const response = await axios.get<{
    code: string;
    routes: Array<{
      distance: number;
      duration: number;
      geometry?: string;
    }>;
  }>(url, {
    params: {
      overview: 'simplified',
      geometries: 'polyline',
    },
    timeout: 6_000,
  });

  if (response.data.code !== 'Ok' || !response.data.routes.length) {
    throw new Error(`OSRM returned non-OK code: ${response.data.code}`);
  }

  const route = response.data.routes[0];

  return {
    distanceMeters:  route.distance,
    durationSeconds: route.duration,
    polyline:        route.geometry ?? null,
    source:          'osrm',
  };
}

// ── Mapbox Directions API ─────────────────────────────────────────────────────

const MAPBOX_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

async function getRouteFromMapbox(
  coords: Coordinate[],
  accessToken: string,
): Promise<RouteData> {
  const url = `${MAPBOX_BASE}/${toWaypointString(coords)}`;

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
    distanceMeters:  route.distance,
    durationSeconds: route.duration,
    polyline,
    source: 'mapbox',
  };
}

// ── Haversine fallback ────────────────────────────────────────────────────────

/**
 * Chains pairwise Haversine segments to produce cumulative distance and
 * duration across an arbitrary number of waypoints.
 *
 * Adds a 1.35× road-distance factor; assumes 30 km/h average speed.
 */
function haversineFallback(coords: Coordinate[]): RouteData {
  let totalMeters = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const { lat: lat1, lng: lng1 } = coords[i];
    const { lat: lat2, lng: lng2 } = coords[i + 1];
    const straightKm = haversineKm(lat1, lng1, lat2, lng2);
    totalMeters += straightKm * 1.35 * 1_000;
  }

  const durationSeconds = (totalMeters / 1_000 / 30) * 3_600;

  return {
    distanceMeters:  totalMeters,
    durationSeconds,
    polyline:        null,
    source:          'haversine_fallback',
  };
}

// ── Public entry point: N-waypoint routing ────────────────────────────────────

/**
 * Fetch real-world route data for an ordered array of coordinates (≥ 2 points).
 *
 * Returns a single RouteData whose distanceMeters and durationSeconds are
 * cumulative across the full itinerary (pickup → stop1 → stop2 → dropoff).
 *
 * Tries Mapbox → OSRM → Haversine. Never throws.
 */
export async function getMultiStopRouteData(
  coordinates: Coordinate[],
): Promise<RouteData> {
  if (coordinates.length < 2) {
    throw new Error('getMultiStopRouteData requires at least 2 coordinates.');
  }

  const mapboxToken = config.mapbox.accessToken;

  if (mapboxToken) {
    try {
      return await getRouteFromMapbox(coordinates, mapboxToken);
    } catch (err) {
      console.warn('[MapService] Mapbox failed, falling back to OSRM:', (err as Error).message);
    }
  }

  try {
    return await getRouteFromOSRM(coordinates);
  } catch (err) {
    console.warn('[MapService] OSRM failed, falling back to Haversine:', (err as Error).message);
  }

  console.warn('[MapService] Using Haversine fallback for multi-stop route.');
  return haversineFallback(coordinates);
}

// ── Backward-compatible 2-point shortcut ──────────────────────────────────────

/**
 * Fetch real-world route data for a pickup → dropoff pair.
 *
 * Delegates to getMultiStopRouteData internally. Kept for existing call sites.
 */
export async function getRouteData(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<RouteData> {
  return getMultiStopRouteData([
    { lat: startLat, lng: startLng },
    { lat: endLat,   lng: endLng   },
  ]);
}
