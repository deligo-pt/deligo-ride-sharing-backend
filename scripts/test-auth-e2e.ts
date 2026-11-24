import http from 'http';
import { createApp } from '../src/app';
import prisma from '../src/config/db';
import { redis } from '../src/utils/redis';

async function runTests() {
  console.log('🚀 Starting Deligo Auth E2E Test Suite...\n');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}/api/v1/auth`;

  let signupSessionId: string;
  const testEmail = `test.user.${Date.now()}@deligo-test.com`;
  const testPhone = `+35191${Math.floor(1000000 + Math.random() * 9000000)}`;
  const testPassword = 'StrongPassword123!';
  let createdUserId = '';
  let exitCode = 0;

  try {
    console.log('▶ Test 1: POST /signup/initiate');
    const initRes = await fetch(`${baseUrl}/signup/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    const initJson = (await initRes.json()) as any;
    if (!initJson.success) {
      throw new Error(`Signup initiate failed: ${JSON.stringify(initJson)}`);
    }

    signupSessionId = initJson.data.signupSessionId;
    console.log(
      `  ✅ Session initiated: ID = ${signupSessionId}, channel = ${initJson.data.channel}`,
    );

    const sessionRaw = await redis.get(`signup:session:${signupSessionId}`);
    if (!sessionRaw) {
      throw new Error('Redis session was not found!');
    }
    const sessionObj = JSON.parse(sessionRaw);
    console.log(
      '  ✅ Redis session verified. TTL remaining:',
      await redis.ttl(`signup:session:${signupSessionId}`),
    );

    console.log(
      '\n▶ Test 2: POST /signup/resend-otp with channel switching to PHONE (cooldown check)',
    );
    const cooldownRes = await fetch(`${baseUrl}/signup/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signupSessionId,
        channel: 'PHONE',
      }),
    });
    const cooldownJson = (await cooldownRes.json()) as any;
    void cooldownJson;
    if (cooldownRes.status !== 429) {
      throw new Error(`Expected 429 for immediate resend, got: ${cooldownRes.status}`);
    }
    console.log('  ✅ Cooldown guard enforced (429 RateLimitError)');

    console.log('\n▶ Test 3: POST /signup/verify-otp with wrong OTP');
    const wrongOtpRes = await fetch(`${baseUrl}/signup/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signupSessionId,
        otp: '000000',
      }),
    });
    const wrongOtpJson = (await wrongOtpRes.json()) as any;
    if (wrongOtpRes.status !== 400 || wrongOtpJson.code !== 'BAD_REQUEST') {
      throw new Error(`Expected 400 for wrong OTP, got: ${wrongOtpRes.status}`);
    }
    console.log(
      `  ✅ Wrong OTP rejected: ${wrongOtpJson.message}, remaining: ${wrongOtpJson.details?.remainingAttempts}`,
    );

    console.log('\n▶ Test 4: POST /signup/verify-otp with valid OTP');
    const crypto = await import('crypto');
    const knownOtp = '789123';
    const knownHash = crypto.createHash('sha256').update(knownOtp).digest('hex');
    sessionObj.otp.codeHash = knownHash;
    await redis.set(`signup:session:${signupSessionId}`, JSON.stringify(sessionObj), 'KEEPTTL');

    const verifyRes = await fetch(`${baseUrl}/signup/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signupSessionId,
        otp: knownOtp,
      }),
    });

    const verifyJson = (await verifyRes.json()) as any;
    if (!verifyJson.success) {
      throw new Error(`Verify OTP failed: ${JSON.stringify(verifyJson)}`);
    }

    createdUserId = verifyJson.data.user.id;
    const initialAccessToken = verifyJson.data.tokens.accessToken;
    void initialAccessToken;

    console.log(`  ✅ User verified & created! User ID: ${createdUserId}`);
    console.log(`  ✅ Unique referral code generated: ${verifyJson.data.user.referralCode}`);
    console.log(`  ✅ isEmailVerified: ${verifyJson.data.user.isEmailVerified}`);

    const userInDb = await prisma.user.findUnique({
      where: { id: createdUserId },
      include: { account: true, customerProfile: true, wallet: true, sessions: true },
    });
    if (
      !userInDb ||
      !userInDb.customerProfile ||
      !userInDb.wallet ||
      userInDb.account.length === 0
    ) {
      throw new Error('Database atomic transaction verification failed!');
    }
    console.log('  ✅ User, Account, CustomerProfile, and Wallet verified in PostgreSQL');

    const sessionAfter = await redis.get(`signup:session:${signupSessionId}`);
    if (sessionAfter) {
      throw new Error('Signup session was not deleted from Redis after verification!');
    }
    console.log('  ✅ Redis signup session deleted post-verification');

    console.log('\n▶ Test 5: POST /login with email identifier');
    const loginEmailRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        rememberMe: true,
      }),
    });
    const loginEmailJson = (await loginEmailRes.json()) as any;
    if (!loginEmailJson.success) {
      throw new Error(`Login with email failed: ${JSON.stringify(loginEmailJson)}`);
    }
    console.log(`  ✅ Login with email succeeded. User: ${loginEmailJson.data.user.email}`);

    // Update created test user with a valid Portuguese phone number for phone login test
    await prisma.user.update({
      where: { id: createdUserId },
      data: { phone: testPhone, isPhoneVerified: true },
    });
    await prisma.account.updateMany({
      where: { userId: createdUserId },
      data: { phone: testPhone },
    });

    // ── Test 6: POST /login with phone ─────────────────────────────────────────
    console.log('\n▶ Test 6: POST /login with phone (contactNumber)');
    const loginPhoneRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactNumber: testPhone,
        password: testPassword,
        rememberMe: false,
        includeRefreshToken: true,
      }),
    });
    const loginPhoneJson = (await loginPhoneRes.json()) as any;
    if (!loginPhoneJson.success) {
      throw new Error(`Login with phone failed: ${JSON.stringify(loginPhoneJson)}`);
    }
    const currentRefreshToken = loginPhoneJson.data.tokens.refreshToken;
    console.log('  ✅ Login with phone succeeded.');

    console.log('\n▶ Test 7: POST /login with invalid password');
    const loginFailRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'WrongPassword!',
      }),
    });
    if (loginFailRes.status !== 401) {
      throw new Error(`Expected 401 for wrong password, got ${loginFailRes.status}`);
    }
    console.log('  ✅ Invalid credentials correctly returned 401 Unauthorized');

    console.log('\n▶ Test 8: POST /refresh-token (Token Rotation)');
    const refreshRes = await fetch(`${baseUrl}/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: currentRefreshToken,
        includeRefreshToken: true,
      }),
    });
    const refreshJson = (await refreshRes.json()) as any;
    if (!refreshJson.success) {
      throw new Error(`Refresh token failed: ${JSON.stringify(refreshJson)}`);
    }
    const rotatedRefreshToken = refreshJson.data.tokens.refreshToken;
    const rotatedAccessToken = refreshJson.data.tokens.accessToken;
    console.log('  ✅ Refresh token rotated successfully');

    console.log('\n▶ Test 9: Re-using old refresh token (Breach detection)');
    const reuseRes = await fetch(`${baseUrl}/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken: currentRefreshToken,
      }),
    });
    if (reuseRes.status !== 401) {
      throw new Error(`Expected 401 for token reuse breach, got: ${reuseRes.status}`);
    }
    console.log('  ✅ Old token reuse rejected as security breach');

    console.log('\n▶ Test 10: POST /logout');
    const logoutRes = await fetch(`${baseUrl}/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rotatedAccessToken}`,
      },
      body: JSON.stringify({
        refreshToken: rotatedRefreshToken,
      }),
    });
    const logoutJson = (await logoutRes.json()) as any;
    if (!logoutJson.success) {
      throw new Error(`Logout failed: ${JSON.stringify(logoutJson)}`);
    }
    console.log('  ✅ Logout successful');

    console.log('\n▶ Test 11: Authenticate with blacklisted Access Token');
    // Call a route with authenticate middleware (/api/v1/profile/me)
    const testBlacklistRes = await fetch(`http://127.0.0.1:${port}/api/v1/profile/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${rotatedAccessToken}`,
      },
    });
    const blacklistJson = (await testBlacklistRes.json()) as any;
    if (testBlacklistRes.status !== 401 || !blacklistJson.message.includes('revoked')) {
      throw new Error(`Expected 401 revoked token, got: ${JSON.stringify(blacklistJson)}`);
    }
    console.log(
      '  ✅ Blacklisted Access Token rejected by auth middleware (Token has been revoked)',
    );

    console.log('\n🎉 ALL 11 TESTS PASSED SUCCESSFULLY! 🎉\n');
  } catch (err) {
    console.error('\n❌ E2E TEST FAILED:', err);
    exitCode = 1;
  } finally {
    if (createdUserId) {
      console.log('🧹 Cleaning up test user from DB...');
      try {
        await prisma.wallet.deleteMany({ where: { userId: createdUserId } });
        await prisma.customerProfile.deleteMany({ where: { userId: createdUserId } });
        await prisma.account.deleteMany({ where: { userId: createdUserId } });
        await prisma.session.deleteMany({ where: { userId: createdUserId } });
        await prisma.user.update({
          where: { id: createdUserId },
          data: { isDeleted: true, deletedAt: new Date() },
        });
        console.log('  ✅ Test user marked as deleted');
      } catch (err) {
        console.warn('  ⚠️ Cleanup warning:', (err as Error).message);
      }
    }

    server.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(exitCode);
  }
}

void runTests();
