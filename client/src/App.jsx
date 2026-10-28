import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import AnalysisProgress from './components/AnalysisProgress';
import ProjectMemoryTab from './components/Tabs/ProjectMemoryTab';
import CodeWhyExplorer from './components/CodeWhy/CodeWhyExplorer';
import BenchmarkTab from './components/CodeWhy/BenchmarkTab';
import { buildCompactAnalysisPayload } from './utils/analysisPayload';
import { Database, ArrowRight } from 'lucide-react';

const SESSION_ANALYSIS_KEY = 'codewhy_last_analysis';
const SESSION_TAB_KEY = 'codewhy_active_tab';
const SESSION_SUMMARY_PREFIX = 'codewhy_summary_';

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

  // Persistent Neo4j Project Memory state
  const [memoryOverview, setMemoryOverview] = useState(null);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [memoryError, setMemoryError] = useState(null);

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

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('codewhy_theme', theme);
  }, [theme]);

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

  const fetchMemoryOverview = useCallback(async (repoFullName) => {
    const targetRepo = repoFullName || analysisData?.repository?.fullName;
    if (!targetRepo) return;

    setIsLoadingMemory(true);
    setMemoryError(null);

    try {
      const res = await fetch(`/api/memory/overview?repo=${encodeURIComponent(targetRepo)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load Neo4j project memory overview.');
      }
      setMemoryOverview(data);
    } catch (err) {
      setMemoryError(err.message);
    } finally {
      setIsLoadingMemory(false);
    }
  }, [analysisData?.repository?.fullName]);

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
      fetchMemoryOverview(data.repository?.fullName);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#c9d1d9] flex flex-col font-sans transition-colors">
      {/* 1. CodeWhy Global Application Header */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        graphStatus={graphStatus}
      />

      {/* 2. Main Workspace Body */}
      <main className="flex-1 w-full">
        {/* TAB 1: PRIMARY RATIONALE EXPLORER */}
        {activeTab === 'codewhy' && (
          <div className="animate-in fade-in duration-200">
            <CodeWhyExplorer />
          </div>
        )}

        {/* TAB 2: INTERACTIVE DECISION GRAPH & ARCHITECTURE MEMORY */}
        {activeTab === 'memory' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 animate-in fade-in duration-200">
            <div className="p-6 rounded-2xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                    Neo4j Decision Graph & Memory
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-[#8b949e]">
                    Persistent Graph Database Subsystem
                  </span>
                </div>
                <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-[#f0f6fc]">
                  Interactive Architecture & Entity Provenance Graph
                </h2>
                <p className="text-xs sm:text-sm text-neutral-600 dark:text-[#8b949e]">
                  Inspect connected repository files, AST functions, commits, issues, and ADR nodes stored in the decision graph.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAnalyze('expressjs/express')}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Load Express.js Graph
                </button>
                <button
                  type="button"
                  onClick={() => handleAnalyze('backstage/backstage')}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-100 dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-200 dark:hover:bg-[#30363d] transition-colors"
                >
                  Load Backstage Graph
                </button>
              </div>
            </div>

            {isLoading && <AnalysisProgress />}

            {analysisData && !isLoading ? (
              <ProjectMemoryTab
                analysisData={analysisData}
                memoryOverview={memoryOverview}
                isLoadingMemory={isLoadingMemory}
                memoryError={memoryError}
                onRefreshMemory={() => fetchMemoryOverview(analysisData.repository?.fullName)}
                onAskInCodebase={() => setActiveTab('codewhy')}
              />
            ) : !isLoading && (
              <div className="p-10 rounded-2xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-center space-y-4">
                <Database className="w-10 h-10 text-indigo-500 mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-neutral-900 dark:text-[#f0f6fc]">
                    Explore Neo4j Knowledge Graph Slices
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-[#8b949e] max-w-md mx-auto">
                    Select an indexed repository to inspect multi-hop connected historical evidence, commit relationships, and technical decisions.
                  </p>
                </div>
                <div className="flex justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleAnalyze('expressjs/express')}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center gap-2"
                  >
                    <span>Inspect expressjs/express</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAnalyze('backstage/backstage')}
                    className="px-4 py-2 rounded-lg bg-neutral-100 dark:bg-[#21262d] hover:bg-neutral-200 dark:hover:bg-[#30363d] text-neutral-800 dark:text-[#c9d1d9] text-xs font-semibold transition-colors flex items-center gap-2"
                  >
                    <span>Inspect backstage/backstage</span>
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
            <BenchmarkTab />
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
