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
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().min(10).max(14).default(12),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  // Cloudinary — document storage for KYC uploads
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME must be set'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY must be set'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET must be set'),
  // Redis — geospatial driver location tracking
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables detected:');
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
