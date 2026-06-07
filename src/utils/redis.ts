import Redis from 'ioredis';
import { env } from '../config/env';

// ─────────────────────────────────────────────────────────────────────────────
// Redis Client Singleton
//
// A single shared ioredis client for the entire application lifecycle.
// lazyConnect: true prevents connection attempts until the first command,
// which keeps test environments from failing if Redis is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

const redis = new Redis(env.REDIS_URL, {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err: Error) => {
  console.error('❌ Redis connection error:', err.message);
});

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_DRIVERS_KEY = 'active_drivers';
/** Seconds before an inactive driver is evicted from the geo-set */
const DRIVER_TTL_SECONDS = 300; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// LocationService
// ─────────────────────────────────────────────────────────────────────────────

export const LocationService = {
  /**
   * Upsert a driver's geospatial coordinates in Redis.
   *
   * Uses GEOADD to store (or update) the driver's lat/lng under the
   * `active_drivers` sorted set, then resets the key's TTL to 5 minutes so
   * drivers who stop sending updates are automatically evicted.
   */
  async updateDriverLocation(driverId: string, lng: number, lat: number): Promise<void> {
    await redis.geoadd(ACTIVE_DRIVERS_KEY, lng, lat, driverId);
    await redis.expire(ACTIVE_DRIVERS_KEY, DRIVER_TTL_SECONDS);
  },

  /**
   * Find all drivers within a given radius of a pickup point.
   *
   * Uses GEOSEARCH (Redis ≥ 6.2) with FROMLONLAT + BYRADIUS semantics.
   * Returns an array of driver userId strings.
   *
   * @param lng          Pickup longitude
   * @param lat          Pickup latitude
   * @param radiusInKm   Search radius (default 5 km)
   */
  async findNearbyDrivers(lng: number, lat: number, radiusInKm: number = 5): Promise<string[]> {
    // GEOSEARCH key FROMLONLAT lng lat BYRADIUS radius km ASC
    const results = await redis.geosearch(
      ACTIVE_DRIVERS_KEY,
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusInKm,
      'km',
      'ASC',
    );

    // results is string[] when no WITHCOORD / WITHDIST flags are passed
    return results as string[];
  },
};

export default redis;

// Named export so callers can do: import { redis } from '../../utils/redis'
export { redis };
