/**
 * ============================================================================
 * K8s EXECUTOR — k8s-executor.ts
 * ============================================================================
 *
 * YE FILE KYA KARTI HAI:
 *   Ye build-controller ka "Kubernetes brain" hai.
 *   Jab BUILD_MODE=kubernetes set hota hai, build.ts is file ko call karta hai.
 *
 *   Docker mode mein: docker run → container spawn karo
 *   K8s mode mein:   K8s Job API → Job create karo → Pod spawn hoga
 *
 * K8s JOB KYA HOTA HAI?
 *   - Ek baar chalane wala task (Docker container ki tarah, par K8s manage karta hai)
 *   - Complete hone ke baad automatically Pod band ho jaata hai
 *   - K8s scheduler decide karta hai kaunse node pe chalaao
 *   - TTL ke baad khud cleanup ho jaata hai
 *
 * @kubernetes/client-node v1.x API CHANGE:
 *   Pehle: readNamespacedJob(name, namespace, ...)  → positional args
 *   Ab:    readNamespacedJob({ name, namespace })   → object arg
 *   Return type bhi change hua: ab direct object milta hai, .body nahi
 *
 * ============================================================================
 */

import * as k8s from '@kubernetes/client-node';
import { logger } from '@push2prod/logger';
import { db } from '@push2prod/db';

// ============================================================================
// CONSTANTS
// ============================================================================

// Ye namespace wahi hai jo infra/k8s/namespace.yaml mein define kiya tha
const K8S_NAMESPACE = process.env.K8S_NAMESPACE || 'deployit';

// Build runner image — Minikube pe 'minikube image load' se loaded hoga
const BUILD_RUNNER_IMAGE = process.env.BUILD_RUNNER_IMAGE || 'push2prod/build-runner:latest';

// Image pull policy:
//   'Never'       → Sirf locally loaded image use karo (Minikube development)
//   'IfNotPresent'→ Pehle local dekho, nahi mila toh pull karo (staging)
//   'Always'      → Har baar registry se pull karo (production mein use karo)
const IMAGE_PULL_POLICY = (process.env.IMAGE_PULL_POLICY || 'Never') as 'Never' | 'IfNotPresent' | 'Always';

// ============================================================================
// K8s CLIENT SETUP
// ============================================================================

// KubeConfig do tarike se load hoti hai:
//   1. IN-CLUSTER: Jab build-controller khud K8s Pod ke andar chal raha ho
//      → /var/run/secrets/kubernetes.io/serviceaccount/ se credentials milengi
//   2. KUBECONFIG: Jab local machine pe test kar rahe ho
//      → ~/.kube/config ya KUBECONFIG env var se load hogi (minikube ne set ki hogi)
const kc = new k8s.KubeConfig();

if (process.env.KUBERNETES_SERVICE_HOST) {
  // Container ke andar chal raha hai — in-cluster config use karo
  kc.loadFromCluster();
  logger.info('[k8s-executor] Running inside cluster — using in-cluster config');
} else {
  // Local machine pe — kubeconfig use karo (minikube ne set kiya hoga)
  kc.loadFromDefault();
  logger.info('[k8s-executor] Running outside cluster — using kubeconfig (minikube)');
}

// Batch API client — Job resources ke liye yahi use hota hai
// @kubernetes/client-node v1.x mein methods object params accept karte hain
const batchApi = kc.makeApiClient(k8s.BatchV1Api);

// Core API client — Pod status check karne ke liye
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

// ============================================================================
// TYPES
// ============================================================================

export interface K8sJobOptions {
  deploymentId: string;
  repositoryUrl: string;
  branch: string;
  buildCommand: string;
  outputDir: string;
  rootDir: string;
  workerId: string;
  customEnvVars?: string;  // "KEY1=VAL1,KEY2=VAL2" format
}

// ============================================================================
// HELPER: DB Log writer
// Frontend logs page yahan se read karta hai
// ============================================================================
const logEvent = async (
  deploymentId: string,
  message: string,
  type: 'START' | 'INFO' | 'WARNING' | 'ERROR' | 'END' = 'INFO'
) => {
  try {
    await db.buildLog.create({ data: { deploymentId, message } });
    await db.buildEvent.create({ data: { deploymentId, type, message } });
  } catch {
    // DB write fail ho — sirf console log karo, build band mat karo
    logger.warn(`[k8s-executor] Failed to write log to DB: ${message}`);
  }
};

// ============================================================================
// HELPER: Job name generator
// K8s resource names mein sirf lowercase letters aur hyphens allowed hain
// ============================================================================
const getJobName = (deploymentId: string): string => {
  // e.g. "build-runner-30cadf6b" (deployment ID ka pehla 8 character)
  return `build-runner-${deploymentId.slice(0, 8).toLowerCase()}`;
};

