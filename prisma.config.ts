import path from 'node:path';
import { defineConfig } from 'prisma/config';
import 'dotenv/config';

// ─────────────────────────────────────────────────────────────────────────────
// Prisma 7 Configuration File
//
// In Prisma 7, the database connection URL is no longer specified in the
// schema.prisma datasource block. It is configured here in prisma.config.ts
// and passed to the PrismaClient constructor in the db singleton (src/config/db.ts).
//
// See: https://pris.ly/d/config-datasource
//      https://pris.ly/d/prisma7-client-config
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set');
      }
      return new PrismaPg({ connectionString });
    },
  },
});
