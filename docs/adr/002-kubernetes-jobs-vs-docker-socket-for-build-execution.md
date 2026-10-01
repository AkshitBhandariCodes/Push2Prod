# ADR-002: Native Kubernetes Jobs vs Host Docker Socket for Build Execution

- **Status:** Accepted
- **Date:** 2026-10-01
- **Deciders:** Akshit Bhandari
- **Related Commits:** Local Workspace / Upcoming Commit
- **Related Journey Entry:** [Phase 16-17: Kubernetes Native Job Orchestration](../journey/2026-10-01-phase-16-17-kubernetes-executor-orchestration.md)

---

## Context and Problem Statement
In Phase 14 ([ADR-001](./001-dynamic-dind-vs-fixed-worker-pool.md)), the `build-controller` relied on mounting the host Docker daemon socket (`/var/run/docker.sock`) to execute dynamic `docker run` commands. 

While effective for local Docker Compose, mounting the host Docker socket in cloud environments (like AWS EKS or Kubernetes clusters) presents severe security vulnerabilities:
1. Access to the Docker socket allows any container to gain root control over the host node.
2. In managed Kubernetes (EKS, GKE), the underlying container runtime is `containerd` or `CRI-O`, where the Docker socket does not exist.

We needed a scalable, cloud-native orchestration model that functions seamlessly in local development (Minikube) and enterprise cloud (AWS EKS).

---

## Decision Drivers
- **Cloud Parity:** Identical deployment semantics between Minikube and AWS EKS.
- **Security & Sandboxing:** Adherence to Kubernetes Pod Security Standards (no root privileges, no host socket mounts).
- **Cluster Autoscaling:** Ephemeral Pods can trigger Kubernetes node autoscalers (Karpenter or Cluster Autoscaler) during traffic bursts.

---

## Considered Options
1. **Option 1: Retain Docker Socket Sharing.** Mount `/var/run/docker.sock` everywhere.
2. **Option 2: Native Kubernetes Batch Jobs (`batch/v1`).** `build-controller` calls Kubernetes API via `@kubernetes/client-node` to dispatch one-shot Pods.
3. **Option 3: External CI Workers (e.g., GitHub Actions Runners or Tekton).**

---

## Decision Outcome
**Chosen Option:** `Option 2: Native Kubernetes Batch Jobs (batch/v1)`.

### Rationale
- Kubernetes native Jobs provide built-in restart policies (`restartPolicy: Never`), deadline limits (`activeDeadlineSeconds: 600`), and automatic resource cleanup (`ttlSecondsAfterFinished: 60`).
- Compatible with any Kubernetes cluster runtime (`containerd`, `CRI-O`).
- Controlled via Kubernetes Role-Based Access Control (RBAC) with minimal permissions (`create`, `get`, `list`, `watch` on `jobs` and `pods/log`).

```mermaid
graph LR
    Controller["build-controller"] -->|POST /apis/batch/v1/namespaces/{ns}/jobs| KubeAPI["Kubernetes API Server"]
    KubeAPI -->|Schedules| WorkerPod["Ephemeral Pod (push2prod/build-runner)"]
    WorkerPod -->|Run Build & Upload| Storage[(S3 / MinIO)]
    WorkerPod -->|Exit 0| Terminated["TTL Cleanup (60s)"]
```

### Trade-offs & Mitigations
- **Trade-off:** Requires a Kubernetes cluster (Minikube locally, EKS in cloud).
- **Mitigation:** Maintained dual execution modes (`BUILD_MODE=docker` for lightweight Docker Compose testing and `BUILD_MODE=kubernetes` for production and Minikube testing).
