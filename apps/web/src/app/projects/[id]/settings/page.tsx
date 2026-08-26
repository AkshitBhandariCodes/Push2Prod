'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import { Layers, Settings as SettingsIcon, Trash2, Plus, Key, Lock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';

interface EnvVar {
  id: string;
  key: string;
  value: string;
  createdAt: string;
}

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchEnvVars = async () => {
    if (!session?.user?.id) return;
    try {
      setLoading(true);
      const res = await fetchApi(`/projects/${projectId}/env`, {
        headers: { 'x-user-id': session.user.id }
      });
      const data = await res.json();
      if (data.status === 'success') {
        setEnvVars(data.envVars);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchEnvVars();
    }
  }, [projectId, session]);

  const handleAddEnvVar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim() || !session?.user?.id) return;
    
    setAdding(true);
    try {
      await fetchApi(`/projects/${projectId}/env`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': session.user.id
        },
        body: JSON.stringify({ key: newKey.toUpperCase(), value: newValue }),
      });
      setNewKey('');
      setNewValue('');
      fetchEnvVars();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (key: string) => {
    if (!session?.user?.id) return;
    try {
      await fetchApi(`/projects/${projectId}/env/${key}`, {
        method: 'DELETE',
        headers: { 'x-user-id': session.user.id }
      });
      fetchEnvVars();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProject = async () => {
    if (!window.confirm('Are you absolutely sure you want to delete this project? This action cannot be undone.')) {
      return;
    }
    if (!session?.user?.id) return;

    setDeleting(true);
    try {
      const res = await fetchApi(`/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': session.user.id }
      });
      if (res.ok) {
        router.push('/projects');
      } else {
        const data = await res.json();
        alert(`Failed to delete project: ${data.message || 'Unknown error'}`);
        setDeleting(false);
      }
    } catch (e) {
      console.error(e);
      alert('Failed to delete project due to a network error.');
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-page-bg text-text-main pb-24">
      {/* Navbar (Same as project details) */}
      <nav className="sticky top-0 z-50 flex h-16 items-center border-b border-border-hairline bg-page-bg/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Layers className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Push2Prod</span>
          <span className="text-border-subtle mx-2">/</span>
          <span className="text-sm font-medium">Settings</span>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 pt-10">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border-hairline mb-8">
          <Link href={`/projects/${projectId}`} className="px-4 py-3 text-sm font-medium text-text-muted hover:text-text-main">
            Deployments
          </Link>
          <Link href={`/projects/${projectId}/settings`} className="px-4 py-3 text-sm font-medium border-b-2 border-text-main text-text-main">
            Settings
          </Link>
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-card-bg rounded-md">
              <SettingsIcon className="h-4 w-4" /> Environment Variables
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 space-y-6">
            <div className="rounded-xl border border-border-hairline bg-card-bg overflow-hidden">
              <div className="p-6 border-b border-border-hairline">
                <h2 className="text-xl font-semibold mb-2">Environment Variables</h2>
                <p className="text-sm text-text-muted">
                  In order to provide your Deployment with Environment Variables at Build and Runtime, you may enter them right here.
                </p>
              </div>
              
              <div className="p-6 bg-[#0a0a0a]">
                <form onSubmit={handleAddEnvVar} className="flex gap-4 items-start">
                  <div className="flex-1 space-y-2">
                    <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Key</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Key className="h-4 w-4 text-text-muted" />
                      </div>
                      <input 
                        type="text" 
                        placeholder="EXAMPLE_NAME" 
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        className="w-full bg-page-bg border border-border-subtle rounded-md pl-10 px-4 py-2 text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Value</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-text-muted" />
                      </div>
                      <input 
                        type="password" 
                        placeholder="e_QyR_12345" 
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        className="w-full bg-page-bg border border-border-subtle rounded-md pl-10 px-4 py-2 text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                  </div>
                  <div className="pt-6">
                    <button 
                      type="submit"
                      disabled={!newKey || !newValue}
                      className="h-9 px-4 bg-text-main text-page-bg font-medium text-sm rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                  </div>
                </form>
              </div>

              {loading ? (
                <div className="p-6 text-center text-sm text-text-muted animate-pulse">Loading variables...</div>
              ) : envVars.length === 0 ? (
                <div className="p-8 text-center text-sm text-text-muted border-t border-border-hairline">
                  No environment variables added yet.
                </div>
              ) : (
                <div className="border-t border-border-hairline">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#0a0a0a] text-text-muted text-xs uppercase border-b border-border-hairline">
                      <tr>
                        <th className="px-6 py-3 font-medium">Key</th>
                        <th className="px-6 py-3 font-medium">Value</th>
                        <th className="px-6 py-3 font-medium text-right">Added</th>
                        <th className="px-6 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-hairline">
                      {envVars.map(v => (
                        <tr key={v.id} className="hover:bg-[#0a0a0a] transition-colors">
                          <td className="px-6 py-4 font-mono text-text-main">{v.key}</td>
                          <td className="px-6 py-4 font-mono text-text-muted">â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢</td>
                          <td className="px-6 py-4 text-text-muted text-right">
                            {new Date(v.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => handleDelete(v.key)}
                              className="text-text-muted hover:text-red-400 p-1 rounded-md transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Danger Zone */}
            <div className="rounded-xl border border-red-900/30 bg-card-bg overflow-hidden mt-12">
              <div className="p-6 border-b border-red-900/30 bg-red-950/10 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h2 className="text-xl font-semibold text-red-500">Danger Zone</h2>
              </div>
              
              <div className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-text-main mb-1">Delete Project</h3>
                  <p className="text-sm text-text-muted max-w-lg">
                    Once you delete a project, there is no going back. Please be certain.
                    This will permanently delete all deployments, build logs, and environment variables associated with this project.
                  </p>
                </div>
                <button 
                  onClick={handleDeleteProject}
                  disabled={deleting}
                  className="flex-shrink-0 px-4 py-2 bg-red-600/10 border border-red-600/20 text-red-500 hover:bg-red-600 hover:text-white transition-colors text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting...' : 'Delete Project'}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
