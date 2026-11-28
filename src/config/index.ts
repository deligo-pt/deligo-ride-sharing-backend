import { env } from './env';

const DEV_FALLBACK_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

function resolveAllowedOrigins(): string[] {
  const raw = env.CORS_ORIGIN ?? env.ALLOWED_ORIGINS ?? '';
  const configured = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;
  return env.NODE_ENV === 'production' ? [] : DEV_FALLBACK_ORIGINS;
}

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

  superAdmin: {
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
    firstName: env.SUPER_ADMIN_FIRST_NAME,
    lastName: env.SUPER_ADMIN_LAST_NAME,
    phone: env.SUPER_ADMIN_PHONE,
  },

  redis: {
    url: env.REDIS_URL,
  },

  worker: {
    embedded: env.ENABLE_WORKER,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    accessSecret: env.JWT_ACCESS_SECRET || env.JWT_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
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
  },

  email: {
    fromName: env.EMAIL_FROM_NAME,
    fromAddress: env.EMAIL_FROM_ADDRESS,
  },

  resend: {
    apiKey: env.RESEND_API_KEY,
  },

  rustfs: {
    endpoint: env.RUSTFS_ENDPOINT,
    region: env.RUSTFS_REGION,
    accessKey: env.RUSTFS_ACCESS_KEY,
    secretKey: env.RUSTFS_SECRET_KEY,
    bucket: env.RUSTFS_BUCKET,
    publicUrl: env.RUSTFS_PUBLIC_URL,
    allowedUrlHosts: (env.UPLOAD_ALLOWED_URL_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  },

  bulkgate: {
    applicationId: env.BULKGATE_APPLICATION_ID,
    applicationToken: env.BULKGATE_APPLICATION_TOKEN,
  },

  mapbox: {
    accessToken: env.MAPBOX_ACCESS_TOKEN,
  },

  firebase: {
    serviceAccountPath: env.FIREBASE_SERVICE_ACCOUNT_PATH,
  },

  bcrypt: {
    saltRounds: env.BCRYPT_SALT_ROUNDS,
  },

  cors: {
    allowedOrigins: resolveAllowedOrigins(),
  },

  google: {
    clientId: env.GOOGLE_CLIENT_ID,
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
    clientId: env.APPLE_CLIENT_ID,
    bundleId: env.APPLE_BUNDLE_ID,
    demoMode: env.NODE_ENV !== 'production' && env.APPLE_DEMO_MODE,
    audiences: [env.APPLE_CLIENT_ID, env.APPLE_BUNDLE_ID].filter((id) => id.length > 0),
  },

  frontend: {
    adminUrl: env.ADMIN_FRONTEND_URL,
  },
} as const;

export type AppConfig = typeof config;
