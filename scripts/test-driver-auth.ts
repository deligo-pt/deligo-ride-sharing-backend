import prisma from '../src/config/db';
import { redis } from '../src/utils/redis';
import { initiateSignup, verifySignupOtp, login } from '../src/domains/auth/auth.service';
import { ForbiddenError } from '../src/utils/errors';
import crypto from 'crypto';

async function runDriverAuthTests() {
  console.log('🚀 Starting Driver Auth Integration Tests...\n');
  const testId = crypto.randomBytes(4).toString('hex');
  const clientInfo = {
    userAgent: 'DriverAuthTestRunner/1.0',
    ipAddress: '127.0.0.1',
  };

  const createdUserIds: string[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Driver Registration (Role Isolation & Profile Creation)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- Test 1: Driver Signup Flow (Role Isolation) ---');
    const driverEmail = `driver_test_${testId}@deligo.com`;
    const driverPassword = 'DriverPassword123!';

    // Step 1: Initiate Driver Signup
    const initResult = await initiateSignup(
      {
        firstName: 'John',
        lastName: 'DriverTest',
        email: driverEmail,
        password: driverPassword,
        preferredLanguage: 'EN',
        otpChannel: 'EMAIL',
      },
      'DRIVER',
    );

    console.log(`✅ Driver signup initiated: SessionId = ${initResult.signupSessionId}`);

    // Verify Redis session has role: 'DRIVER'
    const redisData = await redis.get(`signup:session:${initResult.signupSessionId}`);
    if (!redisData) throw new Error('Redis signup session not found');
    const parsedSession = JSON.parse(redisData);
    if (parsedSession.payload.role !== 'DRIVER') {
      throw new Error(`Expected role DRIVER in Redis, got ${parsedSession.payload.role}`);
    }
    console.log('✅ Redis session verified: role is strictly stored as "DRIVER"');

    // Retrieve the OTP codeHash directly to test OTP verification
    // Since we hashSha256(rawOtp) inside initiateSignup, let's extract the raw OTP by mocking or brute-forcing 6 digits in tests
    // Or simpler: compute matching OTP by reading the codeHash:
    // Let's find the matching 6-digit OTP:
    let matchedOtp = '';
    for (let i = 100000; i < 1000000; i++) {
      const candidate = i.toString();
      const hash = crypto.createHash('sha256').update(candidate).digest('hex');
      if (hash === parsedSession.otp.codeHash) {
        matchedOtp = candidate;
        break;
      }
    }
    if (!matchedOtp) throw new Error('Could not find matching OTP code');

    // Step 2: Verify OTP
    const verifyResult = await verifySignupOtp(
      {
        signupSessionId: initResult.signupSessionId,
        otp: matchedOtp,
      },
      clientInfo,
    );

    createdUserIds.push(verifyResult.user.id);
    console.log(`✅ Driver OTP verified: User ID = ${verifyResult.user.id}, Role = ${verifyResult.user.role}`);

    if (verifyResult.user.role !== 'DRIVER') {
      throw new Error(`Expected User.role to be DRIVER, got ${verifyResult.user.role}`);
    }
    if (verifyResult.user.status !== 'ACTIVE') {
      throw new Error(`Expected User.status to be ACTIVE (not PENDING_VERIFICATION), got ${verifyResult.user.status}`);
    }

    // Verify DB records: DriverProfile created, CustomerProfile NOT created
    const dbDriverProfile = await prisma.driverProfile.findUnique({
      where: { userId: verifyResult.user.id },
    });
    if (!dbDriverProfile) {
      throw new Error('DriverProfile was NOT created in PostgreSQL!');
    }
    if (dbDriverProfile.licenseNumber !== null) {
      throw new Error(`Expected licenseNumber to be null on signup, got ${dbDriverProfile.licenseNumber}`);
    }
    if (dbDriverProfile.licenseExpiresAt !== null) {
      throw new Error(`Expected licenseExpiresAt to be null on signup, got ${dbDriverProfile.licenseExpiresAt}`);
    }
    console.log(`✅ DriverProfile created: ID = ${dbDriverProfile.id}, KYC Status = ${dbDriverProfile.kycStatus}, License = ${dbDriverProfile.licenseNumber} (null as expected)`);

    const dbCustomerProfile = await prisma.customerProfile.findUnique({
      where: { userId: verifyResult.user.id },
    });
    if (dbCustomerProfile) {
      throw new Error('CustomerProfile was unexpectedly created for a DRIVER user!');
    }
    console.log('✅ CustomerProfile is null as expected for a DRIVER');

    // Verify Account and Wallet exist
    const dbAccount = await prisma.account.findFirst({
      where: { userId: verifyResult.user.id, provider: 'CREDENTIALS' },
    });
    if (!dbAccount) throw new Error('Credentials account not found for driver');

    const dbWallet = await prisma.wallet.findUnique({
      where: { userId: verifyResult.user.id },
    });
    if (!dbWallet) throw new Error('Wallet not found for driver');
    console.log('✅ Credentials account and Wallet verified');

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Role Authorization Checks on Login
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test 2: Role Authorization Checks on Login ---');

    // Create a regular Customer user
    const customerEmail = `customer_test_${testId}@deligo.com`;
    const customerPassword = 'CustomerPassword123!';
    const customerUser = await prisma.user.create({
      data: {
        email: customerEmail,
        firstName: 'Jane',
        lastName: 'CustomerTest',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        referralCode: `CS${testId.toUpperCase()}1`,
        isEmailVerified: true,
      },
    });
    createdUserIds.push(customerUser.id);

    await prisma.account.create({
      data: {
        userId: customerUser.id,
        provider: 'CREDENTIALS',
        providerAccountId: customerUser.id,
        email: customerEmail,
        passwordHash: await import('bcrypt').then((b) => b.hash(customerPassword, 10)),
      },
    });

    // Case 2A: Driver logging in via Driver endpoint (allowedRoles: ['DRIVER'])
    const driverLoginResult = await login(
      { identifier: driverEmail, password: driverPassword, rememberMe: false },
      clientInfo,
      ['DRIVER'],
    );
    console.log(`✅ Driver successfully logged in via driver portal: ${driverLoginResult.user.id} (${driverLoginResult.user.role})`);

    // Case 2B: Customer trying to log in via Driver endpoint (allowedRoles: ['DRIVER']) -> Must be rejected with 403 Forbidden!
    let customerBlockedFromDriver = false;
    try {
      await login(
        { identifier: customerEmail, password: customerPassword, rememberMe: false },
        clientInfo,
        ['DRIVER'],
      );
    } catch (err: unknown) {
      if (err instanceof ForbiddenError) {
        customerBlockedFromDriver = true;
        console.log(`✅ Customer correctly blocked from Driver portal with ForbiddenError: "${err.message}"`);
      } else {
        throw err;
      }
    }
    if (!customerBlockedFromDriver) {
      throw new Error('Customer was NOT blocked from driver portal!');
    }

    // Case 2C: Driver trying to log in via Customer endpoint (allowedRoles: ['CUSTOMER']) -> Must be rejected with 403 Forbidden!
    let driverBlockedFromCustomer = false;
    try {
      await login(
        { identifier: driverEmail, password: driverPassword, rememberMe: false },
        clientInfo,
        ['CUSTOMER'],
      );
    } catch (err: unknown) {
      if (err instanceof ForbiddenError) {
        driverBlockedFromCustomer = true;
        console.log(`✅ Driver correctly blocked from Customer portal with ForbiddenError: "${err.message}"`);
      } else {
        throw err;
      }
    }
    if (!driverBlockedFromCustomer) {
      throw new Error('Driver was NOT blocked from customer portal!');
    }

    // Case 2D: Customer logging in via Customer endpoint (allowedRoles: ['CUSTOMER'])
    const customerLoginResult = await login(
      { identifier: customerEmail, password: customerPassword, rememberMe: false },
      clientInfo,
      ['CUSTOMER'],
    );
    console.log(`✅ Customer successfully logged in via customer portal: ${customerLoginResult.user.id} (${customerLoginResult.user.role})`);

    console.log('\n🎉 ALL DRIVER AUTH TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    console.log('🧹 Cleaning up test database records...');
    for (const userId of createdUserIds) {
      try {
        await prisma.session.deleteMany({ where: { userId } });
        await prisma.wallet.deleteMany({ where: { userId } });
        await prisma.customerProfile.deleteMany({ where: { userId } });
        await prisma.driverProfile.deleteMany({ where: { userId } });
        await prisma.account.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      } catch (cleanupErr) {
        console.warn(`Failed to cleanup user ${userId}:`, cleanupErr);
      }
    }
    console.log('🧹 Cleanup complete.');
    await prisma.$disconnect();
    await redis.quit();
  }
}

runDriverAuthTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
