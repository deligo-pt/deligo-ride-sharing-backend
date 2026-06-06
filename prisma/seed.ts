import 'dotenv/config';
import { PrismaClient, UserRole, UserStatus, AccessLabel, VehicleClass, VehicleType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data to avoid conflicts
  await prisma.ride.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.driverProfile.deleteMany({});
  await prisma.customerProfile.deleteMany({});
  await prisma.adminProfile.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('🗑️  Existing data cleared.');

  // 1. Create CUSTOMER
  const customerUser = await prisma.user.create({
    data: {
      email: 'customer@example.com',
      phone: '+15550001111',
      firstName: 'Jane',
      lastName: 'Customer',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      customerProfile: {
        create: {
          homeAddress: '123 Main Street, New York, NY',
          workAddress: '456 Business Rd, New York, NY',
          emergencyContactNumber: '+15559998888',
        },
      },
      wallet: {
        create: {
          balance: 100.0,
          currency: 'USD',
        },
      },
    },
    include: {
      customerProfile: true,
    },
  });

  console.log('👤 Customer seeded successfully.');

  // 2. Create DRIVER
  const driverUser = await prisma.user.create({
    data: {
      email: 'driver@example.com',
      phone: '+15550002222',
      firstName: 'John',
      lastName: 'Driver',
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
      driverProfile: {
        create: {
          licenseNumber: 'DL-987654321',
          licenseExpiresAt: new Date('2030-12-31'),
          isAvailable: true,
          currentLatitude: 40.7128,
          currentLongitude: -74.006,
          vehicle: {
            create: {
              vehicleClass: VehicleClass.ECONOMY,
              vehicleType: VehicleType.Sedan,
              brand: 'Toyota',
              model: 'Camry',
              year: 2022,
              color: 'Silver',
              licensePlate: 'NY-DRV-789',
              capacity: 4,
              isVerified: true,
            },
          },
        },
      },
      wallet: {
        create: {
          balance: 0.0,
          currency: 'USD',
        },
      },
    },
    include: {
      driverProfile: {
        include: {
          vehicle: true,
        },
      },
    },
  });

  console.log('🚖 Driver and Vehicle seeded successfully.');

  // 3. Create ADMIN
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      phone: '+15550003333',
      firstName: 'Sarah',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      adminProfile: {
        create: {
          accessLabel: AccessLabel.SUPER_ADMIN,
          assignedRegion: 'North America',
        },
      },
    },
    include: {
      adminProfile: true,
    },
  });

  console.log('🛡️ Admin seeded successfully.');

  console.log('\n✨ Database seeding completed successfully!\n');
  console.log('--------------------------------------------------');
  console.log('Seeded User Profiles for Testing:');
  console.log('--------------------------------------------------');
  console.log(`CUSTOMER:`);
  console.log(`  User ID:    ${customerUser.id}`);
  console.log(`  Profile ID: ${customerUser.customerProfile?.id}`);
  console.log(`  Email:      ${customerUser.email}`);
  console.log(`  Role:       ${customerUser.role}`);
  console.log('--------------------------------------------------');
  console.log(`DRIVER:`);
  console.log(`  User ID:    ${driverUser.id}`);
  console.log(`  Profile ID: ${driverUser.driverProfile?.id}`);
  console.log(`  Email:      ${driverUser.email}`);
  console.log(`  Role:       ${driverUser.role}`);
  console.log('--------------------------------------------------');
  console.log(`ADMIN:`);
  console.log(`  User ID:    ${adminUser.id}`);
  console.log(`  Profile ID: ${adminUser.adminProfile?.id}`);
  console.log(`  Email:      ${adminUser.email}`);
  console.log(`  Role:       ${adminUser.role}`);
  console.log('--------------------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
