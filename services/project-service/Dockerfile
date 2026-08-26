################################################################################
# Project Service â€” Dockerfile
#
# YE SERVICE KYA KARTA HAI:
#   Project CRUD (create/read/update/delete) + Deploy trigger endpoint
#   Redis Stream mein build events XADD karta hai
#
# BUILD COMMAND (project root se):
#   docker build -t push2prod/project-service -f services/project-service/Dockerfile .
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
# STAGE 1: deps-installer â€” Only install production + dev dependencies
# ==============================================================================
FROM base AS deps-installer

# Monorepo config files pehle copy karo (Docker cache optimization)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Sirf zaruri package.json files copy karo
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY services/project-service/package.json ./services/project-service/package.json

# Dependencies install karo (filter = only this service + its workspace deps)
RUN pnpm install --frozen-lockfile --filter @push2prod/project-service...

# ==============================================================================
# STAGE 2: builder â€” TypeScript compile karo
# ==============================================================================
FROM deps-installer AS builder

# Shared packages source copy karo
COPY packages/config/src ./packages/config/src
COPY packages/config/tsconfig.json ./packages/config/tsconfig.json
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/db/prisma ./packages/db/prisma
COPY packages/logger/src ./packages/logger/src
COPY packages/logger/tsconfig.json ./packages/logger/tsconfig.json
COPY packages/contracts/src ./packages/contracts/src
COPY packages/contracts/tsconfig.json ./packages/contracts/tsconfig.json

# Service source copy karo
COPY services/project-service/src ./services/project-service/src
COPY services/project-service/tsconfig.json ./services/project-service/tsconfig.json

RUN cd packages/db && pnpm exec prisma generate
RUN cd packages/config && pnpm run build
RUN cd packages/logger && pnpm run build
RUN cd packages/contracts && pnpm run build
RUN cd packages/db && pnpm exec tsc
RUN cd services/project-service && pnpm run build

# ==============================================================================
# STAGE 3: runner â€” Final lean production image
# ==============================================================================
FROM base AS runner

# Non-root user â€” security best practice
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup --no-create-home appuser

WORKDIR /app

# Compiled output aur node_modules copy karo
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/project-service/dist ./services/project-service/dist
COPY --from=builder /app/services/project-service/node_modules ./services/project-service/node_modules

USER appuser

EXPOSE 3002

CMD ["node", "services/project-service/dist/index.js"]
