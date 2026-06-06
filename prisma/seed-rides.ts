import prisma from '../src/config/db';
import { VehicleClass, VehicleType } from '@prisma/client';
import Redis from 'ioredis';
import { env } from '../src/config/env';

const redis = new Redis(env.REDIS_URL || 'redis://localhost:6379');

async function main() {
  console.log('🧹 Clearing old active_drivers in Redis...');
  await redis.del('active_drivers');

  console.log('🚗 Creating 10 dummy Drivers...');
  for (let i = 1; i <= 10; i++) {
    const user = await prisma.user.create({
      data: {
        email: `driver${i}_${Date.now()}@example.com`, // using timestamp to avoid unique constraint issues if run multiple times
        phone: `+88017${Date.now().toString().slice(-8)}${i.toString().padStart(2, '0')}`,
        firstName: `DemoDriver`,
        lastName: `${i}`,
        role: 'DRIVER',
        driverProfile: {
          create: {
            licenseNumber: `LIC-D-${Date.now()}-${i}`,
            licenseExpiresAt: new Date('2030-01-01'),
            isAvailable: true,
            averageRating: parseFloat((4.0 + (i % 10) * 0.1).toFixed(1)),
            document: {
              create: {
                drivingLicenseUrl: 'https://example.com/doc.jpg',
                nationalIdUrl: 'https://example.com/doc.jpg',
                vehicleRegistrationUrl: 'https://example.com/doc.jpg',
                vehicleInsuranceUrl: 'https://example.com/doc.jpg',
                driverSelfieUrl: 'https://example.com/doc.jpg',
                proofOfAddressUrl: 'https://example.com/doc.jpg',
                taxIdUrl: 'https://example.com/doc.jpg',
                verificationStatus: 'APPROVED'
              }
            },
            vehicle: {
              create: {
                vehicleClass: 'ECONOMY',
                vehicleType: 'Hatchback',
                brand: 'Toyota',
                model: 'Prius',
                year: 2020,
                color: 'White',
                licensePlate: `DHA-11-${Date.now().toString().slice(-4)}${i}`,
                approvalStatus: 'APPROVED'
              }
            }
          }
        }
      },
      include: { driverProfile: true }
    });

    console.log(`✅ Created Driver ${i} (UserID: ${user.id})`);

    // Seed location around Dhaka (23.8103, 90.4125)
    // +/- 0.02 is roughly ~2km radius
    const lat = 23.8103 + (Math.random() * 0.04 - 0.02);
    const lng = 90.4125 + (Math.random() * 0.04 - 0.02);
    
    await redis.geoadd('active_drivers', lng, lat, user.id);
  }

  console.log('\n🧑 Creating 3 dummy Customers...');
  for (let i = 1; i <= 3; i++) {
    const user = await prisma.user.create({
      data: {
        email: `customer${i}_${Date.now()}@example.com`,
        phone: `+88018${Date.now().toString().slice(-8)}${i.toString().padStart(2, '0')}`,
        firstName: `DemoCustomer`,
        lastName: `${i}`,
        role: 'CUSTOMER',
        customerProfile: {
          create: {}
        }
      }
    });
    console.log(`✅ Created Customer ${i} (UserID: ${user.id})`);
  }

  console.log('\n🎉 Seeding completed successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
