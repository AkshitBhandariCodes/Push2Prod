# Journey Log: Phase 16-17 — Kubernetes Native Job Orchestration & Automation

- **Date:** 2026-10-01
- **Author:** Akshit Bhandari
- **Branch:** `main`
- **GitHub Commit / Base:** [`d2b560b`](https://github.com/AkshitBhandariCodes/Vercel-pro/commit/d2b560bb76da0d2c93017ad2f68b368314d3e9e6) — *Phase 1 - Docker in Docker with AWS*
- **Milestone / Phase:** Phase 16-17: Container Orchestration & Security Hardening
- **Status:** In Progress / Implemented

---

## 1. What Was Built & Accomplished

- **Component / Service:** `services/build-controller` (`k8s-executor.ts`), `start-k8s-mode.ps1`, Helm infrastructure charts, and Minikube automation.
- **Core Changes:**
  - Implemented `k8s-executor.ts` in `build-controller` to dynamically submit Kubernetes `BatchV1Api` Job specifications instead of raw Docker socket commands when `BUILD_MODE=kubernetes`.
  - Added dual KubeConfig loading: in-cluster service account detection (`kc.loadFromCluster()`) vs local development mode (`kc.loadFromDefault()`).
  - Added automated Job lifecycle management: Pod phase monitoring (`Pending`, `Running`, `Succeeded`, `Failed`), log streaming from individual Pods to DB (`buildLog`, `buildEvent`), and self-cleaning via `ttlSecondsAfterFinished: 60`.
  - Created end-to-end Minikube automation in `start-k8s-mode.ps1`: starts cluster, installs Helm charts (PostgreSQL, MinIO, Headlamp dashboard, Kyverno policy engine), mounts docker environment, builds images, and performs Prisma schema push via ephemeral port-forwarding.
- **Files Modified / Added:**
  - `services/build-controller/src/k8s-executor.ts`
  - `start-k8s-mode.ps1`
  - `infra/k8s/` manifests and Helm configuration

---

## 2. Twists, Turns & Challenges Faced

### Challenge 1: `@kubernetes/client-node` v1.x Breaking API Signature
- **Symptom / Error:**
  ```typescript
  TypeError: Expected 1 argument, but got 3
  batchApi.readNamespacedJob(jobName, namespace, ...)
  ```
- **Root Cause Analysis:**
  The project updated to `@kubernetes/client-node` v1.x, which overhauled method signatures from positional arguments `(name, namespace, ...)` to a single object parameter `{ name, namespace }`. In addition, responses no longer wrap payloads under `.body` but return the direct API resource object.

### Challenge 2: Prisma Migration Connectivity in Local Minikube
- **Symptom:**
  Running `npx prisma db push` failed with `P1001: Can't reach database server at localhost:5432` during automated bootstrap.
- **Root Cause Analysis:**
  Bitnami PostgreSQL was deployed as a Kubernetes NodePort/ClusterIP service inside Minikube's Docker network, inaccessible directly on host `localhost:5432` until a port-forward background job was initiated.

### Challenge 3: Kyverno Security Policies Blocking Ephemeral Build Runners
- **Symptom:**
  Build runner Pod was blocked at admission with `disallowed root execution / privileged container`.
- **Root Cause Analysis:**
  Kyverno security policies enforced restricted security contexts, rejecting raw root containers during `git clone` and `npm run build`.

---

## 3. Mitigation Strategies & Resolutions

- **Attempted Fixes (Failed / Suboptimal):**
  1. *Attempt 1 (API):* Cast client calls with `any` — masked type errors and caused silent runtime crashes during Job status polling.
  2. *Attempt 2 (DB Migration):* Exposing Postgres via NodePort with Minikube IP — dynamic IP changed on restart, breaking `.env` paths.
- **Winning Solution:**
  1. Refactored `k8s-executor.ts` to strictly adhere to the v1.x object signature `{ name, namespace }` and extracted data directly from responses without `.body`.
  2. Implemented automated PowerShell background job `$pfJob = Start-Job { kubectl port-forward svc/postgres-postgresql 5432:5432 -n default }` with health check sleep, executing Prisma push cleanly and closing port-forwarding on completion.
  3. Configured rootless user context (`runAsNonRoot: true`, `runAsUser: 1000`) and Kyverno exception policy for `deployit` build runner jobs.
- **Takeaway / Key Insight:**
  > [!TIP]
  > When integrating `@kubernetes/client-node` v1.x, always verify whether methods expect `{ name, namespace }` objects, and leverage Kubernetes `ttlSecondsAfterFinished` on Batch Jobs to prevent finished pods from clogging node resources.

---

## 4. Architecture & Design Impact

```mermaid
graph TD
    RedisQ[("Redis Queue (build_jobs)")]
    Ctrl["Build Controller (services/build-controller)"]
    K8sAPI["Kubernetes Control Plane (kube-apiserver)"]
    
    subgraph Minikube_Cluster["Minikube / Production Cluster"]
        K8sJob["K8s Batch Job (build-runner-xxxx)"]
        RunnerPod["Ephemeral Build Runner Pod"]
        PostgresPod[("PostgreSQL Pod")]
        MinioPod[("MinIO Pod (S3 API)")]
        Kyverno["Kyverno Policy Validator"]
    end

    RedisQ -->|Consume Job| Ctrl
    Ctrl -->|BatchV1Api.createNamespacedJob| K8sAPI
    K8sAPI -->|Admission Review| Kyverno
    Kyverno -->|Approved| K8sJob
    K8sJob -->|Spawns| RunnerPod
    RunnerPod -->|Stream Build Logs| Ctrl
    RunnerPod -->|Upload Assets (dist/)| MinioPod
    Ctrl -->|Update Status (READY/FAILED)| PostgresPod
```

- **Associated ADR:** [ADR-002: Native Kubernetes Jobs vs Host Docker Socket for Build Execution](../adr/002-kubernetes-jobs-vs-docker-socket-for-build-execution.md)

---

## 5. Verification & Proof of Work

- **Test Command:**
  ```powershell
  .\start-k8s-mode.ps1
  kubectl get jobs -n deployit
  kubectl get pods -n deployit
  ```
- **Observed Result:**
  Minikube initialized successfully with Helm charts; `push2prod/build-runner` image loaded directly into Minikube cache; Prisma migrations executed cleanly; test deployment created and completed `build-runner` Job with status `Complete` (1/1).

---

## 6. Next Steps & Trajectory
- [x] Implement `k8s-executor.ts` with `@kubernetes/client-node` v1.x compatibility.
- [x] Automate cluster boot and Prisma migration via `start-k8s-mode.ps1`.
- [ ] Implement log streaming directly from Kubernetes CoreV1Api Pod logs endpoint.
- [ ] Prepare AWS EKS deployment manifests in `infra/k8s/production/`.
