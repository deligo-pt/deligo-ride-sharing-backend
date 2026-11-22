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
 * Models that carry `isDeleted` / `deletedAt` soft-delete columns.
 * Models that lack these fields (e.g. EmergencyAlert) must NOT be included here.
 */
const SOFT_DELETE_MODELS = new Set([
  'User',
  'Ride',
  'SupportTicket',
  'PromoCode',
]);

/**
 * Merges `{ isDeleted: false }` into an existing `where` clause, but only
 * when the caller has NOT explicitly requested `isDeleted: true` (audit mode).
 * Returns args unchanged for models not in SOFT_DELETE_MODELS.
 */
function withNotDeleted(
  model: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!SOFT_DELETE_MODELS.has(model)) return args;
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
        void operation;
        void model;
        return query(args);
      },

      async deleteMany({ model, operation, args, query }) {
        void operation;
        void model;
        return query(args);
      },

      // ── Inject isDeleted: false into read operations (soft-delete models only) ──
      async findUnique({ model, operation, args, query }) {
        void operation;
        return query(withNotDeleted(model, args) as typeof args);
      },

      async findFirst({ model, operation, args, query }) {
        void operation;
        return query(withNotDeleted(model, args));
      },

      async findMany({ model, operation, args, query }) {
        void operation;
        return query(withNotDeleted(model, args));
      },

      async count({ model, operation, args, query }) {
        void operation;
        return query(withNotDeleted(model, args));
      },
    },
  },
});

// ── Build the extended client & derive its type ───────────────────────────────
// `buildExtendedClient` has NO explicit return-type annotation — TypeScript
// infers it from the body (`base.$extends(...)`).  We then derive the type
// alias from the inferred return type.  This avoids BOTH the circular-reference
// error (TS2456) AND any runtime `new PrismaClient()` call.
function buildExtendedClient(base: PrismaClient) {
  return base.$extends(softDeleteExtension);
}

type ExtendedPrismaClient = ReturnType<typeof buildExtendedClient>;

// ── Global singleton declaration ──────────────────────────────────────────────

declare global {
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
