################################################################################
# Build Controller — Dockerfile
#
# YE SERVICE KYA KARTA HAI:
#   Redis Stream consumer — XREADGROUP se build events utha ta hai
#   Docker socket ya K8s API use karke build-runner containers spawn karta hai
#
# IMPORTANT: Docker-in-Docker ke liye host ka docker.sock mount karna padega
#   docker run -v /var/run/docker.sock:/var/run/docker.sock vercel-pro/build-controller
#   Ya compose mein volumes section mein likha hai
#
# BUILD COMMAND (project root se):
#   docker build -t vercel-pro/build-controller -f services/build-controller/Dockerfile .
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
COPY services/build-controller/package.json ./services/build-controller/package.json

RUN pnpm install --frozen-lockfile --filter @push2prod/build-controller...

FROM deps-installer AS builder
COPY packages/config/src ./packages/config/src
COPY packages/config/tsconfig.json ./packages/config/tsconfig.json
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/db/prisma ./packages/db/prisma
COPY packages/logger/src ./packages/logger/src
COPY packages/logger/tsconfig.json ./packages/logger/tsconfig.json
COPY services/build-controller/src ./services/build-controller/src
COPY services/build-controller/tsconfig.json ./services/build-controller/tsconfig.json

RUN cd packages/db && pnpm exec prisma generate
RUN cd packages/config && pnpm run build
RUN cd packages/logger && pnpm run build
RUN cd packages/db && pnpm exec tsc
RUN cd services/build-controller && pnpm run build

FROM base AS runner

# docker CLI install karo — build-runner containers spawn karne ke liye
# Docker CLI aur Docker daemon alag hote hain — CLI sirf commands bhejta hai
RUN apk add --no-cache docker-cli

# Non-root user — lekin docker group mein add karo (docker.sock access ke liye)
# Note: docker group ka GID 999 standard hai
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup --no-create-home appuser && \
    addgroup appuser docker 2>/dev/null || true

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/build-controller/dist ./services/build-controller/dist
COPY --from=builder /app/services/build-controller/node_modules ./services/build-controller/node_modules

# Build controller koi port expose nahi karta — sirf background worker hai
# Docker socket ka access compose/K8s se aata hai (volume mount)
# Docker socket permission issues avoid karne ke liye root use kar rahe hain
USER root

CMD ["node", "services/build-controller/dist/index.js"]