// ============================================================================
// HELPER: Build Job Manifest banana
// Ye function ek K8s Job object return karta hai (YAML ka TypeScript equivalent)
// Build-controller ise K8s API ko deta hai — K8s Pod banata hai
// ============================================================================
const buildJobManifest = (opts: K8sJobOptions): k8s.V1Job => {
  const jobName = getJobName(opts.deploymentId);

  // Credentials environment variables jo Secret se aati hain
  // (Secret infra/k8s/secrets.yaml mein define hai — gitignored)
  const secretEnvVars: k8s.V1EnvVar[] = [
    {
      name: 'DATABASE_URL',
      valueFrom: { secretKeyRef: { name: 'push2prod-secrets', key: 'DATABASE_URL' } }
    },
    {
      name: 'S3_ENDPOINT',
      valueFrom: { secretKeyRef: { name: 'push2prod-secrets', key: 'S3_ENDPOINT' } }
    },
    {
      name: 'S3_BUCKET_NAME',
      valueFrom: { secretKeyRef: { name: 'push2prod-secrets', key: 'S3_BUCKET_NAME' } }
    },
    {
      name: 'S3_ACCESS_KEY_ID',
      valueFrom: { secretKeyRef: { name: 'push2prod-secrets', key: 'S3_ACCESS_KEY_ID' } }
    },
    {
      name: 'S3_SECRET_ACCESS_KEY',
      valueFrom: { secretKeyRef: { name: 'push2prod-secrets', key: 'S3_SECRET_ACCESS_KEY' } }
    },
  ];

  // Build-specific env vars — yahan actual values directly jaati hain
  // (Security sensitive nahi — ye sirf repo URL aur build commands hain)
  const buildEnvVars: k8s.V1EnvVar[] = [
    { name: 'DEPLOYMENT_ID',                   value: opts.deploymentId },
    { name: 'REPO_URL',                        value: opts.repositoryUrl },
    { name: 'BRANCH',                          value: opts.branch },
    { name: 'BUILD_CMD',                       value: opts.buildCommand },
    { name: 'OUTPUT_DIR',                      value: opts.outputDir },
    { name: 'ROOT_DIR',                        value: opts.rootDir },
    { name: 'CUSTOM_ENV_VARS',                 value: opts.customEnvVars || '' },
    // pnpm corepack download prompt disable karo (non-interactive container mein crash karta tha)
    { name: 'COREPACK_ENABLE_DOWNLOAD_PROMPT', value: '0' },
    { name: 'NODE_ENV',                        value: 'production' },
  ];

  return {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      namespace: K8S_NAMESPACE,
      labels: {
        'app': 'build-runner',
        'app.kubernetes.io/component': 'build-runner',
        'app.kubernetes.io/part-of': 'push2prod',
        // Deployment ID label — kubectl se filter karne ke liye
        'push2prod/deployment-id': opts.deploymentId.slice(0, 8),
        'push2prod/worker-id': opts.workerId.slice(0, 16),
      },
    },
    spec: {
      // Fail hone pe retry mat karo — build fail matlab code mein problem hai
      backoffLimit: 0,

      // Job complete hone ke 1 ghante baad automatically delete ho jayega
      // (Logs DB mein save ho jaate hain, K8s Job object rakhna zaruri nahi)
      ttlSecondsAfterFinished: 3600,

      // Maximum 15 minute chalega build — phir forcefully kill kar dega K8s
      activeDeadlineSeconds: 900,

      template: {
        metadata: {
          labels: {
            'app': 'build-runner',
            'push2prod/deployment-id': opts.deploymentId.slice(0, 8),
          },
        },
        spec: {
          // build-runner-sa: Zero K8s API access (defined in serviceaccount.yaml)
          // Untrusted build code K8s API tak nahi pahunch sakta — ZERO TRUST!
          serviceAccountName: 'build-runner-sa',

          // Job complete hone ke baad restart mat karo
          restartPolicy: 'Never',

          // Pod-level security context
          securityContext: {
            runAsNonRoot: true,  // Root nahi chalega
            runAsUser: 1001,      // builduser (Dockerfile mein define kiya)
            runAsGroup: 1001,
            fsGroup: 1001,
          },

          containers: [{
            name: 'build-runner',
            image: BUILD_RUNNER_IMAGE,

            // Image pull policy:
            // 'Never'       = Minikube pe 'minikube image load' se loaded image use karo
            // 'IfNotPresent'= Pehle local, phir registry
            // Production mein 'IfNotPresent' ya 'Always' use karo
            imagePullPolicy: IMAGE_PULL_POLICY,

            // Container-level security: Maximum restriction
            securityContext: {
              allowPrivilegeEscalation: false,  // sudo, setuid sab blocked
              capabilities: {
                drop: ['ALL'],  // Sab Linux capabilities hata do
              },
            },

            // Resource limits — ek rogue build poora server nahi kha sakta
            resources: {
              limits: {
                memory: '1500Mi',  // Max 1.5 GB RAM
                cpu: '2000m',       // Max 2 CPU cores
              },
              requests: {
                memory: '256Mi',  // Minimum 256MB guarantee
                cpu: '500m',       // Minimum 0.5 CPU
              },
            },

            // Saare env vars combine karo
            env: [...buildEnvVars, ...secretEnvVars],

            // /tmp mein emptyDir volume mount — build workspace yahan hoga
            volumeMounts: [{
              name: 'build-workspace',
              mountPath: '/tmp/workspace',
            }],
          }],

          volumes: [{
            name: 'build-workspace',
            emptyDir: {
              // Max 5GB build workspace — large repos ke liye
              sizeLimit: '5Gi',
            },
          }],
        },
      },
    },
  };
};

