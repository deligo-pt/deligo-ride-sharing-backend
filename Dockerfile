# ── Stage 1: Base Runtime ───────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Stage 2: Full Dependencies (Build & Test) ───────────────────────────
FROM base AS dependencies
COPY package*.json ./
RUN npm ci

# ── Stage 3: TypeScript & Client Builder ────────────────────────────────
FROM dependencies AS builder
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

# ── Stage 4: Production Runtime Dependencies ────────────────────────────
FROM base AS prod-deps
COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev --ignore-scripts && npx prisma generate

# ── Stage 5: Hardened Production Runner ──────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Switch to built-in non-root node user (UID: 1000, GID: 1000)
USER node

# Copy optimized build outputs and isolated production dependencies
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node package.json ./

EXPOSE 3000

# Signal handling PID 1 init wrapper
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]

