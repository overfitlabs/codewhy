import React from 'react';
import { Sun, Moon, HelpCircle, Share2, BarChart2, Database } from 'lucide-react';

export default function Header({ 
  theme, 
  onToggleTheme, 
  activeTab = 'codewhy',
  onSelectTab,
  graphStatus,
  selectedRepository,
  repoStatusData
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
            <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-white dark:bg-[#161b22] border border-neutral-200 dark:border-[#30363d] shadow-xs shrink-0">
              <img 
                src="/codewhy.png" 
                alt="CodeWhy" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentNode.innerText = 'CW';
                }}
              />
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

        {/* Right Tools: Active Repository Indicator, Storage Diagnostics, Theme Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Unified Active Repository Context Pill */}
          {selectedRepository && (
            <div 
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-[#30363d] bg-neutral-50 dark:bg-[#21262d] text-xs font-mono text-neutral-700 dark:text-[#c9d1d9]"
              title={`Shared Active Repository: ${selectedRepository} (${repoStatusData?.isIndexed ? 'Indexed & Ready' : 'Unindexed'})`}
            >
              <span className={`w-2 h-2 rounded-full ${repoStatusData?.isIndexed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="text-neutral-400 dark:text-[#8b949e] font-sans text-[11px]">Repo:</span>
              <span className="font-semibold text-neutral-800 dark:text-[#f0f6fc] max-w-[130px] truncate">
                {selectedRepository}
              </span>
            </div>
          )}

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


        </div>
      </div>
    </header>
  );
}
