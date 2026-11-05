import bcrypt from 'bcrypt';
import { Prisma, RideStatus, UserRole, UserStatus, VehicleClass, VehicleType } from '@prisma/client';
import prisma from './src/config/db';

async function seedCustomer() {
  try {
    const plainPassword = 'CustomerSecurePassword123!';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log(`Bcrypt password hash generated: ${hashedPassword.substring(0, 16)}...`);

    const customerEmail = 'test.customer@deligo.com';
    const customerPhone = '+15551002001';

    const user = await prisma.user.upsert({
      where: { email: customerEmail },
      update: {
        phone: customerPhone,
        firstName: 'Alex',
        lastName: 'Customer',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: customerEmail,
        phone: customerPhone,
        firstName: 'Alex',
        lastName: 'Customer',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      },
    });

    const customerProfile = await prisma.customerProfile.upsert({
      where: { userId: user.id },
      update: {
        homeAddress: '742 Evergreen Terrace, Springfield, OR',
        workAddress: '100 Industrial Way, Sector 7G, Springfield, OR',
        emergencyContactNumber: '+15559990001',
      },
      create: {
        userId: user.id,
        homeAddress: '742 Evergreen Terrace, Springfield, OR',
        workAddress: '100 Industrial Way, Sector 7G, Springfield, OR',
        emergencyContactNumber: '+15559990001',
        totalRides: 0,
        totalReviews: 0,
        averageRating: 5.0,
      },
    });

    const ride = await prisma.ride.create({
      data: {
        customerId: customerProfile.id,
        pickupAddress: '742 Evergreen Terrace, Springfield, OR',
        pickupLatitude: 44.0462,
        pickupLongitude: -123.022,
        dropoffAddress: '100 Industrial Way, Sector 7G, Springfield, OR',
        dropoffLatitude: 44.0521,
        dropoffLongitude: -122.9908,
        vehicleClass: VehicleClass.ECONOMY,
        vehicleType: VehicleType.Sedan,
        status: RideStatus.REQUESTED,
        estimatedFare: new Prisma.Decimal(18.75),
        estimatedDistance: 5.2,
        estimatedDuration: 14,
      },
    });

    console.log('--- Customer Seed Success ---');
    console.log(`User ID: ${user.id}`);
    console.log(`CustomerProfile ID: ${customerProfile.id}`);
    console.log(`Ride ID: ${ride.id}`);
  } catch (error) {
    console.error('Error seeding customer test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedCustomer().catch(() => process.exit(1));

