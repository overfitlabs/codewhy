import React from 'react';
import { 
  GitBranch, 
  Star, 
  GitFork, 
  ExternalLink, 
  Clock, 
  FileCode, 
  FolderTree, 
  Compass, 
  MessageSquare, 
  LayoutDashboard,
  Database,
  HelpCircle
} from 'lucide-react';

export default function RepoHeader({ 
  analysisData, 
  memoryOverview,
  activeTab, 
  onSelectTab 
}) {
  const { repository, metrics, projectType, architecture } = analysisData;
  const counts = memoryOverview?.counts || analysisData?.projectMemory?.counts || {};
  const isMemoryConnected = Boolean(memoryOverview?.available && memoryOverview?.status === 'connected');
  const memoryItemCount = isMemoryConnected
    ? (counts.decisions || 0) + (counts.bugs || 0) + (counts.fixes || 0) + (counts.symbols || 0)
    : metrics.totalFiles;

  const tabs = [
    { id: 'codewhy', label: 'CodeWhy (Why The Code Is Like This)', icon: HelpCircle, count: 'T1.1' },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'memory', label: 'Project Memory & Graph', icon: Database, count: memoryItemCount },
    { id: 'architecture', label: 'Architecture', icon: Compass },
    { id: 'ask', label: 'Ask Codebase', icon: MessageSquare }
  ];

  return (
    <div className="border-b border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] pt-5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Repo Title & Meta */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] border border-neutral-200 dark:border-[#30363d]">
                {projectType}
              </span>
              <span className="text-neutral-400 dark:text-[#6e7681]">•</span>
              <span className="text-neutral-600 dark:text-[#8b949e]">
                {architecture.pattern}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-[#f0f6fc] flex items-center gap-2">
              <span>{repository.fullName}</span>
              <a
                href={repository.url}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-400 hover:text-neutral-600 dark:text-[#8b949e] dark:hover:text-[#f0f6fc] transition-colors p-1"
                title="View on GitHub"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </h1>

            <p className="text-xs sm:text-sm text-neutral-600 dark:text-[#8b949e] max-w-3xl leading-relaxed">
              {repository.description}
            </p>
          </div>

          {/* Quick Metrics & Badges */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap text-xs text-neutral-600 dark:text-[#8b949e]">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-50 dark:bg-[#21262d] border border-neutral-200 dark:border-[#30363d]">
              <GitBranch className="w-3.5 h-3.5 text-neutral-500 dark:text-[#8b949e]" />
              <span className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium">
                {repository.branch}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-50 dark:bg-[#21262d] border border-neutral-200 dark:border-[#30363d]">
              <Star className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium">
                {repository.stars.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-50 dark:bg-[#21262d] border border-neutral-200 dark:border-[#30363d]">
              <GitFork className="w-3.5 h-3.5 text-neutral-500 dark:text-[#8b949e]" />
              <span className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium">
                {repository.forks.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-50 dark:bg-[#21262d] border border-neutral-200 dark:border-[#30363d]">
              <Clock className="w-3.5 h-3.5 text-blue-500 dark:text-[#58a6ff]" />
              <span className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium">
                {metrics.analysisTimeMs}ms
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSelectTab('memory')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors ${
                memoryOverview?.status === 'connected'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-[#3fb950]'
                  : memoryOverview?.status === 'not_configured'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400'
                    : 'bg-neutral-50 dark:bg-[#21262d] border-neutral-200 dark:border-[#30363d] text-neutral-600 dark:text-[#8b949e]'
              }`}
              title="Open Neo4j Project Memory"
            >
              <Database className="w-3.5 h-3.5" />
              <span className="font-mono font-medium">
                {memoryOverview?.status === 'connected'
                  ? `Neo4j Connected · ${counts.symbols ?? 0} symbols`
                  : memoryOverview?.status === 'not_configured'
                    ? 'Neo4j Not Configured'
                    : memoryOverview?.status === 'unavailable'
                      ? 'Neo4j Unavailable'
                      : analysisData?.projectMemory?.ingested
                        ? `Neo4j Active · ${counts.symbols ?? 0} symbols`
                        : 'Project Memory'}
              </span>
            </button>
          </div>
        </div>

        {/* Workspace Navigation Tabs (GitHub / Linear Style) */}
        <nav className="flex items-center gap-1 -mb-px overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none ${
                  isActive
                    ? 'border-blue-600 dark:border-[#f78166] text-neutral-900 dark:text-[#f0f6fc] font-semibold'
                    : 'border-transparent text-neutral-500 dark:text-[#8b949e] hover:text-neutral-800 dark:hover:text-[#c9d1d9] hover:border-neutral-300 dark:hover:border-[#8b949e]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600 dark:text-[#f78166]' : 'text-neutral-400 dark:text-[#6e7681]'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="text-[11px] font-mono px-1.5 py-0.2 rounded-full bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d]">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
