/**
 * ============================================================================
 * BUILD CONTROLLER — build.ts  (Phase 16-17: K8s Migration)
 * ============================================================================
 *
 * YE FILE KYA KARTA HAI:
 *   Ye orchestration layer hai — docker run ya K8s Job, dono support karta hai.
 *
 * BUILD_MODE environment variable se decide hota hai kaunsa mode use karo:
 *
 *   BUILD_MODE=docker      → Old approach: docker run spawn karta hai
 *                             (docker-compose ke saath local dev ke liye)
 *
 *   BUILD_MODE=kubernetes  → New approach: K8s Job API use karta hai
 *                             (Minikube ya production K8s cluster ke liye)
 *
 * KUCH IMPORTANT CHANGES (Phase 16-17):
 *   - K8s mode mein docker CLI ki zarurat nahi (koi docker.sock nahi chahiye)
 *   - K8s mode mein credentials K8s Secrets se aate hain (env vars nahi)
 *   - Cancellation K8s Job delete karke hoti hai (docker stop nahi)
 *
 * ============================================================================
 */

import { db } from '@push2prod/db';
import { logger } from '@push2prod/logger';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { spawnK8sJob } from './k8s-executor';

// exec ke liye promise wrapper
const execAsync = promisify(exec);

// ============================================================================
// Build options interface — worker.ts se aata hai
// ============================================================================
interface BuildOptions {
  deploymentId: string;
  repositoryUrl: string;
  branch: string;
  buildCommand: string;
  outputDir: string;
  rootDir: string;
  workerId: string;
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
  // BuildLog — frontend polling ya logs page se read karta hai
  await db.buildLog.create({ data: { deploymentId, message } });
  // BuildEvent — type-based filtering ke liye (real-time events)
  await db.buildEvent.create({ data: { deploymentId, type, message } });
};

