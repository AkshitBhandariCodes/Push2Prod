# Phase 5, 6, and 7: Build Controller & Worker Reliability

This document outlines the implementation details for the `build-controller` service which handles background build processing, GitHub cloning, and real build execution for Push2Prod.

## Overview
We introduced a new backend microservice called `build-controller`. This service acts as a background worker that consumes build events from a Redis Stream (`build-events`) and processes deployments asynchronously.

## Features Implemented

### 1. Worker Reliability (Phase 5)
- **Redis Consumer Groups**: The worker connects to Redis and uses `XREADGROUP` to ensure each build job is processed by only one worker instance.
- **Idempotency**: Workers lock a deployment in the PostgreSQL database using the `lockedBy` and `lockedUntil` fields. This prevents duplicate processing.
- **Crash Recovery**: If a worker crashes mid-build, the deployment remains in the `QUEUED` state. Another worker will eventually pick it up using `XAUTOCLAIM`.
- **Max Retries**: The `attemptCount` field in the `Deployment` model tracks retries. If a deployment fails more than 3 times, its status is updated to `ERROR` (Dead Letter state).

### 2. Real GitHub Clone (Phase 6)
- **Temporary Workspace**: For every deployment, the worker creates a temporary workspace at `/tmp/push2prod-builds/{deploymentId}`.
- **simple-git**: The worker uses `simple-git` to clone the target repository and checkout the specific branch.
- **Validation**: Ensures the configured `rootDir` exists inside the repository before proceeding.

### 3. Real Build Execution (Phase 7)
- **NPM Integration**: The worker detects the `package.json` and executes `npm install` followed by the user-configured `buildCommand`.
- **Output Directory Validation**: After the build completes, the worker checks if the `outputDir` (e.g., `dist` or `.next`) was successfully generated.
- **Log Streaming**: The stdout/stderr from the build commands are captured and saved to the `BuildLog` and `BuildEvent` tables in PostgreSQL, which the frontend polls for real-time log display.
- **Automatic Cleanup**: Regardless of success or failure, the temporary workspace is deleted to prevent disk overflow.

## How to Run the Worker
The worker is part of the Turborepo workspace. When you run `pnpm dev` from the root, it automatically starts alongside the API and frontend.

To run it individually:
```bash
pnpm --filter @push2prod/build-controller dev
```

## Database Schema Additions
```prisma
model Deployment {
  // ...existing fields
  attemptCount  Int              @default(0)
  lockedBy      String?          
  lockedUntil   DateTime?        
  lastError     String?          
}
```

## Frontend Integration
The frontend project details page (`/projects/[id]`) was updated to display:
- Attempt counts for retried builds.
- The Worker ID that locked the job.
- Error states explicitly.
- A sliding "View Logs" panel that polls `/deployments/:id/logs` to show terminal-style output.
