# System Architecture & Topology: Vercel-Pro (Push2Prod)

---

## 1. System Overview

**Vercel-Pro (Push2Prod)** is an automated continuous deployment and static site hosting platform. Developers connect their Git repositories or trigger builds via API. The platform spins up isolated ephemeral build containers (`build-runner`), packages static assets, deploys them to object storage (MinIO locally / AWS S3 in production), and serves them through high-performance reverse routing proxy (`routing-service`).

```mermaid
graph TD
    User["End User / Browser"]
    Dev["Developer"]
    
    subgraph Frontend_Gateway["Edge & Ingress Layer"]
        WebUI["Web Dashboard (apps/web)"]
        APIGateway["API Gateway (apps/api-gateway)"]
        Router["Routing Service (services/routing-service)"]
    end

    subgraph Core_Services["Control Plane"]
        AuthSvc["Auth Service (services/auth-service)"]
        ProjSvc["Project Service (services/project-service)"]
        BuildCtrl["Build Controller (services/build-controller)"]
        LogSvc["Log Service (services/log-service)"]
    end

    subgraph Data_Storage["Data & State Layer"]
        Postgres[("PostgreSQL\n(Projects, Deploys, Users)")]
        RedisQueue[("Redis Queue & PubSub\n(Build Jobs, Events)")]
        S3Storage[("Object Storage\n(MinIO / AWS S3)")]
    end

    subgraph Worker_Layer["Execution Plane"]
        K8sOrDocker["Build Runner\n(Ephemeral DinD / K8s Pod)"]
    end

    Dev -->|Manage Projects & Triggers| WebUI
    WebUI --> APIGateway
    APIGateway --> AuthSvc
    APIGateway --> ProjSvc
    ProjSvc --> Postgres
    ProjSvc -->|Enqueue Build Job| RedisQueue
    RedisQueue -->|Pull Build Job| BuildCtrl
    BuildCtrl -->|Spawn Ephemeral Container| K8sOrDocker
    K8sOrDocker -->|Git Clone & pnpm build| K8sOrDocker
    K8sOrDocker -->|Upload Artifacts (dist/)| S3Storage
    K8sOrDocker -->|Stream Logs| LogSvc
    BuildCtrl -->|Update Deploy Status| Postgres

    User -->|HTTP Request: project.subdomain.com| Router
    Router -->|Fetch Built Assets| S3Storage
    Router -->|Proxy HTML/JS/CSS| User
```

---

## 2. Component Responsibility Matrix

| Service / App | Tech Stack | Role & Responsibility | Key Dependencies |
| :--- | :--- | :--- | :--- |
| `apps/web` | Next.js / React | Developer dashboard for project management, deploy logs, and settings | `apps/api-gateway` |
| `apps/api-gateway` | Node.js / Express / Fastify | Unified entry point, auth verification, and request dispatching | `auth-service`, `project-service` |
| `services/project-service` | Node.js / TypeScript | CRUD for projects, deployment state machine, and Redis job publishing | PostgreSQL, Redis |
| `services/build-controller` | Node.js / TypeScript | Listens on Redis queue, orchestrates ephemeral `build-runner` execution | Redis, Docker Engine / K8s API |
| `services/build-runner` | Docker / Alpine / Node | Clones repo, runs build command, uploads output bundle to storage | Git, MinIO / S3 |
| `services/routing-service` | Node.js / HTTP Proxy | Multi-tenant reverse proxy mapping project subdomains to S3 objects | MinIO / S3, Redis cache |
| `services/log-service` | WebSockets / Redis | Live log streaming for running builds directly to developer browser | Redis PubSub, WebSockets |

---

