// Ye ek Client Component hai kyunki live data fetch karna hai aur client-side theme toggle handle karna hai
"use client";

import { useEffect, useState } from "react";

// Typescript interface for the health API response
interface HealthStatus {
  service: string;
  status: "healthy" | "unhealthy";
  dependencies: {
    postgres: string;
    redis: string;
  };
  timestamp: string;
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Theme state: default 'dark' (jaise user ne manga tha)
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Mount hone par backend state aur active HTML class check karenge
  useEffect(() => {
    // 1. Fetch Backend Health
    async function fetchHealth() {
      try {
        const res = await fetch("http://localhost:4001/health");
        const data = await res.json();
        setHealth(data);
      } catch (error) {
        console.error("Health fetch error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchHealth();

    // 2. Active theme check karna (server aur client render same rkhne ke liye state initial 'dark' hi hai)
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  // Theme change karne ka toggler
  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    
    // HTML tag par class append/remove kar rahe hain
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  return (
    // bg-background aur text-text-ink hamaari css variables se tailwind utility variables bani hain
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 font-sans text-text-ink transition-colors duration-200">
      
      {/* Vercel card UI: bg-card-bg aur border-border-hairline automatic light/dark switch honge */}
      <div className="bg-card-bg border border-border-hairline rounded-xl p-8 max-w-md w-full shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-200">
        
        {/* Header Section */}
        <div className="flex items-center justify-between mb-6 border-b border-border-hairline pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">System Status</h1>
            <p className="text-xs text-text-mute mt-0.5">Vercel-Pro Foundation</p>
          </div>
          
          {/* Status Indicator Dot */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-body font-medium uppercase tracking-wider text-[12px]">
              {loading ? "CHECKING" : health?.status?.toUpperCase() || "ERROR"}
            </span>
            <div 
              className={`h-2.5 w-2.5 rounded-full ${
                loading ? "bg-amber-500 animate-pulse" : 
                health?.status === "healthy" ? "bg-emerald-500" : "bg-red-500"
              }`} 
            />
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="text-text-mute text-sm animate-pulse py-4">
            Fetching status from Project Service...
          </div>
        ) : (
          /* Dependencies Status Grid */
          <div className="space-y-4">
            
            {/* API Service Status */}
            <div className="flex justify-between items-center p-3 bg-background rounded-lg border border-border-hairline">
              <span className="text-sm font-medium text-text-body">Project API</span>
              <span className={`text-sm font-semibold ${health ? "text-emerald-500" : "text-red-500"}`}>
                {health ? "Online" : "Offline"}
              </span>
            </div>

            {/* Postgres Status */}
            <div className="flex justify-between items-center p-3 bg-background rounded-lg border border-border-hairline">
              <span className="text-sm font-medium text-text-body">PostgreSQL</span>
              <span className={`text-sm font-semibold ${health?.dependencies.postgres === "connected" ? "text-emerald-500" : "text-red-500"}`}>
                {health?.dependencies.postgres === "connected" ? "Connected" : "Disconnected"}
              </span>
            </div>

            {/* Redis Status */}
            <div className="flex justify-between items-center p-3 bg-background rounded-lg border border-border-hairline">
              <span className="text-sm font-medium text-text-body">Redis Cache</span>
              <span className={`text-sm font-semibold ${health?.dependencies.redis === "connected" ? "text-emerald-500" : "text-red-500"}`}>
                {health?.dependencies.redis === "connected" ? "Connected" : "Disconnected"}
              </span>
            </div>
            
          </div>
        )}

        {/* Footer controls: Theme toggle button */}
        <div className="mt-8 pt-4 border-t border-border-hairline flex justify-end">
          <button 
            onClick={toggleTheme}
            className="px-3 py-1.5 bg-background border border-border-hairline rounded-md text-xs font-medium text-text-body hover:bg-card-bg cursor-pointer transition-colors"
          >
            Switch to {theme === "dark" ? "Light" : "Dark"} Mode
          </button>
        </div>

      </div>
    </div>
  );
}
