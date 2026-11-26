
# ── Stage 1: Base Runtime ───────────────────────────────────────────────
FROM node:22-bookworm-slim AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ARG PNPM_VERSION=11
RUN npm install -g pnpm@${PNPM_VERSION}


# ── Stage 2: Full Dependencies ──────────────────────────────────────────
FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile


# ── Stage 3: Dedicated Migration Runtime ────────────────────────────────
FROM dependencies AS migration

COPY prisma.config.ts ./
COPY prisma ./prisma

# Keep Prisma CLI and development dependencies available.
# Migration only needs the schema and CLI; Client generation
# is handled in the builder/prod-deps stages.


# ── Stage 4: TypeScript & Application Builder ───────────────────────────
FROM dependencies AS builder

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma

RUN pnpm exec prisma generate

COPY src ./src

RUN npm run build


# ── Stage 5: Production Runtime Dependencies ────────────────────────────
FROM base AS prod-deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma.config.ts ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile --ignore-scripts \
    && pnpm exec prisma generate \
    && pnpm prune --prod --ignore-scripts


# ── Stage 6: Hardened Production Runner ─────────────────────────────────
FROM base AS runner

ENV NODE_ENV=production

WORKDIR /app

USER node

COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/src/templates ./src/templates

EXPOSE 3000

ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "dist/server.js"]
