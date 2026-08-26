################################################################################
# Next.js Web App â€” Dockerfile
#
# YE SERVICE KYA KARTA HAI:
#   Push2Prod ka frontend dashboard (Next.js App Router)
#   Login, Project creation, Deploy trigger, Logs viewer
#
# IMPORTANT: next.config.ts mein 'output: standalone' hona zaruri hai
#   Isse Docker image lean hogi (~200MB vs ~800MB)
#
# BUILD COMMAND (project root se):
#   docker build -t push2prod/web -f apps/web/Dockerfile .
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
COPY packages/db/package.json ./packages/db/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --frozen-lockfile --filter web...

# ==============================================================================
# STAGE 2: builder â€” Next.js build chalao
# 'output: standalone' wajah se .next/standalone folder create hoga
# ==============================================================================
FROM deps-installer AS builder
WORKDIR /app

# Prisma generate ke liye db package source chahiye
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/tsconfig.json
COPY packages/db/prisma ./packages/db/prisma

# Web app ka poora source copy karo
COPY apps/web ./apps/web

# Prisma client generate karo
RUN cd packages/db && pnpm exec prisma generate

# Compile packages/db so Next.js can resolve its 'main' entrypoint
RUN cd packages/db && pnpm exec tsc

# Next.js build karo â€” standalone output generate karega
# Build time env vars (placeholder values â€” runtime pe override hongi)
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/web && pnpm run build

# ==============================================================================
# STAGE 3: runner â€” Sirf standalone folder use karo
# Next.js standalone folder mein khud ka server.js hota hai
# node_modules copy karna nahi padta (traces automatically included hoti hain)
# ==============================================================================
FROM base AS runner
WORKDIR /app

# Telemetry disable karo (Next.js build stats report karna)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Standalone output copy karo
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

# PORT env var se dynamic port support
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone folder ka server.js directly run karo â€” no next start needed
CMD ["node", "apps/web/server.js"]
