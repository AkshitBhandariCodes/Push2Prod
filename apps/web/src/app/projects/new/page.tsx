'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { fetchApi } from '@/lib/api';
import { Lock } from 'lucide-react';

// Types
interface FieldError {
  field: string;
  message: string;
}

interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  url: string;
  cloneUrl: string;
  updatedAt: string;
}

interface EnvVar {
  key: string;
  value: string;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export default function NewProjectPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [buildCommand, setBuildCommand] = useState('npm run build');
  const [outputDir, setOutputDir] = useState('dist');
  const [rootDir, setRootDir] = useState('.');
  
  // Phase 12: Environment Variables
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: '', value: '' }]);

  // Phase 12: GitHub Repositories
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // UI State
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

  // Fetch Repositories on mount
  useEffect(() => {
    if (status === 'authenticated') {
      const fetchRepos = async () => {
        try {
          setLoadingRepos(true);
          const res = await fetch('/api/github/repos');
          const data = await res.json();
          if (res.ok && data.status === 'success') {
            setRepos(data.repos);
          } else {
            setRepoError(data.message || 'Failed to load repositories');
          }
        } catch (err) {
          setRepoError('Network error while loading repositories');
        } finally {
          setLoadingRepos(false);
        }
      };
      fetchRepos();
    }
  }, [status]);

  useEffect(() => {
    if (!slugManuallyEdited) {
      setSlug(generateSlug(name));
    }
  }, [name, slugManuallyEdited]);

  const getFieldError = useCallback(
    (field: string): string | null => {
      const err = fieldErrors.find((e) => e.field === field);
      return err ? err.message : null;
    },
    [fieldErrors]
  );

  const handleRepoSelect = (repo: GithubRepo) => {
    setRepositoryUrl(repo.cloneUrl);
    if (!name) {
      setName(repo.name);
      if (!slugManuallyEdited) setSlug(generateSlug(repo.name));
    }
  };

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleRemoveEnvVar = (index: number) => {
    const newEnvVars = [...envVars];
    newEnvVars.splice(index, 1);
    setEnvVars(newEnvVars);
  };

  const handleEnvVarChange = (index: number, field: 'key' | 'value', value: string) => {
    const newEnvVars = [...envVars];
    newEnvVars[index][field] = value;
    setEnvVars(newEnvVars);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) {
      setGlobalError('You must be signed in to create a project');
      return;
    }
    setSubmitting(true);
    setGlobalError(null);
    setFieldErrors([]);

    // Filter empty env vars
    const validEnvVars = envVars.filter(ev => ev.key.trim() !== '');

    try {
      const res = await fetchApi('/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': session.user.id
        },
        body: JSON.stringify({
          name,
          slug,
          repositoryUrl: repositoryUrl || undefined,
          branch,
          buildCommand,
          outputDir,
          rootDir,
          envVars: validEnvVars.length > 0 ? validEnvVars : undefined
        }),
      });

      const data = await res.json();

      if (res.ok && data.status === 'success') {
        router.push(`/projects/${data.project.id}`);
        return;
      }

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

  const inputClasses =
    'w-full rounded-lg border bg-input-bg border-input-border px-4 py-2.5 text-sm text-text-ink placeholder:text-text-mute/60 focus:border-input-focus focus:ring-1 focus:ring-input-focus outline-none transition duration-150';

  if (status === 'loading') {
    return <div className="p-8 text-center animate-pulse">Loading...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/projects"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-mute hover:text-text-ink transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to Projects
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-ink tracking-tight">Create a New Project</h1>
        <p className="text-sm text-text-mute mt-1">
          Select a repository from GitHub or configure it manually.
        </p>
      </div>

      {globalError && (
        <div className="mb-6 rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
          {globalError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Repository Picker */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-xl border border-border-hairline bg-card-bg p-5 flex flex-col h-[500px]">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h3 className="text-sm font-semibold text-text-ink flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"></path></svg>
                GitHub Repos
              </h3>
              <button
                type="button"
                onClick={() => signIn('github', { callbackUrl: '/projects/new' })}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-background border border-border-hairline rounded-md text-text-ink hover:bg-border-hairline/20 hover:border-border-hairline/80 transition-all shadow-sm"
                title="Grant Push2Prod permission to access your private repositories"
              >
                <Lock size={12} className="text-text-mute" />
                Sync Private Repos
              </button>
            </div>

            <div className="mb-4 shrink-0">
              <input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border bg-input-bg border-input-border px-3 py-2 text-xs text-text-ink placeholder:text-text-mute/60 focus:border-input-focus focus:ring-1 focus:ring-input-focus outline-none transition duration-150"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {loadingRepos ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-16 rounded bg-border-hairline/50 animate-pulse"></div>
                  ))}
                </div>
              ) : repoError ? (
                <div className="text-sm text-error p-3 bg-error/10 rounded-md border border-error/20">
                  {repoError}
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="text-sm text-text-mute text-center py-8">
                  {searchQuery ? 'No matching repositories found.' : 'No repositories found on your GitHub account.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRepos.map(repo => (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => handleRepoSelect(repo)}
                      className={`w-full text-left px-4 py-3 rounded-md border transition-all ${
                        repositoryUrl === repo.cloneUrl 
                          ? 'bg-accent/10 border-accent ring-1 ring-accent' 
                          : 'bg-background border-border-hairline hover:border-text-mute/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-text-ink truncate pr-2">{repo.name}</span>
                        {repo.private && (
                          <svg className="w-3.5 h-3.5 text-text-mute shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                          </svg>
                        )}
                      </div>
                      <p className="text-xs text-text-mute mt-1 truncate">{repo.fullName}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Settings Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* General Info */}
            <div className="rounded-xl border border-border-hairline bg-card-bg p-5 space-y-5">
              <h3 className="text-sm font-semibold text-text-ink border-b border-border-hairline pb-3">Project Details</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-text-ink">Project Name</label>
                  <input
                    id="name" type="text" required placeholder="My Portfolio Site"
                    value={name} onChange={(e) => setName(e.target.value)}
                    className={inputClasses}
                  />
                  {getFieldError('name') && <p className="mt-1.5 text-xs text-error">{getFieldError('name')}</p>}
                </div>
                
                <div>
                  <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-text-ink">Slug</label>
                  <input
                    id="slug" type="text" required placeholder="my-portfolio-site"
                    value={slug} onChange={(e) => { setSlug(e.target.value); setSlugManuallyEdited(true); }}
                    className={inputClasses}
                  />
                  {slug && <p className="mt-1.5 text-xs text-text-mute font-mono">{slug}.push2prod.app</p>}
                  {getFieldError('slug') && <p className="mt-1.5 text-xs text-error">{getFieldError('slug')}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="repositoryUrl" className="mb-1.5 block text-sm font-medium text-text-ink">
                  Repository URL
                  <span className="ml-1.5 text-xs font-normal text-text-mute">(Selected from GitHub or paste URL)</span>
                </label>
                <input
                  id="repositoryUrl" type="url" placeholder="https://github.com/username/repo.git"
                  value={repositoryUrl} onChange={(e) => setRepositoryUrl(e.target.value)}
                  className={inputClasses}
                />
                {getFieldError('repositoryUrl') && <p className="mt-1.5 text-xs text-error">{getFieldError('repositoryUrl')}</p>}
              </div>

              <div>
                <label htmlFor="branch" className="mb-1.5 block text-sm font-medium text-text-ink">Branch</label>
                <input
                  id="branch" type="text" placeholder="main"
                  value={branch} onChange={(e) => setBranch(e.target.value)}
                  className={inputClasses}
                />
              </div>
            </div>

            {/* Environment Variables */}
            <div className="rounded-xl border border-border-hairline bg-card-bg p-5">
              <div className="flex items-center justify-between border-b border-border-hairline pb-3 mb-4">
                <h3 className="text-sm font-semibold text-text-ink">Environment Variables</h3>
                <button 
                  type="button" 
                  onClick={handleAddEnvVar}
                  className="text-xs font-medium text-accent hover:text-accent-hover flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                  Add New
                </button>
              </div>
              
              <div className="space-y-3">
                {envVars.map((envVar, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex-1">
                      <input
                        type="text" placeholder="NAME"
                        value={envVar.key} onChange={(e) => handleEnvVarChange(idx, 'key', e.target.value.toUpperCase())}
                        className={`${inputClasses} font-mono text-xs`}
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text" placeholder="VALUE"
                        value={envVar.value} onChange={(e) => handleEnvVarChange(idx, 'value', e.target.value)}
                        className={`${inputClasses} font-mono text-xs`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveEnvVar(idx)}
                      className="mt-1 p-2 text-text-mute hover:text-error transition-colors rounded-md hover:bg-error/10"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                ))}
                {envVars.length === 0 && (
                  <p className="text-sm text-text-mute italic py-2">No environment variables added.</p>
                )}
              </div>
            </div>

            {/* Build Settings */}
            <div className="rounded-xl border border-border-hairline bg-card-bg p-5">
              <h3 className="text-sm font-semibold text-text-ink mb-4 border-b border-border-hairline pb-3">Build Settings</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="buildCommand" className="mb-1.5 block text-xs font-medium text-text-body">Build Command</label>
                  <input id="buildCommand" type="text" placeholder="npm run build" value={buildCommand} onChange={(e) => setBuildCommand(e.target.value)} className={inputClasses} />
                </div>
                <div>
                  <label htmlFor="outputDir" className="mb-1.5 block text-xs font-medium text-text-body">Output Directory</label>
                  <input id="outputDir" type="text" placeholder="dist" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} className={inputClasses} />
                </div>
                <div>
                  <label htmlFor="rootDir" className="mb-1.5 block text-xs font-medium text-text-body">Root Directory</label>
                  <input id="rootDir" type="text" placeholder="." value={rootDir} onChange={(e) => setRootDir(e.target.value)} className={inputClasses} />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-hairline">
              <Link href="/projects" className="rounded-lg border border-border-hairline px-4 py-2.5 text-sm font-medium text-text-body transition-colors hover:bg-card-bg hover:text-text-ink">
                Cancel
              </Link>
              <button
                type="submit" disabled={submitting || !name.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                )}
                {submitting ? 'Creatingâ€¦' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