## 3. End-to-End Build & Deployment Flow

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant UI as Web Dashboard
    participant API as API Gateway
    participant DB as PostgreSQL
    participant Redis as Redis Queue
    participant Ctrl as Build Controller
    participant Runner as Ephemeral Build Runner
    participant S3 as MinIO / AWS S3
    participant Proxy as Routing Service
    actor Visitor as Web Visitor

    Dev->>UI: Trigger Deployment (Branch / Commit)
    UI->>API: POST /projects/:id/deployments
    API->>DB: INSERT INTO deployments (status='QUEUED')
    API->>Redis: LPUSH build_queue {deploymentId, repoUrl, commit}
    API-->>UI: 202 Accepted {deploymentId}

    Redis->>Ctrl: RPOP build_queue
    Ctrl->>DB: UPDATE deployments SET status='IN_PROGRESS'
    Ctrl->>Runner: Spawn Docker / K8s Runner Container
    Runner->>Runner: git clone repoUrl
    Runner->>Runner: npm install && npm run build
    Runner->>S3: Upload build artifacts (dist/ / out/)
    Runner-->>Ctrl: Build Finished (Success)
    Ctrl->>DB: UPDATE deployments SET status='READY', artifact_path=...

    Visitor->>Proxy: GET https://demo-project.push2prod.local/
    Proxy->>S3: Stream index.html & static assets
    Proxy-->>Visitor: 200 OK (Rendered Website)
```

---

## 4. Local vs Cloud Infrastructure Evolution

```mermaid
graph LR
    subgraph Local_Dev["Stage 1: Local Development"]
        DockerCompose["Docker Compose"]
        LocalMinio["MinIO (S3 API)"]
        LocalPostgres["PostgreSQL:5433"]
        LocalRedis["Redis:6379"]
    end

    subgraph Hybrid_K8s["Stage 2: Container Orchestration"]
        Minikube["Minikube Cluster"]
        K8sExecutor["k8s-executor.ts"]
    end

    subgraph Cloud_AWS["Stage 3: AWS Production"]
        AWS_S3["AWS S3 Bucket"]
        AWS_ECS["AWS ECS Fargate / EKS"]
        AWS_RDS["AWS RDS Postgres"]
        CloudFront["AWS CloudFront CDN"]
    end

    Local_Dev -->|Evolution 1| Hybrid_K8s
    Hybrid_K8s -->|Evolution 2| Cloud_AWS
```

---

## 5. Reverse Routing & Asset Resolution Architecture

```mermaid
graph TD
    subgraph Ingress [User Requests via Port 4002]
        SubdomainReq["Subdomain Ingress\nhttp://<slug>.<ip>.nip.io:4002/"]
        PathReq["Path Ingress\nhttp://<ip>:4002/site/<slug>/"]
        RawAssetReq["Direct Asset Ingress\nhttp://<ip>:4002/_next/static/..."]
    end

    subgraph RoutingEngine ["services/routing-service"]
        HostParser{"Host has Subdomain?\n(*.nip.io or *.localhost)"}
        PathParser{"URL starts with\n/site/<slug>/?"}
        RefererParser{"Referer Header has\n/site/<slug>/?"}
        
        SlugExtractor["Extract Slug & Resolve Deployment Artifact Prefix"]
        S3Resolver["Build Full S3 Key (prefix + serveDir + filePath)"]
    end

    subgraph Storage ["AWS S3 Storage"]
        S3Bucket[("AWS S3 Bucket\npush2prod-artifacts")]
    end

    SubdomainReq --> HostParser
    HostParser -->|Yes| SlugExtractor
    PathReq --> PathParser
    PathParser -->|Yes| SlugExtractor
    RawAssetReq --> RefererParser
    RefererParser -->|Yes: Recover Target Slug| SlugExtractor

    SlugExtractor --> S3Resolver
    S3Resolver --> S3Bucket
    S3Bucket -->|Stream Asset with Auto-MIME| Ingress
