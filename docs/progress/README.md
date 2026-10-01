# Project Progress & Roadmap: Vercel-Pro

---

## 1. Development Phases

- [x] **Phase 1-3:** Monorepo architecture, PostgreSQL schema, Redis connectivity, and project CRUD APIs.
- [x] **Phase 5-7:** Build Worker reliability, Git clone execution, build runner lifecycle.
- [x] **Phase 8-11:** Subdomain reverse proxy routing, MinIO/S3 static asset serving, deployment state machine.
- [x] **Phase 14:** Docker Compose local stack with Docker-in-Docker isolation & AWS S3 integration.
- [x] **Phase 16-17:** Kubernetes native orchestration (`k8s-executor.ts`), Minikube automation (`start-k8s-mode.ps1`), and Kyverno security policies.
- [ ] **Phase 18:** AWS EKS production deployment & CloudFront edge caching.

---

## 2. Journey Log Tracking

Track individual build logs, roadblocks, and architectural decisions in:
- [`docs/journey/`](../journey/README.md)
- [`docs/adr/`](../adr/README.md)
