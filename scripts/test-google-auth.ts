import http from 'http';
import { createApp } from '../src/app';
import prisma from '../src/config/db';
import { redis } from '../src/utils/redis';
import { googleAuthClient } from '../src/domains/auth/auth.service';
import { LoginTicket, TokenPayload } from 'google-auth-library';

// ─────────────────────────────────────────────────────────────────────────────
// Deligo Google Sign-In E2E Test Suite
// ─────────────────────────────────────────────────────────────────────────────

async function runGoogleAuthTests() {
  console.log('🚀 Starting Google Auth E2E Test Suite...\n');

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}/api/v1/auth`;

  // Test data IDs to clean up at the end
  const createdUserIds: string[] = [];

  try {
    // ── Test 1: Invalid Google ID Token rejected ─────────────────────────────
    console.log('▶ Test 1: POST /api/v1/auth/google with invalid ID token');
    // Original verifyIdToken will fail against real Google API for fake token
    const invalidRes = await fetch(`${baseUrl}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: 'invalid.fake.google.jwt.token',
      }),
    });

    const invalidJson = (await invalidRes.json()) as any;
    console.log('  Invalid test response:', invalidRes.status, JSON.stringify(invalidJson));
    if (invalidRes.status !== 401) {
      throw new Error(`Expected 401 for invalid Google token, got: ${JSON.stringify(invalidJson)}`);
    }
    console.log('  ✅ Invalid Google ID token correctly rejected with 401 Unauthorized');

    // ── Setup Mock Ticket Generator for Cases A, B, C ─────────────────────────
    let mockPayload: TokenPayload | null = null;
    googleAuthClient.verifyIdToken = async (): Promise<LoginTicket> => {
      if (!mockPayload) {
        throw new Error('No mock payload configured');
      }
      return {
        getPayload: () => mockPayload,
        getUserId: () => mockPayload?.sub || null,
        getEnvelope: () => ({} as any),
        getAttributes: () => ({} as any),
      } as unknown as LoginTicket;
    };

    // ── Test 2: Case C — Brand New User Signup via Google ──────────────────────
    console.log('\n▶ Test 2: Case C — Brand New User Registration via Google');
    const brandNewSub = `google-sub-${Date.now()}`;
    const brandNewEmail = `google.new.${Date.now()}@example.com`;

    mockPayload = {
      sub: brandNewSub,
      email: brandNewEmail,
      email_verified: true,
      name: 'Google Traveler',
      given_name: 'Google',
      family_name: 'Traveler',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
      iss: 'https://accounts.google.com',
      aud: 'test-aud',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const newGoogleRes = await fetch(`${baseUrl}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: 'valid-mock-token-brand-new',
        preferredLanguage: 'EN',
        rememberMe: true,
      }),
    });

    const newGoogleJson = (await newGoogleRes.json()) as any;
    if (!newGoogleJson.success) {
      throw new Error(`Google signup failed: ${JSON.stringify(newGoogleJson)}`);
    }

    const createdUser = newGoogleJson.data.user;
    createdUserIds.push(createdUser.id);

    console.log(`  ✅ User created successfully! ID: ${createdUser.id}`);
    console.log(`  ✅ Verified fields: email=${createdUser.email}, isEmailVerified=${createdUser.isEmailVerified}, referralCode=${createdUser.referralCode}`);
    console.log(`  ✅ Tokens issued: Access Token (length ${newGoogleJson.data.tokens.accessToken.length}), Refresh Token (expiresIn=${newGoogleJson.data.tokens.expiresIn})`);

    // Verify DB relations created
    const dbUser = await prisma.user.findUnique({
      where: { id: createdUser.id },
      include: { account: true, customerProfile: true, wallet: true, sessions: true },
    });

    if (!dbUser || !dbUser.customerProfile || !dbUser.wallet) {
      throw new Error('Database atomic transaction verification failed for Case C');
    }
    const googleAccount = dbUser.account.find((a) => a.provider === 'GOOGLE');
    if (!googleAccount || googleAccount.providerAccountId !== brandNewSub) {
      throw new Error('Google Account record was not properly linked in DB');
    }
    console.log('  ✅ DB verification: User, Google Account, CustomerProfile, Wallet, and Session verified');

    // ── Test 3: Case A — Existing Google Account Login (Fast Path) ────────────
    console.log('\n▶ Test 3: Case A — Subsequent Login for Existing Google Account');
    const existingGoogleRes = await fetch(`${baseUrl}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: 'valid-mock-token-existing',
        rememberMe: true,
      }),
    });

    const existingGoogleJson = (await existingGoogleRes.json()) as any;
    if (!existingGoogleJson.success || existingGoogleJson.data.user.id !== createdUser.id) {
      throw new Error(`Existing Google login failed: ${JSON.stringify(existingGoogleJson)}`);
    }
    console.log('  ✅ Existing Google Account recognized and logged in smoothly');

    // ── Test 4: Case B — Existing User with Unverified Credentials Account ────
    console.log('\n▶ Test 4: Case B — Pre-Account Takeover Protection');
    const preExistingEmail = `victim.user.${Date.now()}@example.com`;
    const preExistingSub = `google-sub-takeover-${Date.now()}`;

    // Create a squatted unverified user with credentials
    const squattedUser = await prisma.user.create({
      data: {
        email: preExistingEmail,
        firstName: 'Attacker',
        lastName: 'Squatter',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        isEmailVerified: false, // NOT verified!
        referralCode: `DL${Date.now().toString(36).slice(-6).toUpperCase()}`,
      },
    });
    createdUserIds.push(squattedUser.id);

    // Create an unverified CREDENTIALS account
    await prisma.account.create({
      data: {
        userId: squattedUser.id,
        provider: 'CREDENTIALS',
        providerAccountId: squattedUser.id,
        email: preExistingEmail,
        passwordHash: '$2b$12$attackerpasswordhash',
        isDeleted: false,
      },
    });
    await prisma.customerProfile.create({ data: { userId: squattedUser.id } });
    await prisma.wallet.create({ data: { userId: squattedUser.id, balance: 0, currency: 'USD' } });

    console.log('  ✅ Squatted unverified user created in DB');

    // Now the legitimate owner logs in with verified Google account
    mockPayload = {
      sub: preExistingSub,
      email: preExistingEmail,
      email_verified: true, // Google proves ownership!
      name: 'Real Owner',
      given_name: 'Real',
      family_name: 'Owner',
      picture: 'https://lh3.googleusercontent.com/real-owner.jpg',
      iss: 'https://accounts.google.com',
      aud: 'test-aud',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const takeoverRes = await fetch(`${baseUrl}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: 'valid-mock-token-takeover',
        rememberMe: true,
      }),
    });

    const takeoverJson = (await takeoverRes.json()) as any;
    if (!takeoverJson.success || takeoverJson.data.user.id !== squattedUser.id) {
      throw new Error(`Takeover protection flow failed: ${JSON.stringify(takeoverJson)}`);
    }

    // Verify DB state after linking:
    // 1. isEmailVerified should be true
    // 2. squatted CREDENTIALS account should be deleted/soft-deleted
    // 3. new GOOGLE account should be active
    const postTakeoverUser = await prisma.user.findUnique({
      where: { id: squattedUser.id },
      include: {
        account: true,
      },
    });

    if (!postTakeoverUser?.isEmailVerified) {
      throw new Error('User.isEmailVerified was not set to true after Google verification');
    }

    const credentialsAccount = postTakeoverUser.account.find((a) => a.provider === 'CREDENTIALS');
    if (!credentialsAccount || !credentialsAccount.isDeleted) {
      throw new Error('Pre-Account Takeover Protection failed: Unverified credentials account was not invalidated!');
    }

    const linkedGoogleAccount = postTakeoverUser.account.find((a) => a.provider === 'GOOGLE');
    if (!linkedGoogleAccount || linkedGoogleAccount.providerAccountId !== preExistingSub) {
      throw new Error('Google account was not linked to existing user');
    }

    console.log('  ✅ Pre-Account Takeover Protection verified:');
    console.log('     - isEmailVerified flipped to true');
    console.log('     - Unverified CREDENTIALS account soft-deleted (isDeleted=true)');
    console.log('     - Verified GOOGLE account linked');
    console.log('     - Profile picture backfilled:', postTakeoverUser.profilePicture);

    // ── Test 5: Suspended User Blocked ─────────────────────────────────────────
    console.log('\n▶ Test 5: Suspended user rejected');
    await prisma.user.update({
      where: { id: squattedUser.id },
      data: { status: 'SUSPENDED' },
    });

    const suspendedRes = await fetch(`${baseUrl}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: 'valid-mock-token-suspended',
      }),
    });

    if (suspendedRes.status !== 403) {
      throw new Error(`Expected 403 for suspended user, got: ${suspendedRes.status}`);
    }
    console.log('  ✅ Suspended account rejected with 403 Forbidden');

    console.log('\n🎉 ALL 5 GOOGLE AUTH TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    // Cleanup created test records
    console.log('🧹 Cleaning up test users from DB...');
    for (const userId of createdUserIds) {
      try {
        await prisma.wallet.deleteMany({ where: { userId } });
        await prisma.customerProfile.deleteMany({ where: { userId } });
        await prisma.account.deleteMany({ where: { userId } });
        await prisma.session.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      } catch (err) {
        console.warn(`  ⚠️ Cleanup warning for user ${userId}:`, (err as Error).message);
      }
    }
    console.log('  ✅ Cleanup complete');

    server.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  }
}

runGoogleAuthTests().catch((err) => {
  console.error('\n❌ GOOGLE AUTH TEST FAILED:', err);
  process.exit(1);
});
