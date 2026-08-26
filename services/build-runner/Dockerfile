################################################################################
# Build Runner — Multi-Stage Dockerfile
# 
# YE KYA HAI:
#   Ye isolated build environment hai jahan untrusted user code chalega.
#   Host machine pe seedha code run karna unsafe hai — isliye ye container banaya.
#
# SECURITY FEATURES:
#   1. Multi-stage build — sirf zaruri files final image mein jaati hain
#   2. Rootless user — 'builduser' naam ka non-root user banaya gaya hai
#   3. --cap-drop=ALL via compose/K8s — all Linux capabilities stripped
#
# BUILD COMMAND (project root se chalao):
#   docker build -t vercel-pro/build-runner -f services/build-runner/Dockerfile .
################################################################################

# ==============================================================================
# BASE STAGE: Shared setup to avoid redundant npm installs
# ==============================================================================
FROM node:22-alpine AS base
WORKDIR /app
# Install OpenSSL for Prisma engine compatibility on Alpine Linux
RUN apk add --no-cache openssl
# Enable Corepack and pre-install the exact pnpm version to avoid runtime downloads
RUN corepack enable pnpm && corepack prepare pnpm@10.10.0 --activate

# ==============================================================================
# STAGE 1: deps-installer
# Sirf dependencies install karta hai — yahan workspace packages bhi chahiye
# ==============================================================================
FROM base AS deps-installer

# Pehle monorepo ke root package.json aur workspace config copy karo
# (ye cache layer optimize karta hai — source code change hone pe ye layer rebuild nahi hogi)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Shared packages copy karo (build-runner inhe use karta hai)
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/logger/package.json ./packages/logger/package.json

# Build runner ka package.json copy karo
COPY services/build-runner/package.json ./services/build-runner/package.json

# Dependencies install karo (workspace ke andar sirf build-runner aur uske deps)
RUN pnpm install --frozen-lockfile --filter @push2prod/build-runner...

# ==============================================================================
# STAGE 2: builder
# TypeScript ko JavaScript mein compile karta hai
# ==============================================================================
FROM deps-installer AS builder

# Shared packages ka source copy karo
COPY packages/config/src ./packages/config/src
COPY packages/config/tsconfig.json ./packages/config/tsconfig.json

COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/db/prisma ./packages/db/prisma

COPY packages/logger/src ./packages/logger/src
COPY packages/logger/tsconfig.json ./packages/logger/tsconfig.json

# Build runner ka source copy karo
COPY services/build-runner/src ./services/build-runner/src
COPY services/build-runner/tsconfig.json ./services/build-runner/tsconfig.json

# Prisma client generate karo (DB types ke liye)
RUN cd packages/db && pnpm exec prisma generate

# Compile shared packages first (so build-runner can resolve them)
RUN cd packages/config && pnpm run build
RUN cd packages/logger && pnpm run build
RUN cd packages/db && pnpm exec tsc

# TypeScript compile karo (pnpm turbo ya direct tsc)
RUN cd services/build-runner && pnpm run build

FROM base AS runner

# =============================================================================
# SECURITY: Non-root user banana (Container breakout prevention)
# Agar koi malicious code container ke andar chal bhi jaaye, wo root nahi hoga
# isliye host filesystem ya other containers ko affect nahi kar sakta
# =============================================================================
RUN addgroup --system --gid 1001 buildgroup && \
    adduser --system --uid 1001 --ingroup buildgroup builduser

# git install karo — repository clone karne ke liye
RUN apk add --no-cache git

# node_modules aur compiled output copy karo (builder stage se)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/build-runner/dist ./services/build-runner/dist
COPY --from=builder /app/services/build-runner/node_modules ./services/build-runner/node_modules

# =============================================================================
# SECURITY: Ab root se switch karo non-root builduser pe
# Iske baad sab operations is limited user ke context mein honge
# =============================================================================
USER builduser

# Runner script ka entry point
CMD ["node", "services/build-runner/dist/runner.js"]
