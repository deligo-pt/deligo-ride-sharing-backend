import 'dotenv/config';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Environment Variable Validation
//
// All required environment variables are validated at startup.
// The app will crash with a descriptive error if any are missing,
// preventing silent failures in misconfigured environments.
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL must be set'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_REFRESH_EXPIRES_IN_DEFAULT: z.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN_REMEMBER: z.string().default('30d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().min(10).max(14).default(12),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  // OTP & Signup Session
  OTP_EXPIRES_IN_SECONDS: z.coerce.number().default(300),
  SIGNUP_SESSION_TTL_SECONDS: z.coerce.number().default(900),
  // SMTP / Nodemailer
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM_NAME: z.string().default('Deligo Ride'),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@deligo.com'),
  // Cloudinary — document storage for KYC uploads
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME must be set'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY must be set'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET must be set'),
  // Redis — geospatial driver location tracking
  REDIS_URL: z.string().default('redis://localhost:6379'),
  // Firebase Admin — push notifications
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().default('./firebase-service-account.json'),
  // BulkGate — transactional SMS gateway
  // Obtain from https://portal.bulkgate.com → Administration → Applications
  BULKGATE_APPLICATION_ID: z.string().optional(),
  BULKGATE_APPLICATION_TOKEN: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables detected:');
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
