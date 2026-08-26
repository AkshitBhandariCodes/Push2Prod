################################################################################
# API Gateway â€” Dockerfile
#
# YE SERVICE KYA KARTA HAI:
#   Saare frontend requests ka single entry point
#   Auth verify karta hai, phir downstream services pe proxy karta hai
#
# BUILD COMMAND (project root se):
#   docker build -t push2prod/api-gateway -f apps/api-gateway/Dockerfile .
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
COPY apps/api-gateway/package.json ./apps/api-gateway/package.json

RUN pnpm install --frozen-lockfile --filter @push2prod/api-gateway...

FROM deps-installer AS builder
COPY packages/config/src ./packages/config/src
COPY packages/config/tsconfig.json ./packages/config/tsconfig.json
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/db/prisma ./packages/db/prisma
COPY packages/logger/src ./packages/logger/src
COPY packages/logger/tsconfig.json ./packages/logger/tsconfig.json
COPY apps/api-gateway/src ./apps/api-gateway/src
COPY apps/api-gateway/tsconfig.json ./apps/api-gateway/tsconfig.json

RUN cd packages/db && pnpm exec prisma generate
RUN cd packages/config && pnpm run build
RUN cd packages/logger && pnpm run build
RUN cd packages/db && pnpm exec tsc
RUN cd apps/api-gateway && pnpm run build

FROM base AS runner

RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup --no-create-home appuser

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=builder /app/apps/api-gateway/node_modules ./apps/api-gateway/node_modules

USER appuser

# Port 4000 â€” API gateway ka default port
EXPOSE 4000

CMD ["node", "apps/api-gateway/dist/index.js"]
