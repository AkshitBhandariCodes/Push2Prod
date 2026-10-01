# Architectural Decision Records (ADRs)

This directory documents all significant technical and architectural decisions made across the lifecycle of **Vercel-Pro (Push2Prod)**.

---

## Decision Log

| ADR # | Date | Title | Status | Impacted Service |
| :--- | :--- | :--- | :--- | :--- |
| [ADR-001](./001-dynamic-dind-vs-fixed-worker-pool.md) | 2026-08-26 | Dynamic Ephemeral Build Runners vs Long-Running Worker Pool | Accepted | `build-controller`, `build-runner` |
| [ADR-002](./002-kubernetes-jobs-vs-docker-socket-for-build-execution.md) | 2026-10-01 | Native Kubernetes Jobs vs Host Docker Socket for Build Execution | Accepted | `build-controller`, `infra/k8s` |

---

## How to Create an ADR

To create a new ADR, invoke:
```text
/journey adr <title>
```
Or copy the template at [`.agents/skills/journey/templates/adr.template.md`](../../.agents/skills/journey/templates/adr.template.md) into `docs/adr/00X-<title>.md`.
