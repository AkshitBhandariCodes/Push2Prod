import { db } from '@vercel-pro/db';
import { logger } from '@vercel-pro/logger';
import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface BuildOptions {
  deploymentId: string;
  repositoryUrl: string;
  branch: string;
  buildCommand: string;
  outputDir: string;
  rootDir: string;
  workerId: string;
}

// DB log function — frontend logs stream ya page reload par yahi se read karega
const logEvent = async (deploymentId: string, message: string, type: 'START' | 'INFO' | 'WARNING' | 'ERROR' | 'END' = 'INFO') => {
  await db.buildLog.create({
    data: { deploymentId, message }
  });
  await db.buildEvent.create({
    data: { deploymentId, type, message }
  });
};

export const performCloneAndBuild = async (options: BuildOptions): Promise<boolean> => {
  const { deploymentId, repositoryUrl, branch, buildCommand, outputDir, rootDir, workerId } = options;
  
  // OS independent temporary directory
  const workspacePath = path.join(os.tmpdir(), 'vercel-pro-builds', deploymentId);

  try {
    await logEvent(deploymentId, `[${workerId}] Starting build process...`, 'START');
    
    // ==========================================
    // PHASE 6: Real GitHub Clone
    // ==========================================
    if (!repositoryUrl) {
      throw new Error('Repository URL is missing. Cannot proceed.');
    }

    await logEvent(deploymentId, `Creating workspace at ${workspacePath}`);
    await fs.mkdir(workspacePath, { recursive: true });

    const git = simpleGit(workspacePath);

    await logEvent(deploymentId, `Cloning repository: ${repositoryUrl}`);
    await git.clone(repositoryUrl, '.'); // current folder (.) mein clone
    
    await logEvent(deploymentId, `Checking out branch: ${branch}`);
    await git.checkout(branch);

    const projectRootPath = path.join(workspacePath, rootDir);
    try {
      const stats = await fs.stat(projectRootPath);
      if (!stats.isDirectory()) throw new Error('Not a directory');
    } catch (err) {
      throw new Error(`Configured root directory '${rootDir}' does not exist in repository.`);
    }

    await logEvent(deploymentId, 'Repository cloned successfully');

    // ==========================================
    // PHASE 7: Real Build Execution
    // ==========================================
    // Verify package.json exists (assuming Node.js project for now)
    const packageJsonPath = path.join(projectRootPath, 'package.json');
    try {
      await fs.stat(packageJsonPath);
    } catch {
      throw new Error('No package.json found. Currently only Node.js projects are supported.');
    }

    await logEvent(deploymentId, 'Running npm install...');
    // execAsync output capture karke logs mein daalega
    const { stdout: installOut, stderr: installErr } = await execAsync('npm install', { 
      cwd: projectRootPath,
      timeout: 5 * 60000 // 5 min timeout
    });
    
    // Optionally log some of the stdout, but keep it brief so DB doesn't explode
    await db.buildLog.create({ data: { deploymentId, message: 'npm install completed' } });

    await logEvent(deploymentId, `Executing build command: ${buildCommand}`);
    const { stdout: buildOut, stderr: buildErr } = await execAsync(buildCommand, { 
      cwd: projectRootPath,
      timeout: 10 * 60000 // 10 min timeout
    });

    await db.buildLog.create({ data: { deploymentId, message: 'Build command finished' } });

    // Validate Output Directory exists
    const finalOutputDir = path.join(projectRootPath, outputDir);
    try {
      const outStats = await fs.stat(finalOutputDir);
      if (!outStats.isDirectory()) throw new Error('Output is not a directory');
    } catch (err) {
      throw new Error(`Build finished, but output directory '${outputDir}' was not found. Check your build command and output directory settings.`);
    }

    await logEvent(deploymentId, 'Build completed successfully. Output directory verified.', 'END');
    
    // CLEANUP Phase
    await fs.rm(workspacePath, { recursive: true, force: true });
    
    return true; // Success!

  } catch (error: any) {
    logger.error(`[${workerId}] Build failed for ${deploymentId}:`, error);
    await logEvent(deploymentId, `BUILD FAILED: ${error.message}`, 'ERROR');
    
    // Always attempt cleanup on failure too
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
    } catch (e) {}

    return false; // Failed
  }
};
