'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { fetchApi } from '@/lib/api';

// ---- Types ----
interface Deployment {
  id: string;
  status: string;
  commitHash: string | null;
  commitMessage: string | null;
  attemptCount: number;
  lockedBy: string | null;
  lastError: string | null;
  uploadedFilesCount?: number | null;
  artifactPrefix?: string | null;
  createdAt: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  repositoryUrl: string | null;
  branch: string;
  buildCommand: string;
  outputDir: string;
  rootDir: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deployments: Deployment[];
  _count: {
    deployments: number;
  };
}

const DEPLOY_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  QUEUED: { bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent' },
  PENDING: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
  BUILDING: { bg: 'bg-warning/15', text: 'text-warning', dot: 'bg-warning' },
  READY: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  ERROR: { bg: 'bg-error/10', text: 'text-error', dot: 'bg-error' },
  CANCELLED: { bg: 'bg-text-mute/10', text: 'text-text-mute', dot: 'bg-text-mute' },
};

const PROJECT_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  DEPLOYING: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
  INACTIVE: { bg: 'bg-text-mute/10', text: 'text-text-mute', dot: 'bg-text-mute' },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status, styles }: { status: string; styles: Record<string, { bg: string; text: string; dot: string }> }) {
  const style = styles[status] || { bg: 'bg-text-mute/10', text: 'text-text-mute', dot: 'bg-text-mute' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 animate-pulse">
      <div className="h-4 w-24 rounded bg-border-hairline mb-8" />
      <div className="h-8 w-64 rounded bg-border-hairline mb-2" />
      <div className="h-4 w-40 rounded bg-border-hairline mb-6" />
      <div className="rounded-xl border border-border-hairline bg-card-bg p-6 mb-6">
        <div className="h-5 w-32 rounded bg-border-hairline mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 rounded bg-border-hairline mb-2" />
              <div className="h-4 w-36 rounded bg-border-hairline" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Logs Panel Component ----
function LogsPanel({ deploymentId, userId, onClose }: { deploymentId: string, userId: string, onClose: () => void }) {
  const [logs, setLogs] = useState<{ id: string, message: string, createdAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Simple polling implementation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchLogs = async () => {
      try {
        const res = await fetchApi(`/deployments/${deploymentId}/logs`, {
          headers: { 'x-user-id': userId }
        });
        const data = await res.json();
        if (data.status === 'success') {
          setLogs(data.logs);
        }
      } catch (err) {
        console.error('Failed to fetch logs', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    interval = setInterval(fetchLogs, 3000); // Poll every 3s

    return () => clearInterval(interval);
  }, [deploymentId, userId]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card-bg border-l border-border-hairline h-full flex flex-col shadow-2xl animate-in slide-in-from-right">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-hairline">
          <div>
            <h3 className="font-semibold text-text-ink">Build Logs</h3>
            <p className="text-xs font-mono text-text-mute mt-0.5">{deploymentId}</p>
          </div>
          <button onClick={onClose} className="p-2 text-text-mute hover:text-text-ink rounded-full hover:bg-border-hairline/50 transition-colors">
            ✕
          </button>
        </div>
        
        <div className="flex-1 overflow-auto bg-black p-4 font-mono text-xs text-gray-300">
          {loading && logs.length === 0 ? (
            <div className="flex items-center gap-2 text-gray-500">
              <span className="animate-pulse">Loading build environment...</span>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map(log => (
                <div key={log.id} className="flex gap-4">
                  <span className="text-gray-600 shrink-0 select-none">
                    {new Date(log.createdAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className="break-all whitespace-pre-wrap">{log.message}</span>
                </div>
              ))}
              <div className="animate-pulse text-gray-500 mt-4">_</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployBanner, setDeployBanner] = useState<{ id: string; status: string } | null>(null);
  const [viewLogsId, setViewLogsId] = useState<string | null>(null);

  const fetchProject = async () => {
    if (!session?.user?.id) return;
    // Silently fetch in background if we already have data
    if (!project) setLoading(true);
    
    try {
      const res = await fetchApi(`/projects/${id}`, {
        headers: { 'x-user-id': session.user.id }
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();

      if (data.status === 'success') {
        setProject(data.project);
      }
    } catch (err) {
      console.error('Error fetching project:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchProject();
      
      // Auto-refresh project data every 5s to see deployment status updates
      const interval = setInterval(fetchProject, 5000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);

  const handleDeploy = async () => {
    if (!project || !session?.user?.id) return;
    setDeploying(true);
    setDeployBanner(null);

    try {
      const res = await fetchApi(`/projects/${id}/deploy`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': session.user.id
        },
        body: JSON.stringify({ commitMessage: `Manual deploy of ${project.name}` }),
      });

      const data = await res.json();

      if (data.status === 'success') {
        setDeployBanner({ id: data.deployment.id, status: data.deployment.status });
        await fetchProject();
      }
    } catch (err) {
      console.error('Error triggering deploy:', err);
    } finally {
      setDeploying(false);
    }
  };

  const handleCancelDeployment = async (deploymentId: string) => {
    if (!session?.user?.id) return;
    try {
      const res = await fetchApi(`/deployments/${deploymentId}/cancel`, {
        method: 'POST',
        headers: { 'x-user-id': session.user.id }
      });
      if (res.ok) {
        await fetchProject();
      } else {
        const data = await res.json();
        alert(`Failed to cancel: ${data.message || 'Unknown error'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Network error while cancelling deployment.');
    }
  };

  if (loading && !project) return <PageSkeleton />;

  if (notFound || !project) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 text-center">
        <h2 className="text-xl">Project Not Found</h2>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      {viewLogsId && session?.user?.id && <LogsPanel deploymentId={viewLogsId} userId={session.user.id} onClose={() => setViewLogsId(null)} />}
      
      <Link href="/projects" className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-mute hover:text-text-ink transition-colors">
        ← Back to Projects
      </Link>

      {deployBanner && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-4 py-3">
          <span className="font-medium text-success">Deployment queued!</span>
          <span className="text-text-mute ml-2 text-sm">
            ID: <code className="font-mono text-xs">{deployBanner.id.slice(0, 8)}…</code>
          </span>
          <button onClick={() => setDeployBanner(null)} className="ml-auto text-text-mute hover:text-text-ink">✕</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-ink tracking-tight">{project.name}</h1>
          <p className="text-sm font-mono text-text-mute mt-1">{project.slug}</p>
        </div>
        <div className="flex gap-3">
          <a
            href={`http://${project.slug}.localhost:4002/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-card-bg border border-border-hairline px-5 py-2.5 text-sm font-medium text-text-ink transition-colors hover:bg-page-bg"
          >
            Live URL
          </a>
          <Link
            href={`/projects/${project.id}/settings`}
            className="inline-flex items-center gap-2 rounded-lg bg-card-bg border border-border-hairline px-5 py-2.5 text-sm font-medium text-text-ink transition-colors hover:bg-page-bg"
          >
            Settings
          </Link>
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {deploying ? 'Deploying…' : 'Deploy'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border-hairline bg-card-bg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-hairline">
          <h2 className="text-sm font-semibold text-text-ink uppercase tracking-wider">Deployments</h2>
        </div>

        {project.deployments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-text-mute">No deployments yet.</div>
        ) : (
          <div className="divide-y divide-border-hairline">
            {project.deployments.map((deployment) => (
              <div key={deployment.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:gap-4 hover:bg-border-hairline/30 transition-colors">
                <div className="flex-shrink-0 w-28">
                  <StatusBadge status={deployment.status} styles={DEPLOY_STATUS_STYLES} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-ink truncate">
                    {deployment.commitMessage || 'Manual Deployment'}
                  </p>
                  
                  {/* Reliability Fields UI */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs text-text-mute">{formatDate(deployment.createdAt)}</span>
                    
                    {deployment.attemptCount > 0 && (
                      <span className="text-[10px] uppercase font-bold tracking-wider text-warning">
                        Attempt {deployment.attemptCount}
                      </span>
                    )}
                    
                    {deployment.lockedBy && (
                      <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                        {deployment.lockedBy}
                      </span>
                    )}

                    {deployment.uploadedFilesCount !== undefined && deployment.uploadedFilesCount !== null && (
                      <span className="text-xs font-mono text-success bg-success/10 px-1.5 py-0.5 rounded">
                        {deployment.uploadedFilesCount} files uploaded
                      </span>
                    )}
                  </div>

                  {deployment.lastError && (
                    <p className="text-xs text-error mt-1.5 bg-error/10 px-2 py-1.5 rounded border border-error/20 inline-block w-full truncate">
                      <strong className="font-semibold mr-1">Error:</strong> {deployment.lastError}
                    </p>
                  )}
                  
                  {deployment.artifactPrefix && (
                    <p className="text-xs text-text-mute mt-1 font-mono truncate">
                      S3 Prefix: {deployment.artifactPrefix}
                    </p>
                  )}
                </div>

                <div className="flex-shrink-0 flex items-center gap-2">
                  {['QUEUED', 'PENDING', 'BUILDING'].includes(deployment.status) && (
                    <button 
                      onClick={() => handleCancelDeployment(deployment.id)}
                      className="text-xs font-medium text-error bg-error/10 border border-error/20 px-3 py-1.5 rounded-md hover:bg-error hover:text-white transition-colors"
                    >
                      Stop
                    </button>
                  )}
                  <button 
                    onClick={() => setViewLogsId(deployment.id)}
                    className="text-xs font-medium text-text-ink bg-background border border-border-hairline px-3 py-1.5 rounded-md hover:bg-border-hairline/50 transition-colors"
                  >
                    View Logs
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
