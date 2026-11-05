import bcrypt from 'bcrypt';
import {
  KycStatus,
  UserRole,
  UserStatus,
  VehicleApprovalStatus,
  VehicleClass,
  VehicleType,
} from '@prisma/client';
import prisma from './src/config/db';

async function seedDriver() {
  try {
    const plainPassword = 'DriverSecurePassword123!';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log(`Bcrypt password hash generated: ${hashedPassword.substring(0, 16)}...`);

    const driverEmail = 'test.driver@deligo.com';
    const driverPhone = '+15552003002';
    const driverLicenseNumber = 'DL-TEST-998877';

    const user = await prisma.user.upsert({
      where: { email: driverEmail },
      update: {
        phone: driverPhone,
        firstName: 'Marcus',
        lastName: 'Driver',
        role: UserRole.DRIVER,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: driverEmail,
        phone: driverPhone,
        firstName: 'Marcus',
        lastName: 'Driver',
        role: UserRole.DRIVER,
        status: UserStatus.ACTIVE,
      },
    });

    const driverProfile = await prisma.driverProfile.upsert({
      where: { userId: user.id },
      update: {
        licenseNumber: driverLicenseNumber,
        licenseExpiresAt: new Date('2032-12-31T23:59:59.000Z'),
        kycStatus: KycStatus.APPROVED,
        isAvailable: true,
        totalRides: 120,
        totalReviews: 45,
        averageRating: 4.92,
        currentLatitude: 44.0489,
        currentLongitude: -123.018,
      },
      create: {
        userId: user.id,
        licenseNumber: driverLicenseNumber,
        licenseExpiresAt: new Date('2032-12-31T23:59:59.000Z'),
        kycStatus: KycStatus.APPROVED,
        isAvailable: true,
        totalRides: 120,
        totalReviews: 45,
        averageRating: 4.92,
        currentLatitude: 44.0489,
        currentLongitude: -123.018,
      },
    });

    const vehicle = await prisma.vehicle.upsert({
      where: { driverProfileId: driverProfile.id },
      update: {
        vehicleClass: VehicleClass.COMFORT,
        vehicleType: VehicleType.Sedan,
        brand: 'Toyota',
        model: 'Camry Hybrid',
        year: 2023,
        color: 'Cosmic Gray',
        licensePlate: 'DELI-DRV-101',
        capacity: 4,
        registrationExpiryDate: new Date('2028-06-30T23:59:59.000Z'),
        insuranceExpiryDate: new Date('2027-12-31T23:59:59.000Z'),
        approvalStatus: VehicleApprovalStatus.APPROVED,
        adminNote: 'Vehicle inspection passed with full documentation.',
        reviewedAt: new Date(),
      },
      create: {
        driverProfileId: driverProfile.id,
        vehicleClass: VehicleClass.COMFORT,
        vehicleType: VehicleType.Sedan,
        brand: 'Toyota',
        model: 'Camry Hybrid',
        year: 2023,
        color: 'Cosmic Gray',
        licensePlate: 'DELI-DRV-101',
        capacity: 4,
        registrationExpiryDate: new Date('2028-06-30T23:59:59.000Z'),
        insuranceExpiryDate: new Date('2027-12-31T23:59:59.000Z'),
        approvalStatus: VehicleApprovalStatus.APPROVED,
        adminNote: 'Vehicle inspection passed with full documentation.',
        reviewedAt: new Date(),
      },
    });

    console.log('--- Driver Seed Success ---');
    console.log(`User ID: ${user.id}`);
    console.log(`DriverProfile ID: ${driverProfile.id}`);
    console.log(`Vehicle ID: ${vehicle.id}`);
  } catch (error) {
    console.error('Error seeding driver test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedDriver().catch(() => process.exit(1));

