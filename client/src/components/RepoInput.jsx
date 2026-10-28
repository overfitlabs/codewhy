import React, { useState } from 'react';
import { Search, Loader2, AlertCircle, CornerDownLeft } from 'lucide-react';

const PRESET_REPOSITORIES = [
  { label: 'shubhamranswal/devlens', tag: 'Go CLI' },
  { label: 'expressjs/express', tag: 'Node.js API' },
  { label: 'fastapi/fastapi', tag: 'Python Framework' },
  { label: 'vitejs/vite', tag: 'Frontend Tooling' }
];

export default function RepoInput({ onAnalyze, isLoading, error }) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim() && !isLoading) {
      onAnalyze(url.trim());
    }
  };

  const handleSelectPreset = (repoName) => {
    const fullUrl = `https://github.com/${repoName}`;
    setUrl(fullUrl);
    onAnalyze(fullUrl);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 sm:py-12 px-4 space-y-6">
      {/* Brand & Introduction */}
      <div className="text-center space-y-2">
        <div className="flex justify-center pb-1">
          <img 
            src="/icon_no_bg.png" 
            alt="DevLens AI" 
            className="w-28 sm:w-32 h-auto object-contain"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/icon_no_bg.png';
            }}
          />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-[#f0f6fc]">
          Understand unfamiliar codebases in minutes.
        </h1>

        <p className="text-xs sm:text-sm text-neutral-600 dark:text-[#8b949e] max-w-lg mx-auto leading-relaxed">
          Analyze a GitHub repository and get a structured map of its architecture, technologies, project structure, and execution flow with grounded AI assistance.
        </p>
      </div>

      {/* Input Box */}
      <div className="rounded-lg border border-neutral-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-1.5 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="pl-2 text-neutral-400 dark:text-[#6e7681]">
            <Search className="w-4 h-4" />
          </div>

          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste GitHub URL (e.g. https://github.com/shubhamranswal/devlens)"
            disabled={isLoading}
            className="flex-1 bg-transparent px-2 py-1.5 text-xs sm:text-sm text-neutral-900 dark:text-[#f0f6fc] placeholder-neutral-400 dark:placeholder-[#6e7681] focus:outline-none disabled:opacity-50 font-mono"
          />

          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-neutral-900 dark:bg-[#238636] hover:bg-neutral-800 dark:hover:bg-[#2ea043] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Scanning...</span>
              </>
            ) : (
              <>
                <span>Analyze</span>
                <CornerDownLeft className="w-3 h-3 text-neutral-400 dark:text-neutral-200" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Analysis Failed: </span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Quick Reference Presets */}
      <div className="space-y-1.5 text-center sm:text-left pt-1">
        <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 dark:text-[#6e7681] block">
          Reference Repositories:
        </span>
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
          {PRESET_REPOSITORIES.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handleSelectPreset(preset.label)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] hover:bg-neutral-50 dark:hover:bg-[#21262d] text-xs transition-colors disabled:opacity-50"
            >
              <span className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium text-[11px]">
                {preset.label}
              </span>
              <span className="text-[10px] text-neutral-500 dark:text-[#8b949e] px-1 py-0.2 rounded bg-neutral-100 dark:bg-[#21262d] border border-neutral-200 dark:border-[#30363d]">
                {preset.tag}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
