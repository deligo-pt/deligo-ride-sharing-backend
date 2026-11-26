import 'dotenv/config';
import { z } from 'zod';

const PLACEHOLDER_SECRET_MARKERS = [
  'your_',
  'change_in_production',
  'changeme',
  'deligo_development',
  'mock_',
] as const;

const looksLikePlaceholder = (value: string): boolean => {
  const lower = value.toLowerCase();
  return PLACEHOLDER_SECRET_MARKERS.some((marker) => lower.includes(marker));
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

const envObject = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SAMESITE_COOKIE: z.enum(['lax', 'strict', 'none']).default('lax'),
  PORT: z.coerce.number().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL must be set'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN_DEFAULT: z.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN_REMEMBER: z.string().default('30d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().min(10).max(14).default(12),
  CORS_ORIGIN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  OTP_EXPIRES_IN_SECONDS: z.coerce.number().default(300),
  SIGNUP_SESSION_TTL_SECONDS: z.coerce.number().default(900),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM_NAME: z.string().default('Deligo Ride'),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@deligo.com'),
  RUSTFS_ENDPOINT: z
    .string()
    .url('RUSTFS_ENDPOINT must be a valid URL (e.g. http://localhost:9000)'),
  RUSTFS_REGION: z.string().min(1).default('us-east-1'),
  RUSTFS_ACCESS_KEY: z.string().min(1, 'RUSTFS_ACCESS_KEY must be set'),
  RUSTFS_SECRET_KEY: z.string().min(1, 'RUSTFS_SECRET_KEY must be set'),
  RUSTFS_BUCKET: z.string().min(1, 'RUSTFS_BUCKET must be set'),
  UPLOAD_ALLOWED_URL_HOSTS: z.string().optional(),
  RUSTFS_PUBLIC_URL: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.string().url('RUSTFS_PUBLIC_URL must be a valid URL').optional(),
  ),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().default('./firebase-service-account.json'),
  RESEND_API_KEY: z.string().optional(),
  MAPBOX_ACCESS_TOKEN: z.string().optional(),
  ENABLE_WORKER: z
    .preprocess((val) => String(val).toLowerCase() !== 'false', z.boolean())
    .default(true),
  BULKGATE_APPLICATION_ID: z.string().optional(),
  BULKGATE_APPLICATION_TOKEN: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
  GOOGLE_IOS_CLIENT_ID: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional().default(''),
  APPLE_BUNDLE_ID: z.string().optional().default(''),
  APPLE_DEMO_MODE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
  ADMIN_FRONTEND_URL: z.string().optional().default('http://localhost:3000/admin'),
});

const envSchema = envObject.superRefine((data, ctx) => {
  if (data.NODE_ENV !== 'production') return;

  const fail = (path: keyof typeof data, message: string): void => {
    ctx.addIssue({ code: 'custom', path: [path], message });
  };

  if (!data.JWT_ACCESS_SECRET) {
    fail('JWT_ACCESS_SECRET', 'JWT_ACCESS_SECRET must be set explicitly in production');
  }
  for (const key of ['JWT_SECRET', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = data[key];
    if (value && looksLikePlaceholder(value)) {
      fail(key, `${key} looks like a placeholder/dev value; generate a real random secret`);
    }
  }

  // for (const key of ['APPLE_CLIENT_ID', 'APPLE_BUNDLE_ID'] as const) {
  //   if (!data[key] || data[key].toLowerCase().includes('.demo')) {
  //     fail(
  //       key,
  //       `${key} must be set to your real Apple identifier in production (not the demo value)`,
  //     );
  //   }
  // }

  try {
    const { hostname } = new URL(data.ADMIN_FRONTEND_URL);
    if (LOCAL_HOSTNAMES.has(hostname.toLowerCase())) {
      fail('ADMIN_FRONTEND_URL', 'ADMIN_FRONTEND_URL must not point to localhost in production');
    }
  } catch {
    fail('ADMIN_FRONTEND_URL', 'ADMIN_FRONTEND_URL must be a valid absolute URL');
  }
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables detected:');
  console.error(z.flattenError(parsedEnv.error).fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
