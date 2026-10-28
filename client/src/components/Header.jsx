import React from 'react';
import { Sun, Moon, HelpCircle, Share2, BarChart2, ShieldCheck, Database } from 'lucide-react';

export default function Header({ 
  theme, 
  onToggleTheme, 
  activeTab = 'codewhy',
  onSelectTab,
  graphStatus
}) {
  return (
    <header className="border-b border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] sticky top-0 z-50 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-4">
        {/* Left: CodeWhy Brand & Problem Statement Badge */}
        <div className="flex items-center gap-3 shrink-0">
          <button 
            type="button"
            onClick={() => onSelectTab && onSelectTab('codewhy')}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity focus:outline-none text-left"
            title="CodeWhy - Why The Code Is Like This"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-sm ring-1 ring-white/20">
              CW
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg tracking-tight text-neutral-900 dark:text-[#f0f6fc]">
                  CodeWhy
                </span>
                <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  Theme T1.1
                </span>
              </div>
              <p className="hidden md:block text-[11px] text-neutral-500 dark:text-[#8b949e] font-medium leading-tight">
                Historical Engineering Rationale Engine
              </p>
            </div>
          </button>
        </div>

        {/* Center: Primary Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => onSelectTab && onSelectTab('codewhy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'codewhy'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc] hover:bg-neutral-100 dark:hover:bg-[#21262d]'
            }`}
            title="Investigate Why Code Exists in Its Current Form"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Rationale Explorer</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab && onSelectTab('memory')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'memory'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc] hover:bg-neutral-100 dark:hover:bg-[#21262d]'
            }`}
            title="Inspect Interactive Knowledge Graph and Architecture Memory"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Decision Graph</span>
            <span className="sm:hidden">Graph</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab && onSelectTab('eval')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'eval'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc] hover:bg-neutral-100 dark:hover:bg-[#21262d]'
            }`}
            title="Review 20-Case Multi-Repository Benchmark and Accuracy Metrics"
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Benchmark & Audit</span>
            <span className="sm:hidden">Audit</span>
          </button>
        </nav>

        {/* Right Tools: Storage Diagnostics, Theme Toggle, GitHub */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Transparent Storage Badge */}
          <div 
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-[#30363d] bg-neutral-50 dark:bg-[#21262d] text-xs font-mono text-neutral-700 dark:text-[#c9d1d9]"
            title={graphStatus?.neo4jError || (graphStatus?.neo4jConnected ? 'Neo4j Aura cloud database active' : 'Operating with verified in-memory graph fallback')}
          >
            <span className={`w-2 h-2 rounded-full ${graphStatus?.neo4jConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <Database className="w-3 h-3 text-neutral-400" />
            <span className="text-[11px] font-medium">
              {graphStatus?.neo4jConnected ? 'Neo4j Aura' : 'In-Memory Store'}
            </span>
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-[#30363d] hover:bg-neutral-100 dark:hover:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc] transition-colors"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-blue-600" />
            )}
          </button>

          {/* GitHub Link */}
          <a
            href="https://github.com/shubhamranswal/devlens-ai"
            target="_blank"
            rel="noreferrer"
            className="p-1.5 rounded-lg border border-neutral-200 dark:border-[#30363d] hover:bg-neutral-100 dark:hover:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] hover:text-neutral-900 dark:hover:text-[#f0f6fc] transition-colors"
            title="GitHub Repository"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
