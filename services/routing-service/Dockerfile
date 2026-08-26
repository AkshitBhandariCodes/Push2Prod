################################################################################
# Routing Service â€” Dockerfile
#
# YE SERVICE KYA KARTA HAI:
#   Subdomain routing â€” <slug>.localhost:4002 â†’ S3 artifacts serve karta hai
#   Redis cache use karta hai slug â†’ S3 prefix mapping ke liye
#
# BUILD COMMAND (project root se):
#   docker build -t push2prod/routing-service -f services/routing-service/Dockerfile .
################################################################################

# ==============================================================================
# BASE STAGE: Shared setup to avoid redundant npm installs
# ==============================================================================
FROM node:22-alpine AS base
WORKDIR /app
# Install OpenSSL for Prisma engine compatibility on Alpine Linux
RUN apk add --no-cache openssl
RUN corepack enable pnpm && corepack prepare pnpm@10.10.0 --activate

# ==============================================================================
# STAGE 1: deps-installer
# ==============================================================================
FROM base AS deps-installer

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY services/routing-service/package.json ./services/routing-service/package.json

RUN pnpm install --frozen-lockfile --filter @push2prod/routing-service...

FROM deps-installer AS builder
COPY packages/config/src ./packages/config/src
COPY packages/config/tsconfig.json ./packages/config/tsconfig.json
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/db/prisma ./packages/db/prisma
COPY packages/logger/src ./packages/logger/src
COPY packages/logger/tsconfig.json ./packages/logger/tsconfig.json
COPY services/routing-service/src ./services/routing-service/src
COPY services/routing-service/tsconfig.json ./services/routing-service/tsconfig.json

RUN cd packages/db && pnpm exec prisma generate
RUN cd packages/config && pnpm run build
RUN cd packages/logger && pnpm run build
RUN cd packages/db && pnpm exec tsc
RUN cd services/routing-service && pnpm run build

FROM base AS runner

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup --no-create-home appuser

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/routing-service/dist ./services/routing-service/dist
COPY --from=builder /app/services/routing-service/node_modules ./services/routing-service/node_modules

USER appuser

# Port 4002 â€” routing service ka default port
EXPOSE 4002

CMD ["node", "services/routing-service/dist/index.js"]
