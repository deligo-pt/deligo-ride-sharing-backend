import { env } from './env';

// ─────────────────────────────────────────────────────────────────────────────
// Unified Application Configuration
//
// Consolidates env variables into a structured, read-only configuration object.
// This decouples business logic from env var naming schemes and handles
// transformations (like parsing comma-separated origins) once at boot.
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  sameSiteCookie: env.SAMESITE_COOKIE,

  database: {
    url: env.DATABASE_URL,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    accessSecret: env.JWT_ACCESS_SECRET || env.JWT_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    refreshExpiresInDefault: env.JWT_REFRESH_EXPIRES_IN_DEFAULT,
    refreshExpiresInRemember: env.JWT_REFRESH_EXPIRES_IN_REMEMBER,
  },

  otp: {
    expiresInSeconds: env.OTP_EXPIRES_IN_SECONDS,
    signupSessionTtlSeconds: env.SIGNUP_SESSION_TTL_SECONDS,
  },

  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromName: env.EMAIL_FROM_NAME,
    fromAddress: env.EMAIL_FROM_ADDRESS,
  },

  bcrypt: {
    saltRounds: env.BCRYPT_SALT_ROUNDS,
  },

  cors: {
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
  },

  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    androidClientId: env.GOOGLE_ANDROID_CLIENT_ID,
    iosClientId: env.GOOGLE_IOS_CLIENT_ID,
    audiences: [
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_ANDROID_CLIENT_ID,
      env.GOOGLE_IOS_CLIENT_ID,
    ].filter((id): id is string => typeof id === 'string' && id.length > 0),
  },

  facebook: {
    appId: env.FACEBOOK_APP_ID || env.META_APP_ID || '',
    appSecret: env.FACEBOOK_APP_SECRET || env.META_APP_SECRET || '',
  },

  apple: {
    clientId: env.APPLE_CLIENT_ID || 'com.deligo.web.demo',
    bundleId: env.APPLE_BUNDLE_ID || 'com.deligo.app.demo',
    demoMode: env.NODE_ENV !== 'production' && Boolean(env.APPLE_DEMO_MODE),
    audiences: [
      env.APPLE_CLIENT_ID || 'com.deligo.web.demo',
      env.APPLE_BUNDLE_ID || 'com.deligo.app.demo',
    ].filter((id): id is string => typeof id === 'string' && id.length > 0),
  },

  frontend: {
    adminUrl: env.ADMIN_FRONTEND_URL || 'http://localhost:3000/admin',
  },
} as const;

export type AppConfig = typeof config;
