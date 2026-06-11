import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Extended Prisma Client (Prisma 7 + pg adapter + Soft Delete)
//
// This module exports a Prisma Client extended with a global soft-delete
// extension.  All service files import from this module — NO service should
// instantiate PrismaClient directly.
//
// Soft-delete behaviour (applied to $allModels):
//   • delete      → update  { isDeleted: true, deletedAt: now() }
//   • deleteMany  → updateMany { isDeleted: true, deletedAt: now() }
//   • findUnique / findFirst / findMany / count
//                → automatically inject { isDeleted: false } into `where`
//                  unless the caller explicitly passes { isDeleted: true }
//                  (allows admins / audit queries to surface deleted records).
//
// The global variable trick prevents hot-reload from creating multiple pool
// connections.  In production the module cache handles the singleton naturally.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Merges `{ isDeleted: false }` into an existing `where` clause, but only
 * when the caller has NOT explicitly requested `isDeleted: true` (audit mode).
 */
function withNotDeleted(args: Record<string, unknown>): Record<string, unknown> {
  const where = (args.where ?? {}) as Record<string, unknown>;
  // Respect an explicit audit override: isDeleted: true means "show me deleted records"
  if (where['isDeleted'] === true) return args;
  return { ...args, where: { ...where, isDeleted: false } };
}

// ── Extension ─────────────────────────────────────────────────────────────────

const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      // ── Intercept hard-delete and convert to a soft update ─────────────────
      async delete({ model, operation, args, query }) {
        void operation; // unused – satisfies TypeScript
        void model;
        return (query as (args: unknown) => Promise<unknown>).call(
          { model },
          {
            ...args,
            data: { isDeleted: true, deletedAt: new Date() },
          },
        ) as ReturnType<typeof query>;
      },

      async deleteMany({ model, operation, args, query }) {
        void operation;
        void model;
        return (query as (args: unknown) => Promise<unknown>).call(
          { model },
          {
            ...args,
            data: { isDeleted: true, deletedAt: new Date() },
          },
        ) as ReturnType<typeof query>;
      },

      // ── Inject isDeleted: false into read operations ───────────────────────
      async findUnique({ model, operation, args, query }) {
        void model;
        void operation;
        return query(withNotDeleted(args as Record<string, unknown>) as typeof args);
      },

      async findFirst({ model, operation, args, query }) {
        void model;
        void operation;
        return query(withNotDeleted(args as Record<string, unknown>) as typeof args);
      },

      async findMany({ model, operation, args, query }) {
        void model;
        void operation;
        return query(withNotDeleted(args as Record<string, unknown>) as typeof args);
      },

      async count({ model, operation, args, query }) {
        void model;
        void operation;
        return query(withNotDeleted(args as Record<string, unknown>) as typeof args);
      },
    },
  },
});

// ── Derive the extended type so the global declaration stays accurate ─────────
// We instantiate a throwaway bare client solely for type inference — it is
// never connected and never exported. This avoids the circular self-reference
// that occurs when you write `type T = ReturnType<typeof fnThatReturnsT>`.
const _typeBase = new PrismaClient();
type ExtendedPrismaClient = typeof _typeBase extends PrismaClient
  ? ReturnType<(base: typeof _typeBase) => ReturnType<typeof _typeBase.$extends>>
  : never;

// The concrete helper used at runtime:
function buildExtendedClient(base: PrismaClient) {
  return base.$extends(softDeleteExtension);
}

// ── Global singleton declaration ──────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __prisma: ExtendedPrismaClient | undefined;
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createPrismaClient(): ExtendedPrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  const base = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error'],
  });
  return buildExtendedClient(base);
}

const prisma: ExtendedPrismaClient = global.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export default prisma;
export type { ExtendedPrismaClient };
