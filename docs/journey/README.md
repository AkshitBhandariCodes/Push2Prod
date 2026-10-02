# Engineering Journey & Development Logs

Welcome to the development journey log of **Vercel-Pro (Push2Prod)**.

This repository tracks every milestone, architectural decision, unexpected roadblock ("twists & turns"), mitigation strategy, and GitHub commit across all phases of the project.

---

## Quick Slash Commands

Trigger this skill anytime from your AI IDE:
- `/journey` or `/journey log` — Record a new milestone with challenges, fixes, and git mapping.
- `/journey arch` — Update or view system architecture and Mermaid diagrams.
- `/journey adr <title>` — Create an Architectural Decision Record.
- `/journey status` — Check journey log coverage and unlogged commits.

---

## Milestone Journey Log

| Date | Milestone / Focus | Commit | Challenges & Roadblocks | Mitigation Strategy | Log Entry |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-10-03 | Vercel Parity: Subdomain Routing, Node 20 LTS & Low-Memory Builds | [`0f63dd0`](https://github.com/AkshitBhandariCodes/Vercel-pro/commit/0f63dd0102da4336aa29aed5405a39c7d2870c0d) | Turbopack OOM Exit 137, Node 22 createRequire collision, broken CSS on raw paths | Single-worker sequential compilation, V8 heap to 1.5GB, Node 20 LTS & nip.io subdomains | [View Log](./2026-10-03-vercel-parity-subdomain-routing-and-low-memory-builds.md) |
| 2026-10-03 | Cloud Hardening: RDS SSL, OAuth Token Sync, Build Diagnostics & Memory Tuning | [`7dbd401`](https://github.com/AkshitBhandariCodes/Vercel-pro/commit/7dbd401c72a8c82de7b7c8fcf53568881fecbb43) | RDS unencrypted error, masked compiler errors, stale OAuth tokens, & t3.micro lag | Prisma SSL query, stream combination, signIn upsert, & V8 heap/swappiness caps | [View Log](./2026-10-03-aws-cloud-deployment-rds-oauth-hardening.md) |
| 2026-10-02 | Production Hardening: Redis, Build-Runner & Global Routing | [`4d6e86e`](https://github.com/AkshitBhandariCodes/Vercel-pro/commit/4d6e86eb4e2e67f09592843f378b36f687b370f0) | Container bridge Redis disconnect, missing build-runner image, & localhost URLs | Set internal Redis URL, prebuild runner target in Compose, & dynamic global routing | [View Log](./2026-10-02-fixing-redis-builds-global-routing.md) |
| 2026-10-01 | Phase 16-17 — Kubernetes Native Job Orchestration | Pending / In Progress | `@kubernetes/client-node` v1.x API breaking changes & Minikube Prisma migrations | Object param refactor & background kubectl port-forward job | [View Log](./2026-10-01-phase-16-17-kubernetes-executor-orchestration.md) |
| 2026-08-26 | Phase 1 — Docker in Docker with AWS | [`d2b560b`](https://github.com/AkshitBhandariCodes/Vercel-pro/commit/d2b560bb76da0d2c93017ad2f68b368314d3e9e6) | DinD socket permissions & container isolation | Daemon socket mount with rootless/privileged safeguards | [View Log](./2026-08-26-phase-1-docker-in-docker-aws.md) |
| 2026-06-25 | Phase 5-7 — Build Worker Reliability & Git Clone | [`1684477`](https://github.com/AkshitBhandariCodes/Vercel-pro/commit/1684477) | Git repo cloning failures & build timeout handling | Streamed runner execution with heartbeats & retry queue | [View Log](./2026-06-25-phase-5-7-build-worker.md) |

---

## Architectural Decision Records (ADRs)

Key architectural forks and trade-offs are documented under [`docs/adr/`](../adr/):
- [ADR-001: Dynamic Docker-in-Docker vs Fixed Worker Pool](../adr/001-dynamic-dind-vs-fixed-worker-pool.md)
- [ADR-002: Native Kubernetes Jobs vs Host Docker Socket for Build Execution](../adr/002-kubernetes-jobs-vs-docker-socket-for-build-execution.md)
- [ADR-003: Vercel Parity — Subdomain Asset Isolation, Node 20 LTS Alignment & Low-Memory Build Orchestration](../adr/003-vercel-parity-subdomain-routing-and-low-memory-compilation.md)

---

## Core System Architecture

System topology, component responsibilities, and deployment sequence diagrams are documented under [`docs/journey/ARCHITECTURE.md`](./ARCHITECTURE.md).
