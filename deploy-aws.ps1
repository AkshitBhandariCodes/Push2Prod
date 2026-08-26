# Push2Prod: AWS Real Deployment Script
# ----------------------------------------
# Ye script Push2Prod ko local MinIO ki jagah tumhare REAL AWS S3 account par point karegi.
# Tumhara baaki sab kuch (Database, Redis) local rahega, but Build Artifacts seedha real cloud mein upload honge!

param (
    [Parameter(Mandatory=$true)][string]$AccessKey,
    [Parameter(Mandatory=$true)][string]$SecretKey,
    [Parameter(Mandatory=$true)][string]$Region,
    [Parameter(Mandatory=$true)][string]$BucketName
)

Write-Host "ðŸš€ Starting Push2Prod with Real AWS S3 Backend..." -ForegroundColor Cyan

# Set AWS environment variables (Node.js will inherit these and they will override .env)
$env:S3_ENDPOINT = "https://s3.$Region.amazonaws.com"
$env:S3_REGION = $Region
$env:S3_ACCESS_KEY = $AccessKey
$env:S3_SECRET_KEY = $SecretKey
$env:S3_BUCKET_NAME = $BucketName
# AWS Native S3 uses virtual-hosted style paths by default, so we disable force path style
$env:S3_FORCE_PATH_STYLE = "false"

Write-Host "âœ… AWS Environment Configured!" -ForegroundColor Green
Write-Host "Endpoint: $env:S3_ENDPOINT" -ForegroundColor DarkGray
Write-Host "Bucket: $env:S3_BUCKET_NAME" -ForegroundColor DarkGray

Write-Host "`nStarting services using pnpm dev..." -ForegroundColor Yellow
# Run the main dev command
pnpm dev