// ============================================================================
// HELPER: Job status watch karo
// Job complete hone tak wait karo — success ya failure detect karo
// ============================================================================
const waitForJobCompletion = async (
  jobName: string,
  timeoutMs: number = 15 * 60 * 1000  // 15 minutes default timeout
): Promise<'success' | 'failure' | 'timeout'> => {

  const startTime = Date.now();

  // Polling approach: har 5 second mein K8s se Job status fetch karo
  while (Date.now() - startTime < timeoutMs) {
    try {
      // v1.x API: object params use karo — positional args nahi
      const job = await batchApi.readNamespacedJob({ name: jobName, namespace: K8S_NAMESPACE });
      const status = job.status;

      // K8s Job Status Fields:
      //   status.succeeded: Kitne pods successfully complete hue
      //   status.failed:    Kitne pods fail hue
      //   status.active:    Kitne pods abhi chal rahe hain
      if (status?.succeeded && status.succeeded > 0) {
        logger.info(`[k8s-executor] Job ${jobName} completed successfully`);
        return 'success';
      }

      if (status?.failed && status.failed > 0) {
        logger.error(`[k8s-executor] Job ${jobName} failed (${status.failed} pod failed)`);
        return 'failure';
      }

      // Job abhi chal raha hai — thoda wait karo
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logger.info(`[k8s-executor] Job ${jobName} running... (${elapsed}s elapsed, active: ${status?.active || 0})`);
      await new Promise(resolve => setTimeout(resolve, 5000));  // 5s wait

    } catch (err: any) {
      // 404 = Job exist nahi karta (shayad deleted ho gaya)
      const is404 = err.statusCode === 404 || err.response?.statusCode === 404 || err.code === 404;
      if (is404) {
        logger.error(`[k8s-executor] Job ${jobName} not found — may have been deleted`);
        return 'failure';
      }
      // Temporary API error — retry karo
      logger.warn(`[k8s-executor] Error checking job status (will retry):`, err.message || err);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Timeout — Job ne 15 minute mein kaam nahi kiya
  logger.error(`[k8s-executor] Job ${jobName} timed out after ${timeoutMs / 60000} minutes`);
  return 'timeout';
};

// ============================================================================
// HELPER: Job ke Pod logs fetch karo (debugging ke liye)
// Build-controller ke logs mein visible honge
// ============================================================================
const streamJobLogs = async (jobName: string): Promise<void> => {
  try {
    // Job ke associated pods dhundo — label selector use karo
    const podList = await coreApi.listNamespacedPod({
      namespace: K8S_NAMESPACE,
      labelSelector: `job-name=${jobName}`
    });

    const pods = podList.items;
    if (pods.length === 0) {
      logger.warn(`[k8s-executor] No pods found for job ${jobName}`);
      return;
    }

    // Pehle pod ke logs fetch karo
    const podName = pods[0].metadata?.name;
    if (!podName) return;

    const logs = await coreApi.readNamespacedPodLog({
      name: podName,
      namespace: K8S_NAMESPACE,
      container: 'build-runner',
    });

    // Logs console mein print karo (build-controller ke logs mein dikhenge)
    if (logs) {
      logger.info(`[k8s-executor] === Pod Logs for ${podName} ===`);
      String(logs).split('\n').forEach((line: string) => {
        if (line.trim()) logger.info(`[build-runner-pod] ${line}`);
      });
    }
  } catch (err) {
    // Logs nahi mile — harmless, ignore karo
    logger.warn(`[k8s-executor] Could not fetch pod logs:`, err);
  }
};

// ============================================================================
// HELPER: Cancel — Job delete karo agar deployment cancel hua
// ============================================================================
const cancelJob = async (jobName: string): Promise<void> => {
  try {
    // propagationPolicy: 'Background' — Job delete hoga saath mein Pod bhi
    await batchApi.deleteNamespacedJob({
      name: jobName,
      namespace: K8S_NAMESPACE,
      body: {
        propagationPolicy: 'Background',  // Cascade delete — Pod bhi delete ho jayega
      } as k8s.V1DeleteOptions,
    });
    logger.info(`[k8s-executor] Job ${jobName} deleted (cancellation/timeout)`);
  } catch (err: any) {
    const is404 = err.statusCode === 404 || err.response?.statusCode === 404 || err.code === 404;
    if (!is404) {
      // 404 = Already deleted — OK, baaki errors log karo
      logger.warn(`[k8s-executor] Could not delete job ${jobName}:`, err.message || err);
    }
  }
};

// ============================================================================
// MAIN EXPORT: spawnK8sJob
// Build-controller ka build.ts is function ko call karta hai
// ============================================================================
export const spawnK8sJob = async (opts: K8sJobOptions): Promise<boolean> => {
  const jobName = getJobName(opts.deploymentId);

  // Pehle check karo ki same job already exist toh nahi karta
  // (Retry scenarios mein hoga)
  try {
    await batchApi.readNamespacedJob({ name: jobName, namespace: K8S_NAMESPACE });
    // Job already hai — delete karo pehle (old failed job cleanup)
    logger.warn(`[k8s-executor] Job ${jobName} already exists — deleting old job first`);
    await cancelJob(jobName);
    // Thoda wait karo K8s ko deletion process karne ke liye
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (err: any) {
    const is404 = err.statusCode === 404 || err.response?.statusCode === 404 || err.code === 404;
    if (!is404) {
      // 404 expected hai (job nahi mila) — baaki errors real problem hain
      throw err;
    }
    // 404 = Job nahi hai — proceed karo normally
  }

  await logEvent(opts.deploymentId, `Creating K8s Job: ${jobName}`, 'START');
  logger.info(`[k8s-executor] Creating K8s Job: ${jobName} in namespace: ${K8S_NAMESPACE}`);

  // Job manifest banao
  const jobManifest = buildJobManifest(opts);

  // K8s API se Job create karo
  try {
    await batchApi.createNamespacedJob({ namespace: K8S_NAMESPACE, body: jobManifest });
    logger.info(`[k8s-executor] Job ${jobName} created successfully`);
    await logEvent(opts.deploymentId, `Spawning isolated build container: ${BUILD_RUNNER_IMAGE}`);
  } catch (err: any) {
    const errMsg = err.body?.message || err.message || 'Unknown K8s API error';
    logger.error(`[k8s-executor] Failed to create K8s Job:`, errMsg);
    await logEvent(opts.deploymentId, `Failed to create K8s Job: ${errMsg}`, 'ERROR');
    return false;
  }

  // Cancellation polling — har 5 second mein DB check karo
  // Agar user ne cancel kiya toh Job delete kar do
  let cancelled = false;
  const cancellationPoller = setInterval(async () => {
    try {
      const d = await db.deployment.findUnique({
        where: { id: opts.deploymentId },
        select: { status: true },
      });

      if (d?.status === 'CANCELLED' && !cancelled) {
        cancelled = true;
        clearInterval(cancellationPoller);
        logger.info(`[k8s-executor] Deployment cancelled — deleting job ${jobName}`);
        await cancelJob(jobName);
        await logEvent(opts.deploymentId, 'Build cancelled — K8s Job deleted.', 'WARNING');
      }
    } catch { /* DB error — ignore */ }
  }, 5000);

  // Job complete hone tak wait karo
  const result = await waitForJobCompletion(jobName);

  // Polling band karo
  clearInterval(cancellationPoller);

  if (cancelled) {
    return false;
  }

  // Pod logs fetch karo debugging ke liye (controller logs mein dikhenge)
  await streamJobLogs(jobName);

  if (result === 'success') {
    await logEvent(opts.deploymentId, `K8s Job ${jobName} completed successfully.`, 'END');
    return true;
  } else if (result === 'timeout') {
    await logEvent(opts.deploymentId, `K8s Job ${jobName} timed out after 15 minutes.`, 'ERROR');
    // Timeout pe Job bhi delete karo (resource cleanup)
    await cancelJob(jobName);
    return false;
  } else {
    await logEvent(opts.deploymentId, `K8s Job ${jobName} failed. Check pod logs.`, 'ERROR');
    return false;
  }
};
