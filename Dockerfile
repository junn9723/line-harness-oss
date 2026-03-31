# =============================================================================
# LINE Harness — Docker Single VPS Deployment
# Multi-stage build: API (Hono/Node.js) + Admin Dashboard (Next.js static)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Base — install dependencies
# ---------------------------------------------------------------------------
FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy workspace config and lockfile first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/line-sdk/package.json packages/line-sdk/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build — compile everything
# ---------------------------------------------------------------------------
FROM base AS build

# Copy all source code
COPY packages/ packages/
COPY apps/ apps/

# Build shared packages first, then worker and web
RUN pnpm --filter @line-crm/shared build && \
    pnpm --filter @line-crm/line-sdk build

# Build Node.js worker bundle
RUN cd apps/worker && pnpm build:node

# Build Next.js admin dashboard (static export)
ARG NEXT_PUBLIC_API_URL=http://localhost:8787
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN cd apps/web && pnpm build

# ---------------------------------------------------------------------------
# Stage 3: Runtime — minimal production image
# ---------------------------------------------------------------------------
FROM node:22-slim AS runtime

# Install tini for proper signal handling and build deps for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built worker bundle
COPY --from=build /app/apps/worker/dist-node/ ./dist-node/

# Install runtime dependencies (native modules that can't be bundled)
RUN npm init -y > /dev/null 2>&1 && \
    npm install --no-save better-sqlite3@11 node-cron@3 && \
    apt-get purge -y python3 make g++ && apt-get autoremove -y && \
    rm -rf /root/.npm /tmp/*

# Copy database schema for auto-migration
COPY packages/db/schema.sql ./packages/db/schema.sql

# Copy static admin dashboard
COPY --from=build /app/apps/web/out/ ./public/admin/

# Create data directories
RUN mkdir -p /app/data/images

# Non-root user for security
RUN groupadd -r harness && useradd -r -g harness -d /app harness && \
    chown -R harness:harness /app
USER harness

# Expose port
EXPOSE 8787

# Use tini for proper signal handling
ENTRYPOINT ["tini", "--"]

# Default command
CMD ["node", "dist-node/node-entry.js"]
