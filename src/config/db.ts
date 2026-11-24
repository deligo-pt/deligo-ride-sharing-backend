import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './index';

const SOFT_DELETE_MODELS = new Set(['User', 'Ride', 'SupportTicket', 'PromoCode']);

function withNotDeleted(model: string, args: Record<string, unknown>): Record<string, unknown> {
  if (!SOFT_DELETE_MODELS.has(model)) return args;
  const where = (args.where ?? {}) as Record<string, unknown>;
  if (where['isDeleted'] === true) return args;
  return { ...args, where: { ...where, isDeleted: false } };
}

const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
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

function buildExtendedClient(base: PrismaClient) {
  return base.$extends(softDeleteExtension);
}

type ExtendedPrismaClient = ReturnType<typeof buildExtendedClient>;

declare global {
  var __prisma: ExtendedPrismaClient | undefined;
}

function createPrismaClient(): ExtendedPrismaClient {
  const adapter = new PrismaPg({ connectionString: config.database.url });
  const base = new PrismaClient({
    adapter,
    log: config.isDevelopment ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });
  return buildExtendedClient(base);
}

const prisma: ExtendedPrismaClient = global.__prisma ?? createPrismaClient();

if (!config.isProduction) {
  global.__prisma = prisma;
}

export default prisma;
export type { ExtendedPrismaClient };
