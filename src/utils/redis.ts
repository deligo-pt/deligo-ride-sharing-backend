import Redis from 'ioredis';
import { config } from '../config';

const redis = new Redis(config.redis.url, {
  lazyConnect: false,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err: Error) => {
  console.error('❌ Redis connection error:', err.message);
});

const ACTIVE_DRIVERS_KEY = 'active_drivers';
const DRIVER_TTL_SECONDS = 300; // 5 minutes

export const LocationService = {
  async updateDriverLocation(driverId: string, lng: number, lat: number): Promise<void> {
    await redis.geoadd(ACTIVE_DRIVERS_KEY, lng, lat, driverId);
    await redis.expire(ACTIVE_DRIVERS_KEY, DRIVER_TTL_SECONDS);
  },

  async findNearbyDrivers(lng: number, lat: number, radiusInKm: number = 5): Promise<string[]> {
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

    return results as string[];
  },
};

export default redis;

export { redis };