```

### Architectural Details:
- **Subdomain Routing (`nip.io`):** Wildcard DNS (`<slug>.<ip>.nip.io`) maps all subdomains back to the EC2 IP without paid certificates. Provides true root asset isolation matching Vercel (`<project>.vercel.app`).
- **Referer Fallback Rewriting:** For users directly accessing path-based URLs (`/site/<slug>/`), subsequent asset requests (`/_next/static/...`, `/logo.png`) that lack the path prefix are automatically rewritten to the parent deployment using HTTP `Referer` inspection.

---

## 6. Vercel Parity & Low-Memory Build Engine

```mermaid
graph LR
    subgraph Vercel_Infra ["Vercel Commercial Architecture"]
        VercelVM["Ephemeral MicroVM\n8GB–16GB Dedicated RAM\n4–8 vCPUs (Firecracker)"]
        VercelEngine["Turbopack Parallel Workers\nMulti-Threaded In-Memory AST"]
    end

    subgraph Push2Prod_FreeTier ["Push2Prod AWS Free Tier (t3.micro)"]
        EC2Host["EC2 Host: 1GB Physical RAM\n4GB Swap Space"]
        ContainerCeiling["cgroup Limit: 1,800MB RAM\n3,500MB Swap"]
        NodeEngine["Node.js 20 LTS Runtime\nV8 Heap: --max-old-space-size=1536"]
        Compiler["Single-Worker Mode: NEXT_CPU_COUNT=1\nWebpack Memory Optimization"]
    end

    VercelVM --> VercelEngine
    EC2Host --> ContainerCeiling
    ContainerCeiling --> NodeEngine
    NodeEngine --> Compiler
```

### Key Optimizations:
1. **Node 20 LTS Alignment:** Standardized `build-runner` on `node:20-alpine`, eliminating Node 22 ESM/PostCSS AST syntax collisions (`createRequire` duplicate definitions).
2. **Parallelism Control (`NEXT_CPU_COUNT=1`):** Restricts Next.js from spawning concurrent worker threads on low-memory nodes, cutting build-time peak memory usage by over 50%.
3. **Explicit V8 Heap Expansion:** Prevents Node.js from defaulting to a 450MB heap ceiling on 1GB hosts, safely utilizing disk-backed swap up to 1,536MB.

---

## 7. Push2Prod vs Vercel Architectural Parity Matrix

The following matrix documents how Push2Prod mirrors Vercel's platform features and how each design constraint was solved within the AWS Free Tier:

| Architectural Dimension | Vercel Commercial Platform | Push2Prod (AWS Free Tier) | Engineering Solution & Rationale |
| :--- | :--- | :--- | :--- |
| **Execution Sandbox** | Ephemeral MicroVMs (AWS Firecracker / Lambda) | Ephemeral Docker Containers spawned by `build-controller` | Isolated cgroups (`--memory 1800m`) and volume mounts prevent tenant cross-contamination. |
| **Runner Memory** | 8 GB – 16 GB dedicated RAM per build | 1 GB physical EC2 RAM + 4 GB swap space | Clamped system services to 100-200MB and enabled single-worker compilation (`NEXT_CPU_COUNT=1`). |
| **Compiler Engine** | Turbopack parallel workers across 4–8 vCPUs | Webpack sequential compilation (`next build --webpack`) | Turbopack multi-threading triggers OOM on 1GB nodes; sequential Webpack completes comfortably. |
| **V8 Heap Ceiling** | Dynamic, unconstrained (up to 8,192 MB) | Explicitly expanded to 1,536 MB (`--max-old-space-size=1536`) | Overcomes Node.js default 450MB clamp (50% of physical RAM) so builds utilize swap space without crashing. |
| **Runtime Environment** | Node.js 20.x LTS standard image | Docker image `prod2push/build-runner:latest` based on `node:20-alpine` | Prevents PostCSS/Tailwind ESM module collisions (`createRequire` errors) introduced in Node 22. |
| **Tenant Routing** | Dedicated root subdomains (`<project>.vercel.app`) | Wildcard DNS subdomains (`<slug>.<ip>.nip.io:4002`) | Eliminates root-relative asset path breakages (`/_next/static/...`) without requiring paid domain names. |
| **Asset Fallbacks** | N/A (Subdomain-only routing) | HTTP `Referer` header inspection middleware | Rewrites raw un-prefixed asset queries for legacy path URLs (`/site/<slug>/`) to their target deployment. |
| **Static Storage** | Proprietary Global Anycast Edge CDN | AWS S3 Bucket (`push2prod-artifacts`) streamed via `routing-service` | High availability, durable object storage with automatic MIME type resolution and streaming proxy. |
| **Hosting Cost** | Paid tiers ($20+/month per user) | **$0.00 / month** (100% AWS Free Tier eligible) | Complete self-hosted PaaS without infrastructure bills. |


