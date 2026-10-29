import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import AnalysisProgress from './components/AnalysisProgress';
import ProjectMemoryTab from './components/Tabs/ProjectMemoryTab';
import CodeWhyExplorer from './components/CodeWhy/CodeWhyExplorer';
import BenchmarkTab from './components/CodeWhy/BenchmarkTab';
import { buildCompactAnalysisPayload } from './utils/analysisPayload';
import { normalizeRepoInput } from './utils/repository';
import { Database, ArrowRight, Search, CheckCircle2, Terminal, RefreshCw, AlertTriangle } from 'lucide-react';

const SESSION_ANALYSIS_KEY = 'codewhy_last_analysis';
const SESSION_TAB_KEY = 'codewhy_active_tab';
const SESSION_SUMMARY_PREFIX = 'codewhy_summary_';

export { normalizeRepoInput };

export default function App() {
  // Theme state: default 'dark', persisted in localStorage
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('codewhy_theme') || 'dark';
  });

  // Primary active tab: 'codewhy' (default) | 'memory' | 'eval' | 'overview' | 'architecture' | 'ask'
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem(SESSION_TAB_KEY);
    return (saved && saved !== 'overview') ? saved : 'codewhy';
  });

  // Storage status
  const [graphStatus, setGraphStatus] = useState(null);

  // Analysis state (optional deep AST analysis for graph explorer)
  const [analysisData, setAnalysisData] = useState(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_ANALYSIS_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Shared single source of truth for active repository across all tabs
  const [selectedRepository, setSelectedRepository] = useState(() => {
    return normalizeRepoInput(sessionStorage.getItem('codewhy_selected_repo') || 'expressjs/express');
  });

  // Real repository indexing and artifact status owned by application shell
  const [repoStatusData, setRepoStatusData] = useState({
    repository: selectedRepository,
    status: 'READY',
    statusLabel: 'Indexed & Provenance Ready',
    isIndexed: true,
    isDurable: true,
    storageMode: 'neo4j_active',
    storageLabel: 'Neo4j Persistent Graph',
    counts: null,
    categories: null,
    lastIndexedAt: null,
    error: null
  });
  const [isLoadingRepoStatus, setIsLoadingRepoStatus] = useState(false);
  const [repoStatusError, setRepoStatusError] = useState(null);

  // Persistent Neo4j Project Memory state
  const [memoryOverview, setMemoryOverview] = useState(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState(null);

  // Concurrency token to prevent out-of-order responses from overwriting newer selections
  const activeRepoRequestIdRef = useRef(0);

  // AI Summary state
  const [summary, setSummary] = useState(null);
  const [summaryMeta, setSummaryMeta] = useState(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const summaryInFlightRepoRef = useRef(null);

  // Ask Codebase state
  const [qaHistory, setQaHistory] = useState([]);
  const [isAsking, setIsAsking] = useState(false);
  const [qaError, setQaError] = useState(null);
  const [investigationTarget, setInvestigationTarget] = useState(null);

  const [graphRepoInput, setGraphRepoInput] = useState('');

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('codewhy_theme', theme);
  }, [theme]);

  // Persist selected repository
  useEffect(() => {
    if (selectedRepository) {
      sessionStorage.setItem('codewhy_selected_repo', selectedRepository);
    }
  }, [selectedRepository]);

  // Load graph status on mount
  useEffect(() => {
    fetch('/api/v1/evidence/status')
      .then(r => r.json())
      .then(d => setGraphStatus(d))
      .catch(() => {});
  }, [activeTab]);

  useEffect(() => {
    try {
      if (analysisData) {
        sessionStorage.setItem(SESSION_ANALYSIS_KEY, JSON.stringify(analysisData));
      } else {
        sessionStorage.removeItem(SESSION_ANALYSIS_KEY);
      }
    } catch {
      // Ignore quota error
    }
  }, [analysisData]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_TAB_KEY, activeTab);
    } catch {
      // Ignore quota error
    }
  }, [activeTab]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleSelectRepository = useCallback(async (repoInput, options = {}) => {
    const normalized = normalizeRepoInput(repoInput);
    if (!normalized || !normalized.includes('/')) return;

    // Increment request token for race-condition prevention
    const currentRequestId = ++activeRepoRequestIdRef.current;

    // 1. Update selection in state and session storage
    setSelectedRepository(normalized);
    try {
      sessionStorage.setItem('codewhy_selected_repo', normalized);
    } catch {
      // Ignore quota error
    }

    // 2. Immediately invalidate stale repository-specific data
    setMemoryOverview(null);
    setMemoryError(null);
    setIsLoadingMemory(true);
    setIsLoadingRepoStatus(true);
    setRepoStatusError(null);

    // Apply immediate status override if provided (e.g. from indexing completion)
    if (options.statusData) {
      setRepoStatusData(options.statusData);
    }

    try {
      const [statusRes, memoryRes] = await Promise.allSettled([
        fetch(`/api/v1/why-code/repository-status?repo=${encodeURIComponent(normalized)}`),
        fetch(`/api/memory/overview?repo=${encodeURIComponent(normalized)}`)
      ]);

      // If a newer repository selection was initiated, drop this stale response
      if (currentRequestId !== activeRepoRequestIdRef.current) {
        return;
      }

      if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
        const sData = await statusRes.value.json();
        if (currentRequestId === activeRepoRequestIdRef.current) {
          setRepoStatusData({
            repository: sData.repository || normalized,
            status: sData.status || (sData.indexed ? 'READY' : 'UNINDEXED'),
            statusLabel: sData.statusLabel || (sData.indexed ? 'Indexed & Provenance Ready' : 'Not Yet Indexed'),
            isIndexed: Boolean(sData.indexed),
            isDurable: Boolean(sData.isDurable),
            storageMode: sData.storageMode || (sData.indexed ? 'neo4j_active' : 'unindexed_repository'),
            storageLabel: sData.storageLabel || (sData.isDurable ? 'Neo4j Persistent Graph' : 'In-Memory Store'),
            counts: sData.counts || null,
            categories: sData.categories || null,
            lastIndexedAt: sData.lastIndexedAt || null,
            error: sData.error || null
          });
        }
      } else {
        if (currentRequestId === activeRepoRequestIdRef.current) {
          setRepoStatusError('Could not verify repository status.');
        }
      }

      if (memoryRes.status === 'fulfilled' && memoryRes.value.ok) {
        const mData = await memoryRes.value.json();
        if (currentRequestId === activeRepoRequestIdRef.current) {
          setMemoryOverview(mData);
          // Sync counts if not present in statusData
          if (mData.counts) {
            setRepoStatusData(prev => ({
              ...prev,
              counts: prev.counts || mData.counts,
              isIndexed: prev.isIndexed ?? mData.isIndexed
            }));
          }
        }
      } else {
        if (currentRequestId === activeRepoRequestIdRef.current) {
          const errMsg = memoryRes.status === 'fulfilled'
            ? (await memoryRes.value.json().catch(() => ({}))).error || 'Failed to load graph memory'
            : memoryRes.reason?.message || 'Network error loading graph';
          setMemoryError(errMsg);
        }
      }
    } catch (err) {
      if (currentRequestId === activeRepoRequestIdRef.current) {
        setRepoStatusError(err.message);
        setMemoryError(err.message);
      }
    } finally {
      if (currentRequestId === activeRepoRequestIdRef.current) {
        setIsLoadingRepoStatus(false);
        setIsLoadingMemory(false);
      }
    }
  }, []);

  // On mount, load initial repository status and graph for selectedRepository
  useEffect(() => {
    if (selectedRepository) {
      handleSelectRepository(selectedRepository);
    }
  }, []);

  const handleNavigateToGraph = useCallback((repo) => {
    if (repo && repo !== selectedRepository) {
      handleSelectRepository(repo);
    }
    setActiveTab('memory');
  }, [selectedRepository, handleSelectRepository]);

  const handleNavigateToRationale = useCallback((repo) => {
    if (repo && repo !== selectedRepository) {
      handleSelectRepository(repo);
    }
    setActiveTab('codewhy');
  }, [selectedRepository, handleSelectRepository]);

  const handleNavigateToBenchmark = useCallback((repo) => {
    if (repo && repo !== selectedRepository) {
      handleSelectRepository(repo);
    }
    setActiveTab('eval');
  }, [selectedRepository, handleSelectRepository]);

  const handleGraphRepoSubmit = (e) => {
    e.preventDefault();
    if (!graphRepoInput.trim()) return;
    handleSelectRepository(graphRepoInput.trim());
    setGraphRepoInput('');
  };

  const handleAnalyze = async (repoInput) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoInput })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to inspect repository.');
      }
      setAnalysisData(data);
      const repoName = data.repository?.fullName || repoInput;
      handleSelectRepository(repoName);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const hasGraphData = Boolean(
    memoryOverview &&
    (memoryOverview.isIndexed ||
      (memoryOverview.graph?.nodes?.length > 1) ||
      (memoryOverview.counts?.commits > 0 || memoryOverview.counts?.pullRequests > 0 || memoryOverview.counts?.issues > 0))
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#c9d1d9] flex flex-col font-sans transition-colors">
      {/* 1. CodeWhy Global Application Header */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        graphStatus={graphStatus}
        selectedRepository={selectedRepository}
        repoStatusData={repoStatusData}
      />

      {/* 2. Main Workspace Body */}
      <main className="flex-1 w-full">
        {/* TAB 1: PRIMARY RATIONALE EXPLORER */}
        {activeTab === 'codewhy' && (
          <div className="animate-in fade-in duration-200">
            <CodeWhyExplorer
              selectedRepository={selectedRepository}
              repoStatusData={repoStatusData}
              isLoadingRepoStatus={isLoadingRepoStatus}
              repoStatusError={repoStatusError}
              onSelectRepository={handleSelectRepository}
              onNavigateToGraph={handleNavigateToGraph}
              onNavigateToBenchmark={handleNavigateToBenchmark}
            />
          </div>
        )}

        {/* TAB 2: INTERACTIVE DECISION GRAPH & ARCHITECTURE MEMORY */}
        {activeTab === 'memory' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-in fade-in duration-200">
            <div className="p-5 rounded-2xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                      Decision Graph & Provenance Memory
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-[#8b949e]">
                      {repoStatusData?.storageLabel || memoryOverview?.storageLabel || (graphStatus?.neo4jConnected ? 'Neo4j Persistent Aura' : 'In-Memory Graph Fallback')}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      repoStatusData?.isIndexed
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                    }`}>
                      {repoStatusData?.isIndexed ? 'Indexed & Provenance Ready' : 'Not Yet Indexed'}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-[#f0f6fc]">
                    Interactive Architecture & Multi-Hop Decision Graph
                  </h2>
                  <p className="text-xs text-neutral-600 dark:text-[#8b949e]">
                    Inspect connected commits, pull requests, issues, ADRs, and files scoped to &ldquo;{selectedRepository}&rdquo;.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleNavigateToRationale(selectedRepository)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-2 self-start md:self-auto shrink-0 shadow-xs"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Investigate &ldquo;{selectedRepository}&rdquo; in Rationale</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Shared Repository Selector Bar */}
              <div className="pt-3 border-t border-neutral-100 dark:border-[#21262d] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-neutral-500 dark:text-[#8b949e]">
                    Active Repository:
                  </span>
                  {selectedRepository ? (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-xs flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{selectedRepository}</span>
                      <span className="text-[10px] bg-black/25 px-1.5 py-0.2 rounded font-normal">Active</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-100 dark:bg-[#21262d] text-neutral-500 dark:text-[#8b949e] border border-dashed border-neutral-300 dark:border-[#30363d]">
                      No repository selected
                    </span>
                  )}
                </div>

                {/* Input to load any repository graph */}
                <form onSubmit={handleGraphRepoSubmit} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={graphRepoInput}
                    onChange={(e) => setGraphRepoInput(e.target.value)}
                    placeholder="Switch repo (e.g. chalk/chalk)..."
                    className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-xs font-mono text-neutral-900 dark:text-[#f0f6fc] focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 sm:w-56"
                  />
                  <button
                    type="submit"
                    disabled={!graphRepoInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-[#21262d] hover:bg-neutral-200 dark:hover:bg-[#30363d] text-neutral-700 dark:text-[#c9d1d9] text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    Switch
                  </button>
                </form>
              </div>
            </div>

            {isLoadingMemory && (
              <div className="p-12 rounded-2xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-center space-y-3 animate-pulse">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
                <h3 className="text-base font-bold text-neutral-900 dark:text-[#f0f6fc]">
                  Loading Decision Graph for &ldquo;{selectedRepository}&rdquo;
                </h3>
                <p className="text-xs text-neutral-500 dark:text-[#8b949e]">
                  Querying multi-hop commits, PRs, issues, ADRs, and repository-scoped graph entities...
                </p>
              </div>
            )}

            {memoryError && !isLoadingMemory && (
              <div className="p-5 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 text-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                  <span>{memoryError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectRepository(selectedRepository)}
                  className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {hasGraphData && !isLoadingMemory ? (
              <ProjectMemoryTab
                repository={selectedRepository}
                analysisData={analysisData}
                memoryOverview={memoryOverview}
                isLoadingMemory={isLoadingMemory}
                memoryError={memoryError}
                onRefreshMemory={() => handleSelectRepository(selectedRepository)}
                onAskInCodebase={() => handleNavigateToRationale(selectedRepository)}
              />
            ) : !isLoadingMemory && !memoryError && (
              <div className="p-10 rounded-2xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                  <Database className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-lg mx-auto">
                  <h3 className="text-base font-bold text-neutral-900 dark:text-[#f0f6fc]">
                    Repository &ldquo;{selectedRepository}&rdquo; Not Yet Indexed in Decision Graph
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-[#8b949e] leading-relaxed">
                    Decision Graph visualizes multi-hop commits, pull request discussions, issues, ADRs, and file structures. Because this repository has not yet been indexed, no evidence graph is available to display.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleNavigateToRationale(selectedRepository)}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center gap-2 shadow-xs"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Index &ldquo;{selectedRepository}&rdquo; in Rationale Explorer</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BENCHMARK & AUDIT */}
        {activeTab === 'eval' && (
          <div className="animate-in fade-in duration-200">
            <BenchmarkTab
              selectedRepository={selectedRepository}
              repoStatusData={repoStatusData}
              isLoadingRepoStatus={isLoadingRepoStatus}
              repoStatusError={repoStatusError}
              onSelectRepository={handleSelectRepository}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          </div>
        )}
      </main>

      {/* CodeWhy Unified Footer */}
      <footer className="border-t border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] py-3.5 text-xs text-neutral-500 dark:text-[#8b949e] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-800 dark:text-[#c9d1d9]">CodeWhy</span>
            <span>·</span>
            <span>Historical Engineering Rationale Engine</span>
            <span>·</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">hackFront India Theme T1.1</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span>Graph Persistence: Neo4j Aura</span>
            <span>·</span>
            <span>Multilingual Voice: Sarvam AI</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
