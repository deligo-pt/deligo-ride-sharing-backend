import 'dotenv/config';
import bcrypt from 'bcrypt';
import {
  PrismaClient,
  UserRole,
  UserStatus,
  AccessLabel,
  KycStatus,
  DocumentStatus,
  FleetVerificationStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ── 1. Production Safety Guard ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  console.error('⛔ Refusing to run dev seed script in production environment!');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const BCRYPT_SALT_ROUNDS = 12;

async function main(): Promise<void> {
  console.log('🌱 Starting idempotent development database seed...\n');

  // ── 1. Seed Dummy Super Admin ─────────────────────────────────────────────
  const adminEmail = 'superadmin@deligo.test';
  const adminPassword = 'SuperAdmin@123';
  const adminPasswordHash = await bcrypt.hash(adminPassword, BCRYPT_SALT_ROUNDS);

  const superAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      isDeleted: false,
    },
    create: {
      email: adminEmail,
      phone: '+15550009001',
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      referralCode: 'DEV-SADMIN',
    },
  });

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: 'CREDENTIALS',
        providerAccountId: superAdmin.id,
      },
    },
    update: {
      passwordHash: adminPasswordHash,
      email: superAdmin.email,
      isDeleted: false,
    },
    create: {
      userId: superAdmin.id,
      provider: 'CREDENTIALS',
      providerAccountId: superAdmin.id,
      email: superAdmin.email,
      passwordHash: adminPasswordHash,
    },
  });

  const adminProfile = await prisma.adminProfile.upsert({
    where: { userId: superAdmin.id },
    update: {
      accessLabel: AccessLabel.SUPER_ADMIN,
    },
    create: {
      userId: superAdmin.id,
      accessLabel: AccessLabel.SUPER_ADMIN,
      assignedRegion: 'Global',
    },
  });

  console.log(`✅ Super Admin ready: ${superAdmin.email} (User ID: ${superAdmin.id})`);

  // ── 2. Seed Pending Driver ────────────────────────────────────────────────
  const driverEmail = 'driver.pending@deligo.test';
  const driverPassword = 'Driver@123';
  const driverPasswordHash = await bcrypt.hash(driverPassword, BCRYPT_SALT_ROUNDS);

  const pendingDriver = await prisma.user.upsert({
    where: { email: driverEmail },
    update: {
      firstName: 'Pending',
      lastName: 'Driver',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_VERIFICATION,
      isEmailVerified: true,
      isDeleted: false,
    },
    create: {
      email: driverEmail,
      phone: '+15550009002',
      firstName: 'Pending',
      lastName: 'Driver',
      role: UserRole.DRIVER,
      status: UserStatus.PENDING_VERIFICATION,
      isEmailVerified: true,
      referralCode: 'DEV-DRVPND',
    },
  });

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: 'CREDENTIALS',
        providerAccountId: pendingDriver.id,
      },
    },
    update: {
      passwordHash: driverPasswordHash,
      email: pendingDriver.email,
      isDeleted: false,
    },
    create: {
      userId: pendingDriver.id,
      provider: 'CREDENTIALS',
      providerAccountId: pendingDriver.id,
      email: pendingDriver.email,
      passwordHash: driverPasswordHash,
    },
  });

  const driverProfile = await prisma.driverProfile.upsert({
    where: { userId: pendingDriver.id },
    update: {
      kycStatus: KycStatus.UNDER_REVIEW,
      isAvailable: false,
      isDeleted: false,
    },
    create: {
      userId: pendingDriver.id,
      kycStatus: KycStatus.UNDER_REVIEW,
      licenseNumber: 'DL-DEV-999999',
      licenseExpiresAt: new Date('2030-12-31'),
      isAvailable: false,
    },
  });

  await prisma.driverDocument.upsert({
    where: { driverProfileId: driverProfile.id },
    update: {
      verificationStatus: DocumentStatus.PENDING,
      drivingLicenseUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      drivingLicenseExpiresAt: new Date('2030-12-31'),
      nationalIdUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      nationalIdExpiresAt: new Date('2030-12-31'),
      vehicleRegistrationUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      vehicleRegistrationExpiresAt: new Date('2030-12-31'),
      vehicleInsuranceUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      vehicleInsuranceExpiresAt: new Date('2030-12-31'),
      driverSelfieUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800',
      proofOfAddressUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      proofOfAddressExpiresAt: new Date('2030-12-31'),
      taxIdUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      taxIdExpiresAt: new Date('2030-12-31'),
    },
    create: {
      driverProfileId: driverProfile.id,
      verificationStatus: DocumentStatus.PENDING,
      drivingLicenseUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      drivingLicenseExpiresAt: new Date('2030-12-31'),
      nationalIdUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      nationalIdExpiresAt: new Date('2030-12-31'),
      vehicleRegistrationUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      vehicleRegistrationExpiresAt: new Date('2030-12-31'),
      vehicleInsuranceUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      vehicleInsuranceExpiresAt: new Date('2030-12-31'),
      driverSelfieUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800',
      proofOfAddressUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      proofOfAddressExpiresAt: new Date('2030-12-31'),
      taxIdUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      taxIdExpiresAt: new Date('2030-12-31'),
    },
  });

  console.log(`✅ Pending Driver ready: ${pendingDriver.email} (User ID: ${pendingDriver.id})`);

  // ── 3. Seed Pending Fleet Manager ─────────────────────────────────────────
  const fleetEmail = 'fleet.pending@deligo.test';
  const fleetPassword = 'Fleet@123';
  const fleetPasswordHash = await bcrypt.hash(fleetPassword, BCRYPT_SALT_ROUNDS);

  const pendingFleet = await prisma.user.upsert({
    where: { email: fleetEmail },
    update: {
      firstName: 'Pending',
      lastName: 'FleetManager',
      role: UserRole.FLEET_MANAGER,
      status: UserStatus.PENDING_VERIFICATION,
      isEmailVerified: true,
      isDeleted: false,
    },
    create: {
      email: fleetEmail,
      phone: '+15550009003',
      firstName: 'Pending',
      lastName: 'FleetManager',
      role: UserRole.FLEET_MANAGER,
      status: UserStatus.PENDING_VERIFICATION,
      isEmailVerified: true,
      referralCode: 'DEV-FLTPND',
    },
  });

  await prisma.account.upsert({
    where: {
      provider_providerAccountId: {
        provider: 'CREDENTIALS',
        providerAccountId: pendingFleet.id,
      },
    },
    update: {
      passwordHash: fleetPasswordHash,
      email: pendingFleet.email,
      isDeleted: false,
    },
    create: {
      userId: pendingFleet.id,
      provider: 'CREDENTIALS',
      providerAccountId: pendingFleet.id,
      email: pendingFleet.email,
      passwordHash: fleetPasswordHash,
    },
  });

  const fleetProfile = await prisma.fleetManagerProfile.upsert({
    where: { userId: pendingFleet.id },
    update: {
      businessName: 'Deligo Urban Fleet Solutions',
      legalBusinessName: 'Deligo Urban Fleet Solutions Lda',
      verificationStatus: FleetVerificationStatus.UNDER_REVIEW,
      submittedAt: new Date(),
      isDeleted: false,
    },
    create: {
      userId: pendingFleet.id,
      businessName: 'Deligo Urban Fleet Solutions',
      legalBusinessName: 'Deligo Urban Fleet Solutions Lda',
      licenseNumber: 'FLT-DEV-888888',
      nifNumber: 'NIF-DEV-777777',
      businessEmail: fleetEmail,
      businessPhone: '+15550005555',
      verificationStatus: FleetVerificationStatus.UNDER_REVIEW,
      submittedAt: new Date(),
      businessLicenseUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      idProofFrontUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      addressProofUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      activityDocumentUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
      ibanProofUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800',
    },
  });

  console.log(`✅ Pending Fleet Manager ready: ${pendingFleet.email} (User ID: ${pendingFleet.id})\n`);

  console.log('═════════════════════════════════════════════════════════════════');
  console.log('              DEV SEED CREDENTIALS & USER IDS                  ');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('1. SUPER ADMIN:');
  console.log(`   User ID:     ${superAdmin.id}`);
  console.log(`   Profile ID:  ${adminProfile.id}`);
  console.log(`   Email:       ${adminEmail}`);
  console.log(`   Password:    ${adminPassword}`);
  console.log(`   Login Route: POST /api/v1/auth/admin/login (or /api/v1/auth/login)`);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('2. PENDING DRIVER (Ready for KYC review / accept / reject):');
  console.log(`   User ID:     ${pendingDriver.id}`);
  console.log(`   Profile ID:  ${driverProfile.id}`);
  console.log(`   Email:       ${driverEmail}`);
  console.log(`   Password:    ${driverPassword}`);
  console.log(`   KYC Status:  UNDER_REVIEW`);
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('3. PENDING FLEET MANAGER (Ready for KYC review / accept / reject):');
  console.log(`   User ID:     ${pendingFleet.id}`);
  console.log(`   Profile ID:  ${fleetProfile.id}`);
  console.log(`   Email:       ${fleetEmail}`);
  console.log(`   Password:    ${fleetPassword}`);
  console.log(`   KYC Status:  UNDER_REVIEW`);
  console.log('═════════════════════════════════════════════════════════════════\n');
}

main()
  .catch((err) => {
    console.error('❌ Error during dev seeding:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
