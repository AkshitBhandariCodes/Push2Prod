# System Architecture & Evolution: {{PROJECT_NAME}}

*Last Updated: {{DATE}}*

---

## 1. High-Level System Overview
{{HIGH_LEVEL_DESCRIPTION}}

```mermaid
graph TD
    Client["Client / User Browser"]
    APIGateway["API Gateway / Web Server"]
    DB[(PostgreSQL)]
    Queue[(Redis / Kafka)]
    Worker["Build Worker / Executor"]
    Storage["Object Storage (S3 / MinIO)"]

    Client -->|Deploy Request| APIGateway
    APIGateway -->|Save Project| DB
    APIGateway -->|Push Job| Queue
    Queue -->|Consume Job| Worker
    Worker -->|Fetch Repo & Build| Storage
    Storage -->|Serve Static Assets| Client
```

---

## 2. Component Topology & Responsibility Matrix

| Component | Tech Stack | Role / Responsibility | Key Ports / Protocols |
| :--- | :--- | :--- | :--- |
| `{{COMPONENT_1}}` | {{STACK_1}} | {{ROLE_1}} | {{PORTS_1}} |
| `{{COMPONENT_2}}` | {{STACK_2}} | {{ROLE_2}} | {{PORTS_2}} |
| `{{COMPONENT_3}}` | {{STACK_3}} | {{ROLE_3}} | {{PORTS_3}} |

---

## 3. Data Flow & Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    participant Web as Web / API Service
    participant Q as Redis Queue
    participant Worker as Build Executor
    participant S3 as AWS S3 / MinIO
    participant Proxy as Reverse Proxy

    Dev->>Web: POST /deploy (repo_url)
    Web->>Q: Enqueue BuildJob(id, repo_url)
    Web-->>Dev: 202 Accepted (build_id, tracking_url)
    Q->>Worker: Dispatch BuildJob
    Worker->>Worker: Clone repo & Docker build
    Worker->>S3: Upload dist / build artifacts
    Worker->>Web: Update status -> READY
    Dev->>Proxy: GET project-subdomain.domain.com
    Proxy->>S3: Stream index.html & assets
    Proxy-->>Dev: Render Webpage
```

---

## 4. Infrastructure & Deployment Matrix

```mermaid
graph LR
    subgraph Local_Dev["Local Development"]
        DockerCompose["Docker Compose"]
        Minikube["Minikube K8s"]
    end

    subgraph Cloud_AWS["Production Cloud (AWS)"]
        ECS_EKS["ECS Fargate / EKS"]
        S3Bucket["AWS S3"]
        CloudFront["CloudFront CDN"]
    end

    DockerCompose -.->|Parity Migration| ECS_EKS
```

---

## 5. Architectural Evolutions (Twists & Turns Log)

| Date | Phase | Architecture Before | Shift / Pivot Made | Trigger / Problem Encountered | Relevant ADR |
| :--- | :--- | :--- | :--- | :--- | :--- |
| {{DATE_1}} | {{PHASE_1}} | {{BEFORE_1}} | {{SHIFT_1}} | {{TRIGGER_1}} | [ADR-001](../adr/001-sample.md) |
