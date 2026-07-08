'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Field-level error ka type — API se aata hai
interface FieldError {
  field: string;
  message: string;
}

// Name se slug auto-generate karne ka helper
// Lowercase, spaces ko hyphens mein, special chars remove
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export default function NewProjectPage() {
  const router = useRouter();

  // Form fields ka state — sab ek jagah manage ho rahe hain
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [outputDir, setOutputDir] = useState('dist');
  const [rootDir, setRootDir] = useState('.');

  // UI state — loading, errors, global message
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // Name change hone par slug auto-generate karo (agar user ne manually edit nahi kiya)
  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(generateSlug(name));
    }
  }, [name, slugManuallyEdited]);

  // Specific field ka error dhundho — form mein dikhane ke liye
  const getFieldError = useCallback(
    (field: string): string | null => {
      const err = fieldErrors.find((e) => e.field === field);
      return err ? err.message : null;
    },
    [fieldErrors]
  );

  // Form submit handler — API ko data bhejo
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setGlobalError(null);
    setFieldErrors([]);

    try {
      const res = await fetch('http://localhost:4001/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          repositoryUrl: repositoryUrl || undefined,
          branch,
          buildCommand,
          outputDir,
          rootDir,
        }),
      });

      const data = await res.json();

      if (res.ok && data.status === 'success') {
        // Success — project detail page par redirect karo
        console.log('Project created successfully:', data.project.id);
        router.push(`/projects/${data.project.id}`);
        return;
      }

      // Error handling — field errors aur global errors dono handle karo
      if (data.errors && Array.isArray(data.errors)) {
        setFieldErrors(data.errors);
      }
      setGlobalError(data.message || 'Failed to create project');
    } catch (err) {
      console.error('Error creating project:', err);
      setGlobalError('Could not connect to server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Shared input classes — consistency ke liye reusable string
  const inputClasses =
    'w-full rounded-lg border bg-input-bg border-input-border px-4 py-2.5 text-sm text-text-ink placeholder:text-text-mute/60 focus:border-input-focus focus:ring-1 focus:ring-input-focus outline-none transition duration-150';

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      {/* Back link — projects list par wapas */}
      <Link
        href="/projects"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-mute hover:text-text-ink transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to Projects
      </Link>

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-ink tracking-tight">Create a New Project</h1>
        <p className="text-sm text-text-mute mt-1">
          Configure your project settings and deploy it instantly.
        </p>
      </div>

      {/* Global error banner — agar API ne overall error diya */}
      {globalError && (
        <div className="mb-6 rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
          {globalError}
        </div>
      )}

      {/* Form — sabse important part */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ---- Project Name ---- */}
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-text-ink">
            Project Name
          </label>
          <input
            id="name"
            type="text"
            required
            placeholder="My Portfolio Site"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClasses}
          />
          {getFieldError('name') && (
            <p className="mt-1.5 text-xs text-error">{getFieldError('name')}</p>
          )}
        </div>

        {/* ---- Slug ---- */}
        {/* Auto-generate hota hai name se, but manually bhi edit kar sakte ho */}
        <div>
          <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-text-ink">
            Slug
          </label>
          <input
            id="slug"
            type="text"
            required
            placeholder="my-portfolio-site"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugManuallyEdited(true);
            }}
            className={inputClasses}
          />
          {/* Slug preview — domain ke saath dikhao */}
          {slug && (
            <p className="mt-1.5 text-xs text-text-mute font-mono">
              {slug}.vercel-pro.app
            </p>
          )}
          {getFieldError('slug') && (
            <p className="mt-1.5 text-xs text-error">{getFieldError('slug')}</p>
          )}
        </div>

        {/* ---- Repository URL ---- */}
        <div>
          <label htmlFor="repositoryUrl" className="mb-1.5 block text-sm font-medium text-text-ink">
            Repository URL
            <span className="ml-1.5 text-xs font-normal text-text-mute">(optional)</span>
          </label>
          <input
            id="repositoryUrl"
            type="url"
            placeholder="https://github.com/username/repo"
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            className={inputClasses}
          />
          {getFieldError('repositoryUrl') && (
            <p className="mt-1.5 text-xs text-error">{getFieldError('repositoryUrl')}</p>
          )}
        </div>

        {/* ---- Branch ---- */}
        <div>
          <label htmlFor="branch" className="mb-1.5 block text-sm font-medium text-text-ink">
            Branch
          </label>
          <input
            id="branch"
            type="text"
            placeholder="main"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className={inputClasses}
          />
          {getFieldError('branch') && (
            <p className="mt-1.5 text-xs text-error">{getFieldError('branch')}</p>
          )}
        </div>

        {/* ---- Build Settings — ek row mein teen fields ---- */}
        <div className="rounded-xl border border-border-hairline bg-card-bg p-5">
          <h3 className="text-sm font-semibold text-text-ink mb-4">Build Settings</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Build Command */}
            <div>
              <label htmlFor="buildCommand" className="mb-1.5 block text-xs font-medium text-text-body">
                Build Command
              </label>
              <input
                id="buildCommand"
                type="text"
                placeholder="npm run build"
                value={buildCommand}
                onChange={(e) => setBuildCommand(e.target.value)}
                className={inputClasses}
              />
              {getFieldError('buildCommand') && (
                <p className="mt-1 text-xs text-error">{getFieldError('buildCommand')}</p>
              )}
            </div>

            {/* Output Directory */}
            <div>
              <label htmlFor="outputDir" className="mb-1.5 block text-xs font-medium text-text-body">
                Output Directory
              </label>
              <input
                id="outputDir"
                type="text"
                placeholder="dist"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                className={inputClasses}
              />
              {getFieldError('outputDir') && (
                <p className="mt-1 text-xs text-error">{getFieldError('outputDir')}</p>
              )}
            </div>

            {/* Root Directory */}
            <div>
              <label htmlFor="rootDir" className="mb-1.5 block text-xs font-medium text-text-body">
                Root Directory
              </label>
              <input
                id="rootDir"
                type="text"
                placeholder="."
                value={rootDir}
                onChange={(e) => setRootDir(e.target.value)}
                className={inputClasses}
              />
              {getFieldError('rootDir') && (
                <p className="mt-1 text-xs text-error">{getFieldError('rootDir')}</p>
              )}
            </div>
          </div>
        </div>

        {/* ---- Submit Button ---- */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/projects"
            className="rounded-lg border border-border-hairline px-4 py-2.5 text-sm font-medium text-text-body transition-colors hover:bg-card-bg hover:text-text-ink"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* Spinner — jab submit ho raha ho tab dikhao */}
            {submitting && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
