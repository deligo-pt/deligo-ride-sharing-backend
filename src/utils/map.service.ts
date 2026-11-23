import axios from 'axios';
import { PricingService } from '../modules/ride/pricing.service';
import { config } from '../config';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteData {
  distanceMeters: number;
  durationSeconds: number;
  polyline: string | null;
  source: 'mapbox' | 'osrm' | 'haversine_fallback';
}

function toWaypointString(coords: Coordinate[]): string {
  return coords.map((c) => `${c.lng},${c.lat}`).join(';');
}

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
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    polyline: route.geometry ?? null,
    source: 'osrm',
  };
}

const MAPBOX_BASE = 'https://api.mapbox.com/directions/v5/mapbox/driving';

async function getRouteFromMapbox(coords: Coordinate[], accessToken: string): Promise<RouteData> {
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
  const polyline = typeof route.geometry === 'string' ? route.geometry : null;

  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    polyline,
    source: 'mapbox',
  };
}

function haversineFallback(coords: Coordinate[]): RouteData {
  let totalMeters = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const { lat: lat1, lng: lng1 } = coords[i];
    const { lat: lat2, lng: lng2 } = coords[i + 1];
    const straightKm = PricingService.haversineKm(lat1, lng1, lat2, lng2);
    totalMeters += straightKm * 1.35 * 1_000;
  }

  const durationSeconds = (totalMeters / 1_000 / 30) * 3_600;

  return {
    distanceMeters: totalMeters,
    durationSeconds,
    polyline: null,
    source: 'haversine_fallback',
  };
}

export async function getMultiStopRouteData(coordinates: Coordinate[]): Promise<RouteData> {
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

export async function getRouteData(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
): Promise<RouteData> {
  return getMultiStopRouteData([
    { lat: startLat, lng: startLng },
    { lat: endLat, lng: endLng },
  ]);
}
