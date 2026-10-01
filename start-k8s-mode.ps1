# ==============================================================================
# PROD2PUSH - KUBERNETES MODE SETUP SCRIPT
# Run this to start the platform using Minikube, Helm, and K8s Manifests
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor Green
Write-Host "    STARTING FULL KUBERNETES PLATFORM STACK" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green

# 1. Start Minikube
Write-Host "[1/8] Starting Minikube..." -ForegroundColor Yellow
minikube delete 2>$null | Out-Null
minikube start --driver=docker --cpus=3 --memory=3000 --disk-size=30g --docker-env dns=8.8.8.8
$MINIKUBE_IP = minikube ip

# 2. Helm Repositories
Write-Host "[2/8] Adding/Updating Helm Repos..." -ForegroundColor Yellow
helm repo add bitnami https://charts.bitnami.com/bitnami | Out-Null
helm repo add headlamp https://kubernetes-sigs.github.io/headlamp/ | Out-Null
helm repo add kyverno https://kyverno.github.io/kyverno/ | Out-Null
helm repo update | Out-Null

# 3. Install Core Infrastructure (Helm)
Write-Host "[3/8] Installing Infrastructure via Helm..." -ForegroundColor Yellow
helm upgrade --install headlamp headlamp/headlamp --namespace kube-system --set service.type=NodePort
helm upgrade --install kyverno kyverno/kyverno --namespace kyverno --create-namespace
helm upgrade --install postgres bitnami/postgresql --namespace default --set auth.postgresPassword=postgres,auth.database=prod2push,service.type=NodePort
helm upgrade --install minio bitnami/minio --namespace default --set auth.rootUser=minioadmin,auth.rootPassword=minioadmin,service.type=NodePort,service.consoleType=NodePort

# 4. Build Images directly into Minikube
Write-Host "[4/8] Building Docker Images inside Minikube..." -ForegroundColor Yellow
& minikube -p minikube docker-env | Invoke-Expression

docker build -t push2prod/build-runner:latest -f services/build-runner/Dockerfile .
docker build -t push2prod/build-controller:latest -f services/build-controller/Dockerfile .
docker build -t push2prod/project-service:latest -f services/project-service/Dockerfile .
docker build -t push2prod/routing-service:latest -f services/routing-service/Dockerfile .
docker build -t push2prod/api-gateway:latest -f apps/api-gateway/Dockerfile .
docker build -t push2prod/web:latest -f apps/web/Dockerfile .

# 5. Clean up local docker-compose
Write-Host "[5/8] Stopping any conflicting local containers..." -ForegroundColor Yellow
docker compose down 2>$null | Out-Null

# 6. Database Migration (Prisma via Port-Forward)
Write-Host "[6/8] Running Prisma Database Schema Push..." -ForegroundColor Yellow
Write-Host "      Waiting 10s for Postgres pod to be ready..." -ForegroundColor DarkGray
Start-Sleep -Seconds 10
Write-Host "      Starting temporary Port-Forward for Postgres..." -ForegroundColor DarkGray
$pfJob = Start-Job { kubectl port-forward svc/postgres-postgresql 5432:5432 -n default }
Start-Sleep -Seconds 5

$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/prod2push"
if (Test-Path "packages/db/package.json") {
    Push-Location packages/db
    npx prisma db push --accept-data-loss
    npx prisma generate
    Pop-Location
} else {
    Write-Host "      Warning: packages/db not found. Skipping migrations." -ForegroundColor Red
}

Stop-Job -Job $pfJob | Out-Null
Remove-Job -Job $pfJob | Out-Null

# 7. Apply Kubernetes Manifests
Write-Host "[7/8] Applying Custom Kubernetes Manifests..." -ForegroundColor Yellow
if (Test-Path "infra/k8s") {
    kubectl apply -f infra/k8s/namespace.yaml
    kubectl apply -f infra/k8s/
}

# 8. Gathering URLs
Write-Host "[8/8] Gathering Access URLs..." -ForegroundColor Yellow
$HEADLAMP_PORT = kubectl get svc headlamp -n kube-system -o jsonpath="{.spec.ports[0].nodePort}"
$MINIO_UI_PORT = ""
try {
    $MINIO_UI_PORT = kubectl get svc minio-console -n default -o jsonpath="{.spec.ports[0].nodePort}" 2>$null
    if (-not $MINIO_UI_PORT) { $MINIO_UI_PORT = "Run 'kubectl port-forward svc/minio-console 9090:9090' to access" }
} catch {
    $MINIO_UI_PORT = "Run 'kubectl port-forward svc/minio-console 9090:9090' to access"
}
$MINIO_API_PORT = kubectl get svc minio -n default -o jsonpath="{.spec.ports[0].nodePort}"
$FRONTEND_PORT = ""
try {
    $FRONTEND_PORT = kubectl get svc frontend-service -n push2prod -o jsonpath="{.spec.ports[0].nodePort}" 2>$null
} catch {}

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "  KUBERNETES PLATFORM IS READY!" -ForegroundColor Green
Write-Host "============================================================`n" -ForegroundColor Green

Write-Host "DASHBOARDS AND UI:" -ForegroundColor Cyan
Write-Host "   Headlamp Dashboard : http://${MINIKUBE_IP}:${HEADLAMP_PORT}"
Write-Host "   MinIO Web Console  : http://${MINIKUBE_IP}:${MINIO_UI_PORT}"
if ($FRONTEND_PORT) {
    Write-Host "   Frontend App       : http://${MINIKUBE_IP}:${FRONTEND_PORT}"
} else {
    Write-Host "   Frontend App       : Run 'minikube service frontend-service -n push2prod --url' to get the URL"
}

Write-Host "`nBACKEND AND APIS:" -ForegroundColor Cyan
$POSTGRES_NODEPORT = kubectl get svc postgres-postgresql -n default -o jsonpath="{.spec.ports[0].nodePort}"
Write-Host "   PostgreSQL URL     : postgresql://postgres:postgres@${MINIKUBE_IP}:${POSTGRES_NODEPORT}/prod2push"
Write-Host "   MinIO S3 API       : http://${MINIKUBE_IP}:${MINIO_API_PORT}"
Write-Host "   Kyverno Engine     : Running internally"
Write-Host "`n============================================================`n" -ForegroundColor Green
