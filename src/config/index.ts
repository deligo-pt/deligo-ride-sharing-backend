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
  
  database: {
    url: env.DATABASE_URL,
  },
  
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },
  
  bcrypt: {
    saltRounds: env.BCRYPT_SALT_ROUNDS,
  },
  
  cors: {
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()),
  },
} as const;

export type AppConfig = typeof config;
