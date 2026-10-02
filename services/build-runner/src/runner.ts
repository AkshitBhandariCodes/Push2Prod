/**
 * ============================================================================
 * BUILD RUNNER — runner.ts
 * ============================================================================
 *
 * YE KYA KARTA HAI:
 *   Ye script Docker container ke andar chalti hai.
 *   Uska kaam hai: Clone → Install → Build → Upload → DB Update
 *
 *   Build-controller is container ko spawn karta hai env vars ke saath.
 *   Container complete hone ke baad khud band ho jata hai (ephemeral).
 *
 * SECURITY:
 *   - Non-root user (builduser) ke andar chalti hai
 *   - Host machine ka koi access nahi
 *   - Network sirf GitHub + MinIO tak (K8s NetworkPolicy se enforce hota hai)
 *
 * ENV VARS REQUIRED:
 *   DEPLOYMENT_ID     — Prisma DB mein deployment ka ID
 *   REPO_URL          — GitHub clone URL
 *   BRANCH            — Git branch (main / master)
 *   BUILD_CMD         — Build command (e.g. "pnpm run build")
 *   OUTPUT_DIR        — Build output folder (e.g. ".next", "dist")
 *   ROOT_DIR          — Project root within repo (e.g. "." or "frontend")
 *   DATABASE_URL      — PostgreSQL connection string
 *   S3_ENDPOINT       — MinIO endpoint (e.g. http://minio:9000)
 *   S3_BUCKET_NAME    — S3 bucket name
 *   S3_ACCESS_KEY_ID  — MinIO access key
 *   S3_SECRET_ACCESS_KEY — MinIO secret key
 * ============================================================================
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import simpleGit from 'simple-git';
import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import mime from 'mime-types';
import { db } from '@push2prod/db';
import { logger } from '@push2prod/logger';

// Promisify exec — async/await ke saath use karne ke liye
const execAsync = promisify(exec);

// ============================================================================
// ENV VAR VALIDATION
// Container start hote hi sab zaruri env vars check karo
// Agar koi missing ho, turant crash karo (fail fast principle)
// ============================================================================
const requiredEnvVars = [
  'DEPLOYMENT_ID',
  'REPO_URL',
  'BRANCH',
  'BUILD_CMD',
  'OUTPUT_DIR',
  'ROOT_DIR',
  'DATABASE_URL',
  'S3_BUCKET_NAME',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    // Crash with clear message — container orchestrator (Docker/K8s) will see exit code 1
    logger.error(`FATAL: Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Sab env vars parse kar lo — type safety ke liye
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID!;
const REPO_URL = process.env.REPO_URL!;
const BRANCH = process.env.BRANCH!;
const BUILD_CMD = process.env.BUILD_CMD!;
const OUTPUT_DIR = process.env.OUTPUT_DIR!;
const ROOT_DIR = process.env.ROOT_DIR!;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME!;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true';

// ============================================================================
// S3 CLIENT SETUP
// MinIO compatible S3 client (forcePathStyle) or Real AWS S3 with IAM Role / credentials
// ============================================================================
const s3Config: any = {
  region: S3_REGION,
  forcePathStyle: S3_FORCE_PATH_STYLE,
};

if (S3_ENDPOINT && S3_ENDPOINT.trim() !== '') {
  s3Config.endpoint = S3_ENDPOINT;
}

if (S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  };
}

const s3Client = new S3Client(s3Config);

// ============================================================================
// HELPER: DB Log writer
// Har important step ka log DB mein store karo — frontend yahan se read karta hai
// ============================================================================
const logEvent = async (
  message: string,
  type: 'START' | 'INFO' | 'WARNING' | 'ERROR' | 'END' = 'INFO'
) => {
  try {
    // BuildLog table mein save karo (frontend polling se read karega)
    await db.buildLog.create({ data: { deploymentId: DEPLOYMENT_ID, message } });
    // BuildEvent table mein bhi save karo (type-based filtering ke liye)
    await db.buildEvent.create({
      data: { deploymentId: DEPLOYMENT_ID, type, message },
    });
    // Console mein bhi print karo — Docker logs mein dikhega
    logger.info(`[build-runner] [${type}] ${message}`);
  } catch (err) {
    // Agar DB write fail ho, toh sirf console log karo — build band mat karo
    logger.warn(`[build-runner] Failed to write log to DB: ${message}`);
  }
};

// ============================================================================
// HELPER: Ensure S3 bucket exists
// Pehli deployment ke time bucket create karna padta hai
// ============================================================================
const ensureBucketExists = async () => {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: S3_BUCKET_NAME }));
  } catch (error: any) {
    // 404 ya NoSuchBucket error aaye to create karo
    if (
      error.name === 'NotFound' ||
      error.$metadata?.httpStatusCode === 404 ||
      error.name === 'NoSuchBucket'
    ) {
      await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET_NAME }));
      logger.info(`Created S3 bucket: ${S3_BUCKET_NAME}`);
    } else {
      throw error;
    }
  }
};

// ============================================================================
// HELPER: Recursively get all files in a directory
// S3 pe poora output folder upload karne ke liye har file ka path chahiye
// ============================================================================
const getAllFilesRecursively = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Recursively subdirectories mein bhi jao
      const subFiles = await getAllFilesRecursively(fullPath);
      files.push(...subFiles);
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

// ============================================================================
// HELPER: Upload entire directory to S3
// sourceDir ke sab files ko S3 prefix ke saath upload karta hai
// ============================================================================
const uploadDirectoryToS3 = async (
  sourceDir: string,
  prefix: string
): Promise<number> => {
  await ensureBucketExists();

  const allFiles = await getAllFilesRecursively(sourceDir);
  if (allFiles.length === 0) {
    await logEvent(`WARNING: No files found in output directory: ${sourceDir}`, 'WARNING');
    return 0;
  }

  // Parallel upload karo — bandwidth efficiently use hogi
  const uploadPromises = allFiles.map(async (filePath) => {
    // Relative path nikalo (S3 key structure maintain karne ke liye)
    const relativePath = path.relative(sourceDir, filePath);
    // Windows backslashes ko forward slashes se replace karo (S3 keys forward slash use karte hain)
    const s3Key = `${prefix}/${relativePath}`.replace(/\\/g, '/');

    const fileContent = await fs.readFile(filePath);
    // MIME type detect karo — browser ko sahi Content-Type milegi (CSS, JS, HTML)
    const contentType = mime.lookup(filePath) || 'application/octet-stream';

    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: s3Key,
        Body: fileContent,
        ContentType: contentType,
      })
    );
  });

  await Promise.all(uploadPromises);
  logger.info(`Uploaded ${allFiles.length} files to s3://${S3_BUCKET_NAME}/${prefix}`);
  return allFiles.length;
};

// ============================================================================
// MAIN: Build Pipeline
// Clone → (Smart Root Detection) → Install → Build → Upload → DB Update
// ============================================================================
const main = async () => {
  // Container ke andar /tmp mein workspace banao (non-root user ka writable location)
  const workspacePath = `/tmp/build-${DEPLOYMENT_ID}`;

  try {
    await logEvent(`Build runner started in isolated container`, 'START');
    await logEvent(`Repository: ${REPO_URL} | Branch: ${BRANCH}`);

    // ==========================================================================
    // STEP 1: Create clean workspace directory
    // ==========================================================================
    await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(workspacePath, { recursive: true });

    // ==========================================================================
    // STEP 2: Clone repository
    // First try specified branch, fallback to default branch if not found
    // ==========================================================================
    await logEvent(`Cloning repository (branch: ${BRANCH})...`);
    const git = simpleGit(workspacePath);

    try {
      // Shallow clone (--depth 1) — sirf latest commit chahiye, puri history nahi
      await git.clone(REPO_URL, '.', ['--depth', '1', '--branch', BRANCH]);
    } catch (cloneErr: any) {
      // Agar specified branch nahi mili (e.g. "main" instead of "master")
      // Fallback: bina branch ke clone karo (default branch use hogi)
      await logEvent(
        `WARNING: Branch '${BRANCH}' not found. Falling back to default branch...`,
        'WARNING'
      );
      await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(workspacePath, { recursive: true });
      const fallbackGit = simpleGit(workspacePath);
      await fallbackGit.clone(REPO_URL, '.', ['--depth', '1']);
      await logEvent(`Cloned default branch successfully.`);
    }

    // ==========================================================================
    // STEP 3: Smart Root Directory Detection
    // Agar ROOT_DIR mein package.json nahi mila, auto-detect karo
    // ==========================================================================
    let projectRootPath = path.join(workspacePath, ROOT_DIR);
    let isStaticSite = false;

    // Ensure configured root dir exists
    try {
      await fs.access(projectRootPath);
    } catch {
      throw new Error(`Configured Root Directory '${ROOT_DIR}' does not exist in repository.`);
    }

    // Package.json check karo
    const pkgJsonPath = path.join(projectRootPath, 'package.json');
    try {
      await fs.access(pkgJsonPath);
      await logEvent(`package.json found at root. Proceeding with Node.js build.`);
    } catch {
      // Package.json nahi mila — sub-directories scan karo
      const dirs = await fs.readdir(projectRootPath, { withFileTypes: true });
      const possibleRoots: string[] = [];

      for (const d of dirs) {
        if (d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules') {
          try {
            await fs.access(path.join(projectRootPath, d.name, 'package.json'));
            possibleRoots.push(d.name);
          } catch {}
        }
      }

      if (possibleRoots.length === 1) {
        // Ek hi option mila — use kar lo
        projectRootPath = path.join(projectRootPath, possibleRoots[0]);
        await logEvent(`Auto-detected project root: '${possibleRoots[0]}'`);
      } else if (possibleRoots.length > 1) {
        // Multiple options — common names se guess karo
        const priorityNames = ['frontend', 'client', 'web', 'app', 'ui'];
        const match = possibleRoots.find((r) => priorityNames.includes(r.toLowerCase()));
        if (match) {
          projectRootPath = path.join(projectRootPath, match);
          await logEvent(`Multiple package.json found. Using '${match}' (priority match).`);
        } else {
          throw new Error(
            `Multiple package.json found: [${possibleRoots.join(', ')}]. Set Root Directory manually.`
          );
        }
      } else {
        // Koi package.json nahi — check karo ki static HTML site hai
        const filesInDir = await fs.readdir(projectRootPath);
        if (filesInDir.includes('index.html')) {
          isStaticSite = true;
          await logEvent(`No package.json found. Detected pure static HTML site.`);
        } else {
          throw new Error(
            `No package.json found in '${ROOT_DIR}'. Files: [${filesInDir.join(', ')}]`
          );
        }
      }
    }

    if (!isStaticSite) {
      // ==========================================================================
      // STEP 4: Install dependencies
      // .npmrc mein node-linker=hoisted likhna Windows MAX_PATH errors fix karta hai
      // ==========================================================================
      await fs.writeFile(path.join(projectRootPath, '.npmrc'), 'node-linker=hoisted\n');

      const localBinPath = path.join(projectRootPath, 'node_modules', '.bin');
      const updatedPath = `${localBinPath}:${process.env.PATH || ''}`;

      const installEnv = {
        ...process.env,
        // devDependencies install hongi — vite/next build time pe chahiye
        NODE_ENV: 'development',
        PATH: updatedPath,
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      };

      await logEvent(`Running pnpm install...`);
      try {
        await execAsync('pnpm install --no-frozen-lockfile --ignore-workspace --ignore-scripts', {
          cwd: projectRootPath,
          env: installEnv,
          timeout: 5 * 60 * 1000, // 5 minute timeout
          maxBuffer: 50 * 1024 * 1024, // 50MB output buffer
        });
        await logEvent(`pnpm install completed.`);
      } catch (installErr: any) {
        const fullOutput = [installErr.stdout, installErr.stderr].filter(Boolean).join('\n').trim();
        const errMsg = fullOutput || installErr.message;
        throw new Error(`pnpm install failed:\n${errMsg}`);
      }

      // Windows OS file handle release ke liye 2 second wait (Docker/Linux mein zaruri nahi, harmless hai)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // ==========================================================================
      // STEP 5: Run build command
      // ==========================================================================
      let finalBuildCmd = BUILD_CMD;
      // Agar user ne npm run build likha hai, pnpm se run karo
      if (finalBuildCmd.startsWith('npm ')) {
        finalBuildCmd = finalBuildCmd.replace('npm ', 'pnpm ');
      }

      const buildEnv = { 
        ...process.env, 
        PATH: updatedPath,
        COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', 
      };

      await logEvent(`Executing build command: ${finalBuildCmd}`);
      try {
        await execAsync(finalBuildCmd, {
          cwd: projectRootPath,
          env: buildEnv,
          timeout: 10 * 60 * 1000, // 10 minute timeout
          maxBuffer: 50 * 1024 * 1024,
        });
        await logEvent(`Build command completed successfully.`);
      } catch (buildErr: any) {
        const fullOutput = [buildErr.stdout, buildErr.stderr].filter(Boolean).join('\n').trim();
        const errMsg = fullOutput || buildErr.message;
        throw new Error(`Build command failed:\n${errMsg}`);
      }
    } else {
      await logEvent(`Static site detected. Skipping install and build steps.`);
    }

    // ==========================================================================
    // STEP 6: Validate output directory
    // Build ke baad output folder exist karna chahiye
    // Agar nahi mila, common fallback directories try karo
    // ==========================================================================
    let finalOutputDir = isStaticSite
      ? projectRootPath
      : path.join(projectRootPath, OUTPUT_DIR);

    if (!isStaticSite) {
      try {
        await fs.access(finalOutputDir);
      } catch {
        // Common output directories try karo
        const fallbacks = ['.next', 'dist', 'build', 'out', 'public'];
        let found = false;
        for (const fb of fallbacks) {
          if (fb === OUTPUT_DIR) continue;
          const testPath = path.join(projectRootPath, fb);
          try {
            await fs.access(testPath);
            await logEvent(
              `WARNING: Output dir '${OUTPUT_DIR}' not found. Using '${fb}' instead.`,
              'WARNING'
            );
            finalOutputDir = testPath;
            found = true;
            break;
          } catch {}
        }
        if (!found) {
          throw new Error(
            `Build output directory '${OUTPUT_DIR}' not found after build.`
          );
        }
      }
    }

    // ==========================================================================
    // STEP 7: Upload artifacts to S3/MinIO
    // S3 key format: deployments/<deploymentId>/<relative-file-path>
    // ==========================================================================
    const s3Prefix = `deployments/${DEPLOYMENT_ID}`;
    await logEvent(`Uploading build artifacts to S3 (prefix: ${s3Prefix})...`);

    const uploadedCount = await uploadDirectoryToS3(finalOutputDir, s3Prefix);
    await logEvent(`Uploaded ${uploadedCount} files to S3.`);

    // ==========================================================================
    // STEP 7b: Detect serve root — where index.html actually lives
    // This is the Vercel approach: scan the output dir for index.html,
    // the directory containing it becomes the "serve root" for routing.
    //
    // Examples:
    //   Standard Vite/CRA:       dist/index.html          → serveDir = ''
    //   Vite full-stack app:     dist/public/index.html   → serveDir = 'public'
    //   Next.js static export:   out/index.html           → serveDir = ''
    //   Hugo/Jekyll:             public/index.html (root) → serveDir = ''
    // ==========================================================================
    let serveDir = ''; // relative to finalOutputDir — default is root

    const findIndexHtml = async (dir: string, baseDir: string): Promise<string | null> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        // Check if index.html exists at this level
        if (entries.some((e) => e.isFile() && e.name === 'index.html')) {
          return path.relative(baseDir, dir).replace(/\\/g, '/');
        }
        // Recurse into subdirectories (excluding node_modules, .git, hidden dirs)
        for (const entry of entries) {
          if (
            entry.isDirectory() &&
            !entry.name.startsWith('.') &&
            entry.name !== 'node_modules'
          ) {
            const found = await findIndexHtml(path.join(dir, String(entry.name)), baseDir);
            if (found !== null) return found;
          }
        }
      } catch { /* dir not accessible */ }
      return null;
    };

    const detectedServeDir = await findIndexHtml(finalOutputDir, finalOutputDir);
    if (detectedServeDir !== null) {
      serveDir = detectedServeDir; // e.g. '' or 'public' or 'out'
      if (serveDir) {
        await logEvent(`Detected serve root: '${serveDir}/' (index.html found there)`);
      } else {
        await logEvent(`Detected serve root: '/' (index.html at output root)`);
      }
    } else {
      await logEvent(`WARNING: No index.html found in output. Site may not render correctly.`, 'WARNING');
    }

    // ==========================================================================
    // STEP 8: Update deployment status to READY in DB
    // Build controller ya routing service yahan se status read karega
    // ==========================================================================
    await db.deployment.update({
      where: { id: DEPLOYMENT_ID },
      data: {
        status: 'READY',
        artifactPrefix: s3Prefix,
        serveDir: serveDir,          // Sub-path within prefix where index.html lives
        artifactBucket: S3_BUCKET_NAME,
        uploadedFilesCount: uploadedCount,
        artifactUploadedAt: new Date(),
      },
    });

    await logEvent(`Deployment READY! Artifacts available at: ${s3Prefix}/${serveDir}`, 'END');
    logger.info(`[build-runner] Build completed successfully for ${DEPLOYMENT_ID}`);

    // Process successfully exit karo — Docker container band ho jayega
    process.exit(0);
  } catch (error: any) {
    // ==========================================================================
    // ERROR HANDLING: Build fail ho gaya
    // DB mein ERROR status update karo aur container exit karo code 1 se
    // ==========================================================================
    const errorMessage = error.message || 'Unknown build error';
    logger.error(`[build-runner] Build FAILED for ${DEPLOYMENT_ID}:`, error);

    try {
      await logEvent(`BUILD FAILED: ${errorMessage}`, 'ERROR');
      await db.deployment.update({
        where: { id: DEPLOYMENT_ID },
        data: { status: 'ERROR' },
      });
    } catch (dbErr) {
      logger.error(`[build-runner] Failed to update DB on error:`, dbErr);
    }

    // Non-zero exit code — Docker/K8s ko pata chalega ki job fail hua
    process.exit(1);
  } finally {
    // ==========================================================================
    // CLEANUP: Workspace delete karo
    // Container ephemeral hai, lekin temp space free karo (good practice)
    // ==========================================================================
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
      logger.info(`[build-runner] Workspace cleaned up: ${workspacePath}`);
    } catch {}
  }
};

// Script start karo
main();
