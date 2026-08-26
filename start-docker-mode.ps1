# ==============================================================================
# PROD2PUSH - DOCKER-IN-DOCKER MODE SETUP SCRIPT
# Run this to start the platform using Docker Compose
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor Green
Write-Host "    STARTING PROD2PUSH IN DOCKER-IN-DOCKER MODE" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green

# 1. Clean up previous instances
Write-Host "[1/6] Cleaning up previous containers..." -ForegroundColor Yellow
docker compose down -v 2>$null | Out-Null
docker ps -aq | ForEach-Object { docker rm -f $_ } 2>$null | Out-Null

# 2. Build the build-runner image locally (crucial for DinD)
Write-Host "[2/6] Building the 'build-runner' image locally..." -ForegroundColor Yellow
docker build -t prod2push/build-runner:latest -f services/build-runner/Dockerfile .

# 3. Start Infrastructure
Write-Host "[3/6] Starting Infrastructure (Postgres, Redis, MinIO)..." -ForegroundColor Yellow
docker compose up -d postgres redis minio

Write-Host "      Waiting for PostgreSQL to be ready..." -ForegroundColor DarkGray
Start-Sleep -Seconds 10

# 4. Database Migrations
Write-Host "[4/6] Running Prisma Database Schema Push..." -ForegroundColor Yellow
# Using a temporary node container on the same network to run prisma migrations
docker run --rm --network prod2push-internal -v "${PWD}/packages/db/prisma:/prisma" node:22 sh -c "npm install -g prisma@5.22.0 --quiet && DATABASE_URL='postgresql://postgres:postgres@postgres:5432/prod2push' prisma db push --schema=/prisma/schema.prisma --accept-data-loss --skip-generate"

# 5. Start the rest of the application
Write-Host "[5/6] Building and Starting Applications..." -ForegroundColor Yellow
docker compose up -d --build

Write-Host "[6/6] Gathering Access URLs..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  DOCKER-IN-DOCKER PLATFORM IS READY!" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green

Write-Host "DASHBOARDS AND UI:" -ForegroundColor Cyan
Write-Host "   Frontend Web App   : http://localhost:3000"
Write-Host "   API Gateway        : http://localhost:4000"
Write-Host "   Routing Service    : http://localhost:4002"
Write-Host "   MinIO Web Console  : http://localhost:9001"
Write-Host "      (Login: minioadmin / Password: minioadmin)"

Write-Host "`nBACKEND AND WORKERS:" -ForegroundColor Cyan
Write-Host "   PostgreSQL         : localhost:5433"
Write-Host "   Build Controller   : Running (Monitoring Redis Stream)"
Write-Host "   Docker.sock        : Mounted (DinD Enabled)"
Write-Host "`nTo view logs run: docker compose logs -f" -ForegroundColor DarkGray
Write-Host "============================================================`n" -ForegroundColor Green
