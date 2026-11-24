import prisma from '../src/config/db';
import Redis from 'ioredis';
import { env } from '../src/config/env';

const redis = new Redis(env.REDIS_URL || 'redis://localhost:6379');

async function main() {
  console.log('Fetching all driver profiles...');
  const drivers = await prisma.driverProfile.findMany();

  if (drivers.length === 0) {
    console.log('No drivers found to update.');
    return;
  }

  console.log(`Found ${drivers.length} drivers. Updating locations in DB and Redis...`);

  for (const driver of drivers) {
    const lat = 23.8103 + (Math.random() * 0.04 - 0.02);
    const lng = 90.4125 + (Math.random() * 0.04 - 0.02);

    await prisma.driverProfile.update({
      where: { id: driver.id },
      data: {
        currentLatitude: lat,
        currentLongitude: lng,
      },
    });

    await redis.geoadd('active_drivers', lng, lat, driver.userId);

    console.log(`✅ Updated Driver ${driver.id} -> Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`);
  }

  console.log('\n🎉 Successfully updated all driver locations!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Update failed:', err);
  process.exit(1);
});
