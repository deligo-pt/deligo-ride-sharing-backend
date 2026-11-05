import bcrypt from 'bcrypt';
import { AccessLabel, DiscountType, UserRole, UserStatus } from '@prisma/client';
import prisma from './src/config/db';

async function seedAdmin() {
  try {
    const plainPassword = 'AdminMasterPassword123!';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log(`Bcrypt password hash generated: ${hashedPassword.substring(0, 16)}...`);

    const adminEmail = 'test.admin@deligo.com';
    const adminPhone = '+15553004003';

    const user = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        phone: adminPhone,
        firstName: 'Sarah',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: adminEmail,
        phone: adminPhone,
        firstName: 'Sarah',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    const adminProfile = await prisma.adminProfile.upsert({
      where: { userId: user.id },
      update: {
        accessLabel: AccessLabel.SUPER_ADMIN,
        assignedRegion: 'Pacific Northwest',
      },
      create: {
        userId: user.id,
        accessLabel: AccessLabel.SUPER_ADMIN,
        assignedRegion: 'Pacific Northwest',
      },
    });

    const promoCode = await prisma.promoCode.upsert({
      where: { code: 'SPRING2026' },
      update: {
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20.0,
        maxDiscountCap: 10.0,
        minRideValue: 15.0,
        maxGlobalUses: 1000,
        validFrom: new Date('2026-03-01T00:00:00.000Z'),
        validUntil: new Date('2026-06-30T23:59:59.000Z'),
        isActive: true,
      },
      create: {
        code: 'SPRING2026',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20.0,
        maxDiscountCap: 10.0,
        minRideValue: 15.0,
        maxGlobalUses: 1000,
        validFrom: new Date('2026-03-01T00:00:00.000Z'),
        validUntil: new Date('2026-06-30T23:59:59.000Z'),
        isActive: true,
      },
    });

    console.log('--- Admin Seed Success ---');
    console.log(`Admin User ID: ${user.id}`);
    console.log(`AdminProfile ID: ${adminProfile.id}`);
    console.log(`PromoCode ID: ${promoCode.id}`);
  } catch (error) {
    console.error('Error seeding admin test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin().catch(() => process.exit(1));