// ============================================================================
// MAIN: performCloneAndBuild
// Ye function worker.ts call karta hai — redis stream se event uthane ke baad
// ============================================================================
export const performCloneAndBuild = async (options: BuildOptions): Promise<boolean> => {
  const {
    deploymentId,
    repositoryUrl,
    branch,
    buildCommand,
    outputDir,
    rootDir,
    workerId,
  } = options;

  // ==========================================================================
  // BUILD MODE DETECTION
  // BUILD_MODE env var se decide karo kaunsa executor use karna hai
  // ==========================================================================
  const buildMode = process.env.BUILD_MODE || 'docker';

  logger.info(`[${workerId}] Build mode: ${buildMode.toUpperCase()} for deployment ${deploymentId}`);

  // ==========================================================================
  // DB STATUS UPDATE: BUILDING
  // Worker se status BUILDING mark karo
  // ==========================================================================
  await db.deployment.update({
    where: { id: deploymentId },
    data: { status: 'BUILDING' },
  });

  await logEvent(deploymentId, `[${workerId}] Build started (mode: ${buildMode})`, 'START');

  // ==========================================================================
  // KUBERNETES MODE
  // K8s Job API use karo — build-runner Pod schedule hoga
  // ==========================================================================
  if (buildMode === 'kubernetes') {
    try {
      // Project ke custom env vars bhi build ko pass karne hain
      const deployment = await db.deployment.findUnique({
        where: { id: deploymentId },
        include: { project: { include: { envVars: true } } },
      });

      // Project env vars ko "KEY1=VAL1,KEY2=VAL2" format mein format karo
      const customEnvVars = (deployment?.project?.envVars || [])
        .map((ev) => `${ev.key}=${ev.value}`)
        .join(',');

      await logEvent(deploymentId, `Spawning isolated build container: push2prod/build-runner`);

      // K8s executor ko call karo — ye Job create karega aur wait karega
      const success = await spawnK8sJob({
        deploymentId,
        repositoryUrl,
        branch,
        buildCommand,
        outputDir,
        rootDir,
        workerId,
        customEnvVars,
      });

      // DB update on completion
      await db.deployment.update({
        where: { id: deploymentId },
        data: {
          status: success ? 'READY' : 'ERROR',
          lockedBy: null,
          lockedUntil: null,
        },
      });

      return success;

    } catch (error: any) {
      logger.error(`[${workerId}] K8s mode unexpected error for ${deploymentId}:`, error);
      try {
        await logEvent(deploymentId, `BUILD FAILED (K8s): ${error.message || 'Unknown error'}`, 'ERROR');
        await db.deployment.update({
          where: { id: deploymentId },
          data: { status: 'ERROR' },
        });
      } catch (dbErr) {
        logger.error(`[${workerId}] Failed to update DB on K8s error:`, dbErr);
      }
      return false;
    }
  }

  // ==========================================================================
  // DOCKER MODE (Default — backward compatible)
  // docker run use karo — existing local docker-compose ke saath kaam karta hai
  // ==========================================================================

  // Container naam — unique hona chahiye taaki parallel builds clash na karein
  const containerName = `build-runner-${deploymentId.slice(0, 8)}`;

  // Cancellation polling interval — har 5 sec mein DB check karega
  let pollInterval: NodeJS.Timeout | null = null;
  // Docker process reference — cancel hone pe kill kar sakte hain
  let dockerProcess: ReturnType<typeof spawn> | null = null;

  try {
    // ==========================================================================
    // ENV VARS PREPARE: Build runner ko kya pass karna hai
    // Build-runner container yahi env vars padh ke kaam karta hai
    // ==========================================================================
    const buildRunnerImage =
      process.env.BUILD_RUNNER_IMAGE || 'push2prod/build-runner';

    const dbUrl =
      process.env.BUILD_RUNNER_DB_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@postgres:5432/prod2push';

    const s3Endpoint =
      process.env.BUILD_RUNNER_S3_ENDPOINT ||
      process.env.S3_ENDPOINT ||
      '';

    const s3Bucket = process.env.S3_BUCKET_NAME || 'push2prod-builds';
    const s3AccessKey = process.env.S3_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID || '';
    const s3SecretKey = process.env.S3_SECRET_KEY || process.env.S3_SECRET_ACCESS_KEY || '';
    const s3Region = process.env.S3_REGION || 'us-east-1';
    const s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE || 'false';

    // Project ke custom env vars bhi build ko pass karne hain
    const deployment = await db.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: { include: { envVars: true } } },
    });

    // Project env vars ko KEY=VALUE format mein format karo
    const customEnvVars = (deployment?.project?.envVars || [])
      .map((ev) => `${ev.key}=${ev.value}`)
      .join(',');

    // ==========================================================================
    // DOCKER RUN COMMAND PREPARE
    // ==========================================================================
    const dockerArgs = [
      'run',
      '--rm',                                          // Auto-cleanup after exit
      '--name', containerName,                         // Unique naam
      '--memory', process.env.BUILD_MEMORY_LIMIT || '1800m',
      '--memory-swap', process.env.BUILD_SWAP_LIMIT || '3500m',
      '--cpus', process.env.BUILD_CPU_LIMIT || '2',
      '--network', 'prod2push-internal',              // Internal network access
      '--cap-drop', 'ALL',                             // Sabhi Linux capabilities drop karo
      '--security-opt', 'no-new-privileges:true',      // Privilege escalation block karo
      '-e', `DEPLOYMENT_ID=${deploymentId}`,
      '-e', `REPO_URL=${repositoryUrl}`,
      '-e', `BRANCH=${branch}`,
      '-e', `BUILD_CMD=${buildCommand}`,
      '-e', `OUTPUT_DIR=${outputDir}`,
      '-e', `ROOT_DIR=${rootDir}`,
      '-e', `DATABASE_URL=${dbUrl}`,
      '-e', `S3_ENDPOINT=${s3Endpoint}`,
      '-e', `S3_BUCKET_NAME=${s3Bucket}`,
      '-e', `S3_REGION=${s3Region}`,
      '-e', `S3_FORCE_PATH_STYLE=${s3ForcePathStyle}`,
      '-e', `S3_ACCESS_KEY_ID=${s3AccessKey}`,
      '-e', `S3_SECRET_ACCESS_KEY=${s3SecretKey}`,
      '-e', `CUSTOM_ENV_VARS=${customEnvVars}`,
      '-e', `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`,
      '--label', `push2prod.deployment=${deploymentId}`,
      '--label', `push2prod.worker=${workerId}`,
      buildRunnerImage,
    ];

    await logEvent(
      deploymentId,
      `Spawning isolated build container: ${buildRunnerImage}`
    );

    // ==========================================================================
    // CANCELLATION POLLING SETUP
    // ==========================================================================
    const setupCancellationPoller = () => {
      pollInterval = setInterval(async () => {
        try {
          const d = await db.deployment.findUnique({
            where: { id: deploymentId },
            select: { status: true },
          });

          if (d?.status === 'CANCELLED') {
            logger.info(`[${workerId}] Deployment ${deploymentId} cancelled. Killing container...`);
            clearInterval(pollInterval!);
            pollInterval = null;

            try {
              await execAsync(`docker stop ${containerName} --time 5`);
              await logEvent(deploymentId, 'Build container stopped due to cancellation.', 'WARNING');
            } catch {
              // Container already dead — ignore
            }
          }
        } catch { /* DB error — quietly ignore */ }
      }, 5000);
    };

    setupCancellationPoller();

    // ==========================================================================
    // DOCKER RUN — BLOCKING
    // ==========================================================================
    const exitCode = await new Promise<number>((resolve) => {
      dockerProcess = spawn('docker', dockerArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      dockerProcess.stdout?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line) logger.info(`[build-runner:${deploymentId.slice(0, 8)}] ${line}`);
      });

      dockerProcess.stderr?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        if (line) logger.warn(`[build-runner:${deploymentId.slice(0, 8)}] ${line}`);
      });

      dockerProcess.on('close', (code) => {
        resolve(code ?? 1);
      });

      dockerProcess.on('error', (err) => {
        logger.error(`[${workerId}] Docker spawn error:`, err);
        resolve(1);
      });
    });

    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }

    if (exitCode === 0) {
      await logEvent(deploymentId, `Build container exited successfully (exit code 0).`, 'END');
      return true;
    } else {
      const currentDeployment = await db.deployment.findUnique({
        where: { id: deploymentId },
        select: { status: true },
      });

      if (currentDeployment?.status !== 'CANCELLED') {
        await logEvent(
          deploymentId,
          `Build container exited with error (exit code ${exitCode}).`,
          'ERROR'
        );
        await db.deployment.update({
          where: { id: deploymentId },
          data: { status: 'ERROR' },
        });
      }
      return false;
    }
  } catch (error: any) {
    logger.error(`[${workerId}] Unexpected Docker error for ${deploymentId}:`, error);
    try {
      await logEvent(deploymentId, `BUILD FAILED: ${error.message || 'Unknown error'}`, 'ERROR');
      await db.deployment.update({
        where: { id: deploymentId },
        data: { status: 'ERROR' },
      });
    } catch (dbErr) {
      logger.error(`[${workerId}] Failed to update DB on unexpected error:`, dbErr);
    }
    return false;
  } finally {
    if (pollInterval) {
      clearInterval(pollInterval);
    }
    if (dockerProcess && !(dockerProcess as any).killed) {
      try {
        (dockerProcess as any).kill('SIGTERM');
      } catch {}
    }
  }
};
