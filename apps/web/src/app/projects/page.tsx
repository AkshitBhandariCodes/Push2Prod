'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { fetchApi } from '@/lib/api';

// ---- Types ----
// Backend se aane wala project ka shape define kar rahe hain
interface Project {
  id: string;
  name: string;
  slug: string;
  repositoryUrl: string | null;
  branch: string;
  status: 'ACTIVE' | 'DEPLOYING' | 'INACTIVE';
  createdAt: string;
  _count: {
    deployments: number;
  };
}

// Status badge ke liye color mapping â€” har status ka apna color
const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE: { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success' },
  DEPLOYING: { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning' },
  INACTIVE: { bg: 'bg-text-mute/10', text: 'text-text-mute', dot: 'bg-text-mute' },
};

// Date ko readable format mein convert karne ka helper
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Repo URL ko truncate karna â€” display ke liye chhota banana
function truncateUrl(url: string | null): string {
  if (!url) return 'â€”';
  try {
    const parsed = new URL(url);
    // "github.com/username/repo" format mein dikhao
    return parsed.host + parsed.pathname.replace(/\.git$/, '');
  } catch {
    return url.length > 40 ? url.substring(0, 40) + 'â€¦' : url;
  }
}

// ---- Status Badge Component ----
// Reusable badge â€” dot + label ke saath
function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.INACTIVE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

// ---- Skeleton Loader ----
// Jab data load ho raha ho tab pulsing cards dikhao
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border-hairline bg-card-bg p-5 animate-pulse">
      <div className="h-5 w-2/3 rounded bg-border-hairline mb-3" />
      <div className="h-3.5 w-1/2 rounded bg-border-hairline mb-4" />
      <div className="h-3 w-full rounded bg-border-hairline mb-2" />
      <div className="flex items-center justify-between mt-4">
        <div className="h-5 w-16 rounded-full bg-border-hairline" />
        <div className="h-3 w-20 rounded bg-border-hairline" />
      </div>
    </div>
  );
}

// ---- Main Page Component ----
export default function ProjectsPage() {
  // State management â€” projects, loading aur error track karna
  const { data: session, status } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // API se projects fetch karne ka function
  const fetchProjects = async () => {
    if (!session?.user?.id) return;
    
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi('/projects', {
        headers: { 'x-user-id': session.user.id }
      });
      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();

      if (data.status === 'success') {
        setProjects(data.projects);
      } else {
        throw new Error(data.message || 'Failed to fetch projects');
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Jab bhi session ka status change ho tab fetch karo
  useEffect(() => {
    if (status === 'authenticated') {
      fetchProjects();
    } else if (status === 'unauthenticated') {
      setLoading(false);
      setError('Please sign in to view your projects.');
    }
  }, [status, session]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {/* Header â€” title aur new project button */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-text-ink tracking-tight">Projects</h1>
          <p className="text-sm text-text-mute mt-1">
            Manage and deploy your applications
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          {/* Plus icon â€” SVG se banaya hai */}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Project
        </Link>
      </div>

      {/* Loading State â€” skeleton cards dikhao jab tak data aaye */}
      {loading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Error State â€” retry button ke saath red error message */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-error/20 bg-error/5 px-6 py-16 text-center">
          <svg className="mb-4 h-10 w-10 text-error" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <p className="text-sm font-medium text-error mb-1">Failed to load projects</p>
          <p className="text-xs text-text-mute mb-4">{error}</p>
          <button
            onClick={fetchProjects}
            className="rounded-lg border border-border-hairline bg-card-bg px-4 py-2 text-sm font-medium text-text-ink transition-colors hover:bg-border-hairline"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State â€” jab koi project na ho */}
      {!loading && !error && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-hairline px-6 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border-hairline bg-card-bg">
            <svg className="h-6 w-6 text-text-mute" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-text-ink mb-1">No Projects Yet</h3>
          <p className="text-sm text-text-mute mb-6 max-w-sm">
            Get started by creating your first project to deploy on Push2Prod.
          </p>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
          >
            Create your first project
          </Link>
        </div>
      )}

      {/* Projects Grid â€” responsive cards ka grid */}
      {!loading && !error && projects.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group rounded-xl border border-border-hairline bg-card-bg p-5 transition-all duration-200 hover:border-text-mute/40 hover:scale-[1.01]"
            >
              {/* Project name aur status badge */}
              <div className="flex items-start justify-between mb-1.5">
                <h3 className="text-base font-semibold text-text-ink group-hover:text-accent transition-colors">
                  {project.name}
                </h3>
                <StatusBadge status={project.status} />
              </div>

              {/* Slug â€” mono font mein */}
              <p className="text-sm font-mono text-text-mute mb-3">{project.slug}</p>

              {/* Repo URL â€” truncated */}
              <p className="text-xs text-text-body truncate mb-4" title={project.repositoryUrl || undefined}>
                {truncateUrl(project.repositoryUrl)}
              </p>

              {/* Footer â€” deployment count aur created date */}
              <div className="flex items-center justify-between border-t border-border-hairline pt-3">
                <span className="text-xs text-text-mute">
                  {project._count.deployments} deployment{project._count.deployments !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-text-mute">
                  {formatDate(project.createdAt)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
