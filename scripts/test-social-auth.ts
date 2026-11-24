import prisma from '../src/config/db';
import { redis } from '../src/utils/redis';
import { AuthService } from '../src/modules/auth/auth.service';
import { ForbiddenError, UnauthorizedError } from '../src/utils/errors';
import crypto from 'crypto';

async function runTests() {
  console.log('🚀 Starting Social Auth Integration Tests...\n');
  const testId = crypto.randomBytes(4).toString('hex');
  const clientInfo = {
    userAgent: 'IntegrationTestRunner/1.0',
    ipAddress: '127.0.0.1',
  };

  const createdUserIds: string[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Apple Sign-In Demo Mode — Case C (Brand New User)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('--- Test 1: Apple Sign-In Demo Mode (Case C: New User) ---');
    const demoEmail1 = `apple_test_${testId}_1@example.com`;
    const result1 = await AuthService.appleLogin(
      {
        idToken: `demo_apple_token_${demoEmail1}`,
        user: {
          firstName: 'Apple',
          lastName: 'Tester',
        },
        preferredLanguage: 'EN',
        rememberMe: true,
      },
      clientInfo,
    );

    createdUserIds.push(result1.user.id);
    console.log(`✅ User created via Apple Demo: ${result1.user.id} (${result1.user.email})`);
    console.log(
      `   Tokens issued: Access (${result1.tokens.accessToken ? 'yes' : 'no'}), Refresh (${result1.tokens.refreshToken ? 'yes' : 'no'})`,
    );

    if (result1.user.email !== demoEmail1) {
      throw new Error(`Expected email ${demoEmail1}, got ${result1.user.email}`);
    }
    if (result1.user.firstName !== 'Apple' || result1.user.lastName !== 'Tester') {
      throw new Error(
        `Expected name Apple Tester, got ${result1.user.firstName} ${result1.user.lastName}`,
      );
    }
    if (!result1.user.isEmailVerified) {
      throw new Error('Expected isEmailVerified to be true for verified Apple account');
    }

    // Verify DB relationships: Account, CustomerProfile, Wallet
    const dbAccount = await prisma.account.findFirst({
      where: { userId: result1.user.id, provider: 'APPLE' },
    });
    if (!dbAccount) throw new Error('Account record with provider APPLE not found in DB');

    const dbProfile = await prisma.customerProfile.findUnique({
      where: { userId: result1.user.id },
    });
    if (!dbProfile) throw new Error('CustomerProfile not found in DB');

    const dbWallet = await prisma.wallet.findUnique({
      where: { userId: result1.user.id },
    });
    if (!dbWallet) throw new Error('Wallet not found in DB');
    console.log('✅ DB records verified: User, Account (APPLE), CustomerProfile, Wallet');

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Apple Sign-In Demo Mode — Case A (Existing Account)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test 2: Apple Sign-In Demo Mode (Case A: Existing Account) ---');
    const result2 = await AuthService.appleLogin(
      {
        idToken: `demo_apple_token_${demoEmail1}`,
        preferredLanguage: 'EN',
        rememberMe: false,
      },
      clientInfo,
    );

    if (result2.user.id !== result1.user.id) {
      throw new Error(`Expected existing user ID ${result1.user.id}, got ${result2.user.id}`);
    }
    console.log(`✅ Existing user successfully logged in with Apple: ${result2.user.id}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Apple Sign-In Demo Mode — Case B (Account Linking + Takeover Protection)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(
      '\n--- Test 3: Apple Sign-In Demo Mode (Case B: Security Reject & Auto-Linking / Takeover Protection) ---',
    );
    const demoEmailPending = `takeover_pending_${testId}@example.com`;

    // 3A: PENDING_VERIFICATION user is rejected with ForbiddenError
    const pendingUser = await prisma.user.create({
      data: {
        email: demoEmailPending,
        firstName: 'Pending',
        lastName: 'User',
        referralCode: `TP${testId.toUpperCase()}1`,
        role: 'CUSTOMER',
        status: 'PENDING_VERIFICATION',
        isEmailVerified: false,
      },
    });
    createdUserIds.push(pendingUser.id);

    let pendingBlocked = false;
    try {
      await AuthService.appleLogin(
        {
          idToken: `demo_apple_token_${demoEmailPending}`,
          user: {
            firstName: 'Real',
            lastName: 'Owner',
          },
          preferredLanguage: 'EN',
          rememberMe: false,
        },
        clientInfo,
      );
    } catch (err: unknown) {
      if (err instanceof ForbiddenError) {
        pendingBlocked = true;
        console.log(
          `✅ Pending user correctly rejected with ForbiddenError: "${err.message}"`,
        );
      } else {
        throw err;
      }
    }
    if (!pendingBlocked) {
      throw new Error('Pending verification user was NOT blocked from social login!');
    }

    // 3B: ACTIVE user with unverified email (squatter credentials) - auto-links & soft-deletes credentials
    const demoEmailActive = `takeover_active_${testId}@example.com`;
    const unverifiedActiveUser = await prisma.user.create({
      data: {
        email: demoEmailActive,
        firstName: 'Squatter',
        lastName: 'Attacker',
        referralCode: `TA${testId.toUpperCase()}2`,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        isEmailVerified: false,
      },
    });
    createdUserIds.push(unverifiedActiveUser.id);

    const squatterAccount = await prisma.account.create({
      data: {
        userId: unverifiedActiveUser.id,
        provider: 'CREDENTIALS',
        providerAccountId: demoEmailActive,
        email: demoEmailActive,
        passwordHash: 'dummy_hash',
      },
    });

    // Legitimate owner logs in via Apple with verified email
    const result3 = await AuthService.appleLogin(
      {
        idToken: `demo_apple_token_${demoEmailActive}`,
        user: {
          firstName: 'Real',
          lastName: 'Owner',
        },
        preferredLanguage: 'EN',
        rememberMe: false,
      },
      clientInfo,
    );

    if (result3.user.id !== unverifiedActiveUser.id) {
      throw new Error(
        `Expected account linking to existing user ID ${unverifiedActiveUser.id}, got ${result3.user.id}`,
      );
    }

    // Verify unverified credentials account was soft-deleted to protect against account takeover
    const updatedSquatterAccount = await prisma.account.findUnique({
      where: { id: squatterAccount.id },
    });
    if (!updatedSquatterAccount?.isDeleted) {
      throw new Error(
        'Unverified credentials account was NOT soft-deleted upon verified social login!',
      );
    }
    console.log(
      '✅ Pre-account takeover protection verified: unverified credentials account soft-deleted',
    );

    // Verify Apple account was created on this user
    const linkedAppleAccount = await prisma.account.findFirst({
      where: { userId: unverifiedActiveUser.id, provider: 'APPLE', isDeleted: false },
    });
    if (!linkedAppleAccount) {
      throw new Error('Apple account was not linked to existing user');
    }
    console.log('✅ Apple account successfully linked to existing user');

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Apple Sign-In Demo Mode — No Email Flow
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test 4: Apple Sign-In Demo Mode (No Email Flow) ---');
    const result4 = await AuthService.appleLogin(
      {
        idToken: `demo_apple_token_noemail_${testId}`,
        user: {
          firstName: 'Private',
          lastName: 'User',
        },
        preferredLanguage: 'EN',
        rememberMe: false,
      },
      clientInfo,
    );
    createdUserIds.push(result4.user.id);

    if (result4.user.email !== null) {
      throw new Error(`Expected null email, got ${result4.user.email}`);
    }
    if (result4.user.isEmailVerified !== false) {
      throw new Error('Expected isEmailVerified to be false when email is null');
    }
    console.log(`✅ Apple account created without email: ID=${result4.user.id}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Facebook Login — Invalid Token Rejection
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test 5: Facebook Login (Invalid Token Rejection) ---');
    let fbRejected = false;
    try {
      await AuthService.facebookLogin(
        {
          accessToken: 'EAAB_invalid_mock_token_for_deligo_testing',
          preferredLanguage: 'EN',
          rememberMe: false,
        },
        clientInfo,
      );
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) {
        fbRejected = true;
        console.log(
          `✅ Invalid Facebook token correctly rejected with UnauthorizedError: "${err.message}"`,
        );
      } else {
        throw err;
      }
    }
    if (!fbRejected) {
      throw new Error('Facebook login did not reject invalid token!');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Apple Login — Invalid Non-Demo Token Rejection
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- Test 6: Apple Login (Invalid Production Token Rejection) ---');
    let appleRejected = false;
    try {
      await AuthService.appleLogin(
        {
          idToken:
            'eyJhbGciOiJSUzI1NiIsImtpZCI6ImludmFsaWQifQ.eyJzdWIiOiIxMjM0NSJ9.invalid_signature',
          preferredLanguage: 'EN',
          rememberMe: false,
        },
        clientInfo,
      );
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) {
        appleRejected = true;
        console.log(
          `✅ Invalid Apple token correctly rejected with UnauthorizedError: "${err.message}"`,
        );
      } else {
        throw err;
      }
    }
    if (!appleRejected) {
      throw new Error('Apple login did not reject invalid token!');
    }

    console.log('\n🎉 ALL SOCIAL AUTH TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    // Cleanup created test records
    console.log('🧹 Cleaning up test database records...');
    for (const userId of createdUserIds) {
      try {
        await prisma.session.deleteMany({ where: { userId } });
        await prisma.wallet.deleteMany({ where: { userId } });
        await prisma.customerProfile.deleteMany({ where: { userId } });
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

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  });
