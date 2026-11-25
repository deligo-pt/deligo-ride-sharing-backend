import http from 'http';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { createApp } from '../src/app';
import prisma from '../src/config/db';
import { redis } from '../src/utils/redis';

async function runAdminAuthTests() {
  console.log('🚀 Starting Admin Auth Integration Tests...\n');
  const testId = crypto.randomBytes(4).toString('hex');
  const createdUserIds: string[] = [];

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}/api/v1/auth`;

  try {
    console.log('--- Setting up Test Users in Database ---');

    const superAdminEmail = `superadmin_${testId}@deligo-test.com`;
    const superAdminPassword = 'SuperAdminPassword123!';
    const superAdminUser = await prisma.user.create({
      data: {
        email: superAdminEmail,
        firstName: 'Super',
        lastName: 'Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        isEmailVerified: true,
        referralCode: `SA${testId.toUpperCase()}1`,
      },
    });
    createdUserIds.push(superAdminUser.id);

    await prisma.adminProfile.create({
      data: {
        userId: superAdminUser.id,
        accessLabel: 'SUPER_ADMIN',
      },
    });

    const superAdminHash = await bcrypt.hash(superAdminPassword, 10);
    await prisma.account.create({
      data: {
        userId: superAdminUser.id,
        provider: 'CREDENTIALS',
        providerAccountId: superAdminUser.id,
        email: superAdminEmail,
        passwordHash: superAdminHash,
      },
    });

    const regularAdminEmail = `admin_${testId}@deligo-test.com`;
    const regularAdminPassword = 'RegularAdminPassword123!';
    const regularAdminUser = await prisma.user.create({
      data: {
        email: regularAdminEmail,
        firstName: 'Regular',
        lastName: 'Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        isEmailVerified: true,
        referralCode: `RA${testId.toUpperCase()}1`,
      },
    });
    createdUserIds.push(regularAdminUser.id);

    await prisma.adminProfile.create({
      data: {
        userId: regularAdminUser.id,
        accessLabel: 'SUPPORT',
      },
    });

    const regularAdminHash = await bcrypt.hash(regularAdminPassword, 10);
    await prisma.account.create({
      data: {
        userId: regularAdminUser.id,
        provider: 'CREDENTIALS',
        providerAccountId: regularAdminUser.id,
        email: regularAdminEmail,
        passwordHash: regularAdminHash,
      },
    });

    const customerEmail = `customer_${testId}@deligo-test.com`;
    const customerPassword = 'CustomerPassword123!';
    const customerUser = await prisma.user.create({
      data: {
        email: customerEmail,
        firstName: 'Test',
        lastName: 'Customer',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        isEmailVerified: true,
        referralCode: `CU${testId.toUpperCase()}1`,
      },
    });
    createdUserIds.push(customerUser.id);

    await prisma.customerProfile.create({
      data: {
        userId: customerUser.id,
      },
    });

    const customerHash = await bcrypt.hash(customerPassword, 10);
    await prisma.account.create({
      data: {
        userId: customerUser.id,
        provider: 'CREDENTIALS',
        providerAccountId: customerUser.id,
        email: customerEmail,
        passwordHash: customerHash,
      },
    });

    console.log('✅ Seed users created successfully.\n');

    console.log('--- Test 1: Admin Login Endpoint ---');

    const regAdminLoginRes = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: regularAdminEmail,
        password: regularAdminPassword,
        rememberMe: true,
      }),
    });
    const regAdminLoginJson = (await regAdminLoginRes.json()) as any;
    if (regAdminLoginRes.status !== 200 || !regAdminLoginJson.success) {
      throw new Error(`Regular admin login failed: ${JSON.stringify(regAdminLoginJson)}`);
    }
    const regularAdminToken = regAdminLoginJson.data.tokens.accessToken;
    console.log('✅ Regular admin logged in successfully via /admin/login');

    const superAdminLoginRes = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: superAdminEmail,
        password: superAdminPassword,
      }),
    });
    const superAdminLoginJson = (await superAdminLoginRes.json()) as any;
    if (superAdminLoginRes.status !== 200 || !superAdminLoginJson.success) {
      throw new Error(`Super admin login failed: ${JSON.stringify(superAdminLoginJson)}`);
    }
    const superAdminToken = superAdminLoginJson.data.tokens.accessToken;
    console.log('✅ Super admin logged in successfully via /admin/login');

    const customerLoginRes = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customerEmail,
        password: customerPassword,
      }),
    });
    const customerLoginJson = (await customerLoginRes.json()) as any;
    if (customerLoginRes.status !== 403) {
      throw new Error(
        `Expected 403 for customer logging in at /admin/login, got ${customerLoginRes.status}`,
      );
    }
    console.log(
      `✅ Customer correctly blocked from /admin/login with 403: "${customerLoginJson.message}"`,
    );

    console.log('\n--- Test 2: Privilege Escalation Prevention on Admin Creation ---');

    const unauthRes = await fetch(`${baseUrl}/admin/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Hacker',
        lastName: 'Admin',
        email: `hacker_${testId}@deligo-test.com`,
        role: 'ADMIN',
      }),
    });
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated admin create, got ${unauthRes.status}`);
    }
    console.log('✅ Unauthenticated create request correctly rejected with 401 Unauthorized');

    const customerAuthRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customerEmail,
        password: customerPassword,
      }),
    });
    const customerAuthJson = (await customerAuthRes.json()) as any;
    const customerToken = customerAuthJson.data.tokens.accessToken;

    const customerCreateRes = await fetch(`${baseUrl}/admin/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        firstName: 'Fake',
        lastName: 'Admin',
        email: `fake_${testId}@deligo-test.com`,
        role: 'ADMIN',
      }),
    });
    if (customerCreateRes.status !== 403) {
      throw new Error(`Expected 403 for customer creating admin, got ${customerCreateRes.status}`);
    }
    console.log('✅ Customer token rejected from /admin/create with 403 Forbidden');

    const escalateRes = await fetch(`${baseUrl}/admin/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regularAdminToken}`,
      },
      body: JSON.stringify({
        firstName: 'Escalated',
        lastName: 'Admin',
        email: `escalated_${testId}@deligo-test.com`,
        role: 'SUPER_ADMIN',
      }),
    });
    const escalateJson = (await escalateRes.json()) as any;
    if (escalateRes.status !== 403) {
      throw new Error(
        `Expected 403 when regular admin creates SUPER_ADMIN, got ${escalateRes.status}`,
      );
    }
    console.log(
      `✅ Regular admin blocked from creating SUPER_ADMIN with 403: "${escalateJson.message}"`,
    );

    console.log('\n--- Test 3: Authorized Admin Creation Flow ---');

    const newAdminEmail = `newadmin_${testId}@deligo-test.com`;
    const createAdminRes = await fetch(`${baseUrl}/admin/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${regularAdminToken}`,
      },
      body: JSON.stringify({
        firstName: 'Brand',
        lastName: 'NewAdmin',
        email: newAdminEmail,
        role: 'ADMIN',
      }),
    });
    const createAdminJson = (await createAdminRes.json()) as any;
    if (createAdminRes.status !== 201 || !createAdminJson.success) {
      throw new Error(`Failed to create admin: ${JSON.stringify(createAdminJson)}`);
    }
    const createdAdminId = createAdminJson.data.user.id;
    createdUserIds.push(createdAdminId);
    console.log(`✅ Regular Admin created new ADMIN: ID = ${createdAdminId}`);

    const dbAdmin = await prisma.user.findUnique({
      where: { id: createdAdminId },
      include: { adminProfile: true },
    });
    if (!dbAdmin) throw new Error('New admin not found in DB');
    if (dbAdmin.status !== 'PENDING_VERIFICATION') {
      throw new Error(`Expected status PENDING_VERIFICATION, got ${dbAdmin.status}`);
    }
    if (dbAdmin.role !== 'ADMIN') {
      throw new Error(`Expected role ADMIN, got ${dbAdmin.role}`);
    }
    if (dbAdmin.referrerId !== regularAdminUser.id) {
      throw new Error(
        `Expected referrerId to be ${regularAdminUser.id}, got ${dbAdmin.referrerId}`,
      );
    }
    if (dbAdmin.adminProfile?.accessLabel !== 'SUPPORT') {
      throw new Error(`Expected accessLabel SUPPORT, got ${dbAdmin.adminProfile?.accessLabel}`);
    }
    console.log(
      '✅ DB record verified: status=PENDING_VERIFICATION, referrerId=creator.id, accessLabel=SUPPORT',
    );

    const newSuperAdminEmail = `newsuper_${testId}@deligo-test.com`;
    const createSuperAdminRes = await fetch(`${baseUrl}/admin/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        firstName: 'New',
        lastName: 'SuperAdmin',
        email: newSuperAdminEmail,
        role: 'SUPER_ADMIN',
      }),
    });
    const createSuperAdminJson = (await createSuperAdminRes.json()) as any;
    if (createSuperAdminRes.status !== 201 || !createSuperAdminJson.success) {
      throw new Error(`Failed to create super admin: ${JSON.stringify(createSuperAdminJson)}`);
    }
    const createdSuperAdminId = createSuperAdminJson.data.user.id;
    createdUserIds.push(createdSuperAdminId);

    const dbSuperAdmin = await prisma.user.findUnique({
      where: { id: createdSuperAdminId },
      include: { adminProfile: true },
    });
    if (dbSuperAdmin?.adminProfile?.accessLabel !== 'SUPER_ADMIN') {
      throw new Error(
        `Expected accessLabel SUPER_ADMIN, got ${dbSuperAdmin?.adminProfile?.accessLabel}`,
      );
    }
    console.log('✅ Super Admin created new SUPER_ADMIN with accessLabel=SUPER_ADMIN');

    console.log('\n--- Test 4: One-Time Set-Password Invite Flow ---');

    const invalidTokenRes = await fetch(`${baseUrl}/admin/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'invalid-nonexistent-token',
        password: 'ValidPassword123!',
      }),
    });
    const invalidTokenJson = (await invalidTokenRes.json()) as any;
    if (invalidTokenRes.status !== 400) {
      throw new Error(`Expected 400 for invalid token, got ${invalidTokenRes.status}`);
    }
    console.log(
      `✅ Invalid token rejected with 400: "${invalidTokenJson.error?.message || invalidTokenJson.message}"`,
    );

    const weakPassRes = await fetch(`${baseUrl}/admin/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'some-token',
        password: 'weak',
      }),
    });
    if (weakPassRes.status !== 422) {
      throw new Error(`Expected 422 for weak password, got ${weakPassRes.status}`);
    }
    console.log('✅ Weak password rejected by validation schema (422)');

    const rawInviteToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawInviteToken).digest('hex');
    const redisInviteKey = `admin:invite:${tokenHash}`;

    await redis.set(
      redisInviteKey,
      JSON.stringify({
        userId: createdAdminId,
        email: newAdminEmail,
        role: 'ADMIN',
      }),
      'EX',
      86400,
    );

    const newAdminPassword = 'NewAdminSecretPassword123!';
    const setPassRes = await fetch(`${baseUrl}/admin/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawInviteToken,
        password: newAdminPassword,
      }),
    });
    const setPassJson = (await setPassRes.json()) as any;
    if (setPassRes.status !== 200 || !setPassJson.success) {
      throw new Error(`Failed to set password: ${JSON.stringify(setPassJson)}`);
    }
    console.log(`✅ Password set successfully: "${setPassJson.data.message}"`);

    const redisAfter = await redis.get(redisInviteKey);
    if (redisAfter !== null) {
      throw new Error('Redis invitation token was NOT deleted after being used!');
    }
    console.log('✅ Redis invite token immediately deleted (one-time use enforced)');

    const reuseTokenRes = await fetch(`${baseUrl}/admin/set-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawInviteToken,
        password: 'AnotherPassword123!',
      }),
    });
    if (reuseTokenRes.status !== 400) {
      throw new Error(`Expected 400 when reusing invite token, got ${reuseTokenRes.status}`);
    }
    console.log('✅ Replay attack prevented: reusing token returns 400 Bad Request');

    const activatedUser = await prisma.user.findUnique({
      where: { id: createdAdminId },
    });
    if (activatedUser?.status !== 'ACTIVE' || !activatedUser?.isEmailVerified) {
      throw new Error(
        `Expected user to be ACTIVE and verified, got status=${activatedUser?.status}, verified=${activatedUser?.isEmailVerified}`,
      );
    }
    const credentialsAccount = await prisma.account.findFirst({
      where: { userId: createdAdminId, provider: 'CREDENTIALS' },
    });
    if (!credentialsAccount || !credentialsAccount.passwordHash) {
      throw new Error('CREDENTIALS account was not created for activated admin!');
    }
    console.log(
      '✅ DB state verified: user status=ACTIVE, isEmailVerified=true, CREDENTIALS account created',
    );

    console.log('\n--- Test 5: Login with Newly Activated Admin ---');

    const newAdminLoginRes = await fetch(`${baseUrl}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: newAdminEmail,
        password: newAdminPassword,
      }),
    });
    const newAdminLoginJson = (await newAdminLoginRes.json()) as any;
    if (newAdminLoginRes.status !== 200 || !newAdminLoginJson.success) {
      throw new Error(`New admin login failed: ${JSON.stringify(newAdminLoginJson)}`);
    }
    console.log(
      `✅ Newly activated admin successfully logged in: ${newAdminLoginJson.data.user.id} (${newAdminLoginJson.data.user.email})`,
    );

    console.log('\n🎉 ALL ADMIN AUTH & INVITE TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    console.log('🧹 Cleaning up test database records...');
    for (const userId of createdUserIds) {
      try {
        await prisma.session.deleteMany({ where: { userId } });
        await prisma.adminProfile.deleteMany({ where: { userId } });
        await prisma.customerProfile.deleteMany({ where: { userId } });
        await prisma.account.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      } catch (cleanupErr) {
        console.warn(`Failed to cleanup user ${userId}:`, cleanupErr);
      }
    }

    try {
      const keys = await redis.keys('admin:invite:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (redisErr) {
      console.warn('Failed to cleanup admin invite redis keys:', redisErr);
    }

    server.close();
    await prisma.$disconnect();
    await redis.quit();
    console.log('🧹 Cleanup complete.');
  }
}

runAdminAuthTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  });
