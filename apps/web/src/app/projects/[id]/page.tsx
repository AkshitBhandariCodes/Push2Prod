'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

// ---- Types ----
// Deployment ka shape — project ke andar array mein aata hai
interface Deployment {
  id: string;
  status: string;
  commitHash: string | null;
  commitMessage: string | null;
  createdAt: string;
}

// Full project detail — deployments ke saath
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

// Deployment status ke badges — har status ka unique color scheme
const DEPLOY_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  QUEUED: { bg: 'bg-accent/10', text: 'text-accent', dot: 'bg-accent' },
  PENDING: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
  BUILDING: { bg: 'bg-warning/15', text: 'text-warning', dot: 'bg-warning' },
  READY: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  ERROR: { bg: 'bg-error/10', text: 'text-error', dot: 'bg-error' },
  CANCELLED: { bg: 'bg-text-mute/10', text: 'text-text-mute', dot: 'bg-text-mute' },
};

// Project-level status styles
const PROJECT_STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  DEPLOYING: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
  INACTIVE: { bg: 'bg-text-mute/10', text: 'text-text-mute', dot: 'bg-text-mute' },
};

// Date ko readable format mein convert karo
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

// Reusable Status Badge component
function StatusBadge({ status, styles }: { status: string; styles: Record<string, { bg: string; text: string; dot: string }> }) {
  const style = styles[status] || { bg: 'bg-text-mute/10', text: 'text-text-mute', dot: 'bg-text-mute' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

// ---- Skeleton Loader ----
// Full page skeleton — jab data load ho raha ho
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
      <div className="rounded-xl border border-border-hairline bg-card-bg p-6">
        <div className="h-5 w-32 rounded bg-border-hairline mb-4" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b border-border-hairline last:border-0">
            <div className="h-5 w-16 rounded-full bg-border-hairline" />
            <div className="h-4 w-48 rounded bg-border-hairline" />
            <div className="h-3 w-32 rounded bg-border-hairline ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Main Page Component ----
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 15+ mein params Promise hai — use() se unwrap karo
  const { id } = use(params);

  // State management
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployBanner, setDeployBanner] = useState<{ id: string; status: string } | null>(null);

  // Project data fetch karo
  const fetchProject = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4001/projects/${id}`);
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();

      if (data.status === 'success') {
        setProject(data.project);
      } else {
        throw new Error(data.message || 'Failed to fetch project');
      }
    } catch (err) {
      console.error('Error fetching project:', err);
    } finally {
      setLoading(false);
    }
  };

  // Mount par fetch karo
  useEffect(() => {
    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Deploy button click handler — POST request bhejo
  const handleDeploy = async () => {
    if (!project) return;
    setDeploying(true);
    setDeployBanner(null);

    try {
      const res = await fetch(`http://localhost:4001/projects/${id}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitMessage: `Manual deploy of ${project.name}` }),
      });

      const data = await res.json();

      if (data.status === 'success') {
        console.log('Deployment triggered:', data.deployment.id);
        // Success banner dikhao aur project re-fetch karo
        setDeployBanner({ id: data.deployment.id, status: data.deployment.status });
        // Thoda wait karke fresh data lao
        await fetchProject();
      } else {
        console.error('Deploy failed:', data.message);
      }
    } catch (err) {
      console.error('Error triggering deploy:', err);
    } finally {
      setDeploying(false);
    }
  };

  // Loading state
  if (loading) return <PageSkeleton />;

  // 404 state — project nahi mila
  if (notFound || !project) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-center rounded-xl border border-border-hairline bg-card-bg px-6 py-20 text-center">
          <div className="mb-4 text-5xl">🔍</div>
          <h2 className="text-xl font-semibold text-text-ink mb-2">Project Not Found</h2>
          <p className="text-sm text-text-mute mb-6">
            The project you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <Link
            href="/projects"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      {/* Back link */}
      <Link
        href="/projects"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-mute hover:text-text-ink transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to Projects
      </Link>

      {/* Deploy success banner — deploy ke baad dikhta hai */}
      {deployBanner && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-4 py-3">
          <svg className="h-5 w-5 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <div className="text-sm">
            <span className="font-medium text-success">Deployment queued!</span>
            <span className="text-text-mute ml-2">
              ID: <code className="font-mono text-xs">{deployBanner.id.slice(0, 8)}…</code>
              {' · '}Status: {deployBanner.status}
            </span>
          </div>
          <button
            onClick={() => setDeployBanner(null)}
            className="ml-auto text-text-mute hover:text-text-ink transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Header — project name, slug, status aur deploy button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-ink tracking-tight">{project.name}</h1>
          <p className="text-sm font-mono text-text-mute mt-1">{project.slug}</p>
          <div className="mt-2">
            <StatusBadge status={project.status} styles={PROJECT_STATUS_STYLES} />
          </div>
        </div>
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed self-start"
        >
          {/* Deploy spinner — request in-flight mein dikhta hai */}
          {deploying ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
            </svg>
          )}
          {deploying ? 'Deploying…' : 'Deploy'}
        </button>
      </div>

      {/* Build Configuration Card */}
      <div className="rounded-xl border border-border-hairline bg-card-bg p-6 mb-6">
        <h2 className="text-sm font-semibold text-text-ink uppercase tracking-wider mb-4">
          Build Configuration
        </h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {/* Har config item — label aur value */}
          <ConfigItem label="Repository" value={project.repositoryUrl || '—'} mono />
          <ConfigItem label="Branch" value={project.branch} mono />
          <ConfigItem label="Build Command" value={project.buildCommand} mono />
          <ConfigItem label="Output Directory" value={project.outputDir} mono />
          <ConfigItem label="Root Directory" value={project.rootDir} mono />
          <ConfigItem label="Created" value={formatDate(project.createdAt)} />
        </div>
      </div>

      {/* Deployments Section */}
      <div className="rounded-xl border border-border-hairline bg-card-bg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-hairline">
          <h2 className="text-sm font-semibold text-text-ink uppercase tracking-wider">
            Deployments
          </h2>
          <span className="text-xs text-text-mute">
            {project._count.deployments} total
          </span>
        </div>

        {/* Agar koi deployment nahi hai */}
        {project.deployments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-text-mute">No deployments yet. Click Deploy to get started.</p>
          </div>
        ) : (
          /* Deployment list — table jaisa layout */
          <div className="divide-y divide-border-hairline">
            {project.deployments.map((deployment) => (
              <div
                key={deployment.id}
                className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:gap-4 hover:bg-border-hairline/30 transition-colors"
              >
                {/* Status badge */}
                <div className="flex-shrink-0 w-24">
                  <StatusBadge status={deployment.status} styles={DEPLOY_STATUS_STYLES} />
                </div>

                {/* Commit message ya placeholder */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-ink truncate">
                    {deployment.commitMessage || 'No commit message'}
                  </p>
                  {deployment.commitHash && (
                    <p className="text-xs font-mono text-text-mute mt-0.5">
                      {deployment.commitHash.slice(0, 7)}
                    </p>
                  )}
                </div>

                {/* Timestamp */}
                <div className="flex-shrink-0">
                  <p className="text-xs text-text-mute">{formatDate(deployment.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Config Item Sub-component ----
// Build config section mein label-value pair dikhane ke liye
function ConfigItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-mute uppercase tracking-wider">{label}</dt>
      <dd className={`mt-1 text-sm text-text-body truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </dd>
    </div>
  );
}
