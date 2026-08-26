// Client component for real-time database counts overview
"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";

// Table counts interface
interface DbCounts {
  users: number;
  projects: number;
  deployments: number;
  buildLogs: number;
  buildEvents: number;
}

// API success format
interface ApiResponse {
  status: string;
  counts: DbCounts;
  timestamp: string;
}

export default function DatabaseDebugPage() {
  const [counts, setCounts] = useState<DbCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Database se live counts lene ka function
  const fetchCounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchApi("/debug/db-counts");
      if (!res.ok) {
        throw new Error("API call failed. Is the API Gateway running on port 4000?");
      }
      const data: ApiResponse = await res.json();
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCounts();
  }, []);

  return (
    // Vercel dark/light modes support karega, same custom properties text-text-ink & bg-background se
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-text-ink transition-colors duration-200">
      
      {/* Vercel card aesthetic border-border-hairline ke saath */}
      <div className="bg-card-bg border border-border-hairline rounded-xl p-8 max-w-lg w-full shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200">
        
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8 border-b border-border-hairline pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Database Debugger</h1>
            <p className="text-xs text-text-mute mt-0.5 font-medium">Real-time PostgreSQL Table Counts</p>
          </div>
          <button 
            onClick={fetchCounts}
            className="px-3 py-1.5 bg-background border border-border-hairline hover:bg-card-bg rounded-md text-xs font-medium cursor-pointer transition-colors text-text-body"
          >
            Refresh
          </button>
        </div>

        {/* Dynamic content rendering based on api response */}
        {loading ? (
          <div className="text-text-mute text-sm animate-pulse py-8 text-center font-medium">
            Fetching database statistics...
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg text-sm mb-4">
            <p className="font-semibold">Failed to load database counts:</p>
            <p className="text-xs mt-1 text-red-400 font-mono">{error}</p>
          </div>
        ) : counts ? (
          <div className="grid grid-cols-2 gap-4">
            
            {/* Users Card */}
            <div className="bg-background p-4 rounded-lg border border-border-hairline">
              <span className="text-[10px] text-text-mute font-bold uppercase tracking-wider block mb-1">Users</span>
              <span className="text-3xl font-semibold font-mono text-text-ink">{counts.users}</span>
            </div>

            {/* Projects Card */}
            <div className="bg-background p-4 rounded-lg border border-border-hairline">
              <span className="text-[10px] text-text-mute font-bold uppercase tracking-wider block mb-1">Projects</span>
              <span className="text-3xl font-semibold font-mono text-text-ink">{counts.projects}</span>
            </div>

            {/* Deployments Card */}
            <div className="bg-background p-4 rounded-lg border border-border-hairline">
              <span className="text-[10px] text-text-mute font-bold uppercase tracking-wider block mb-1">Deployments</span>
              <span className="text-3xl font-semibold font-mono text-text-ink">{counts.deployments}</span>
            </div>

            {/* Logs/Events combined card */}
            <div className="bg-background p-4 rounded-lg border border-border-hairline">
              <span className="text-[10px] text-text-mute font-bold uppercase tracking-wider block mb-1">Build Logs / Events</span>
              <span className="text-2xl font-semibold font-mono text-text-ink">
                {counts.buildLogs} <span className="text-xs font-normal text-text-mute">/</span> {counts.buildEvents}
              </span>
            </div>

          </div>
        ) : null}

        {/* Footer info links */}
        <div className="mt-8 pt-4 border-t border-border-hairline flex justify-between items-center text-xs">
          <span className="text-text-mute font-mono text-[10px]">Host: localhost:5432</span>
          <a 
            href="/health"
            className="text-text-ink hover:underline font-medium flex items-center gap-1"
          >
            ← System Status
          </a>
        </div>

      </div>
    </div>
  );
}
