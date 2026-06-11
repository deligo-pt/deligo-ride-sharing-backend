import 'dotenv/config';
import { PrismaClient, UserRole, UserStatus, AccessLabel, VehicleClass, VehicleType, ZoneType } from '@prisma/client';
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
  await prisma.review.deleteMany({});
  await prisma.ticketMessage.deleteMany({});
  await prisma.supportTicket.deleteMany({});
  await prisma.ride.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.driverDocument.deleteMany({});
  await prisma.driverProfile.deleteMany({});
  await prisma.customerProfile.deleteMany({});
  await prisma.adminProfile.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.pricingRule.deleteMany({});
  await prisma.zone.deleteMany({});

  console.log('🗑️  Existing data cleared.');

  // Seed Pricing Rules
  await prisma.pricingRule.createMany({
    data: [
      { vehicleType: VehicleType.Hatchback, baseFare: 2.00, perKmRate: 1.50, perMinRate: 0.10, surgeMultiplier: 1.0, adminFeePercentage: 20.0 },
      { vehicleType: VehicleType.Micro, baseFare: 1.50, perKmRate: 1.20, perMinRate: 0.08, surgeMultiplier: 1.0, adminFeePercentage: 20.0 },
      { vehicleType: VehicleType.Sedan, baseFare: 3.00, perKmRate: 2.00, perMinRate: 0.15, surgeMultiplier: 1.0, adminFeePercentage: 20.0 },
      { vehicleType: VehicleType.SUV, baseFare: 5.00, perKmRate: 3.00, perMinRate: 0.25, surgeMultiplier: 1.0, adminFeePercentage: 20.0 },
      { vehicleType: VehicleType.Motorcycle, baseFare: 1.00, perKmRate: 0.90, perMinRate: 0.06, surgeMultiplier: 1.0, adminFeePercentage: 20.0 },
      { vehicleType: VehicleType.PickupTruck, baseFare: 4.00, perKmRate: 2.50, perMinRate: 0.20, surgeMultiplier: 1.0, adminFeePercentage: 20.0 },
    ],
  });
  console.log('💰 Pricing Rules seeded successfully.');

  // Seed Zones (Geofencing)
  await prisma.zone.createMany({
    data: [
      {
        name: 'Hazrat Shahjalal International Airport',
        type: ZoneType.SURCHARGE,
        surchargeAmount: 5.00,
        polygon: [
          [23.8450, 90.3979],
          [23.8450, 90.4230],
          [23.8280, 90.4230],
          [23.8280, 90.3979]
        ],
        isActive: true,
      },
      {
        name: 'Kamalapur Railway Station',
        type: ZoneType.SURCHARGE,
        surchargeAmount: 2.50,
        polygon: [
          [23.7340, 90.4245],
          [23.7340, 90.4300],
          [23.7290, 90.4300],
          [23.7290, 90.4245]
        ],
        isActive: true,
      },
      {
        name: 'Padma Bridge Toll Plaza',
        type: ZoneType.SURCHARGE,
        surchargeAmount: 10.00,
        polygon: [
          [23.4730, 90.2600],
          [23.4730, 90.2700],
          [23.4680, 90.2700],
          [23.4680, 90.2600]
        ],
        isActive: true,
      }
    ],
  });
  console.log('🌍 Geofencing Zones seeded successfully.');

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
      emergencyContacts: {
        create: [
          {
            name: 'John Doe',
            phoneNumber: '+15550009999',
            relation: 'Brother',
          },
        ],
      },
    },
    include: {
      customerProfile: true,
      emergencyContacts: true,
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
              approvalStatus: 'APPROVED',
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

  // Create an active Ride for testing safety features with rideId
  const activeRide = await prisma.ride.create({
    data: {
      customerId: customerUser.customerProfile!.id,
      driverProfileId: driverUser.driverProfile!.id,
      status: 'IN_PROGRESS',
      pickupAddress: '123 Main Street, New York, NY',
      pickupLatitude: 40.7128,
      pickupLongitude: -74.0060,
      dropoffAddress: '456 Business Rd, New York, NY',
      dropoffLatitude: 40.7200,
      dropoffLongitude: -74.0100,
      estimatedFare: 15.50,
      estimatedDistance: 2.5,
      estimatedDuration: 10,
    },
  });
  console.log('🚗 Active Ride seeded successfully.');

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
  if (customerUser.emergencyContacts.length > 0) {
    console.log(`  Emergency Contact: ${customerUser.emergencyContacts[0].name} (${customerUser.emergencyContacts[0].phoneNumber})`);
  }
  console.log('--------------------------------------------------');
  console.log(`DRIVER:`);
  console.log(`  User ID:    ${driverUser.id}`);
  console.log(`  Profile ID: ${driverUser.driverProfile?.id}`);
  console.log(`  Email:      ${driverUser.email}`);
  console.log(`  Role:       ${driverUser.role}`);
  console.log('--------------------------------------------------');
  console.log(`RIDE (IN_PROGRESS):`);
  console.log(`  Ride ID:    ${activeRide.id}`);
  console.log(`  Customer:   ${customerUser.id}`);
  console.log(`  Driver:     ${driverUser.id}`);
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
