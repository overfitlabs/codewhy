import React, { useState, useEffect } from 'react';
import { 
  HelpCircle, 
  Search, 
  ExternalLink, 
  Calendar, 
  User, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  GitCommit, 
  MessageSquare, 
  ShieldCheck, 
  FileCode,
  RefreshCw,
  Info,
  Scale,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Database,
  Terminal,
  ArrowRight,
  GitPullRequest,
  BookOpen,
  Layers,
  GitFork,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

function getSourceOriginLabel(mode) {
  if (mode === 'live_github') return 'Live GitHub sources';
  if (mode === 'verified_fixture') return 'Verified demonstration evidence';
  if (mode === 'unindexed_repository') return 'Repository not indexed';
  return 'Source status unavailable';
}

function getSourceOriginBadgeClass(mode) {
  if (mode === 'live_github') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300';
  if (mode === 'verified_fixture') return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300';
  if (mode === 'unindexed_repository') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300';
  return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300';
}

export default function CodeWhyExplorer({ 
  selectedRepository, 
  repoStatusData,
  isLoadingRepoStatus,
  repoStatusError,
  onSelectRepository, 
  onNavigateToGraph,
  onNavigateToBenchmark 
}) {
  const [question, setQuestion] = useState('Why does lib/express.js export express.json directly while express.bodyParser throws an error?');
  const [repository, setRepository] = useState(selectedRepository || 'expressjs/express');
  const [filePath, setFilePath] = useState('lib/express.js');
  const [symbol, setSymbol] = useState('exports.json');
  
  // Custom repository input state
  const [customRepoInput, setCustomRepoInput] = useState(selectedRepository && selectedRepository !== 'expressjs/express' && selectedRepository !== 'backstage/backstage' ? selectedRepository : '');
  const [isCustomMode, setIsCustomMode] = useState(Boolean(selectedRepository && selectedRepository !== 'expressjs/express' && selectedRepository !== 'backstage/backstage'));
  const [customRepoStatus, setCustomRepoStatus] = useState(null);
  const [isValidatingRepo, setIsValidatingRepo] = useState(false);

  // Live indexing workflow state
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingProgress, setIndexingProgress] = useState(0);
  const [indexingStage, setIndexingStage] = useState('');
  const [indexingCategories, setIndexingCategories] = useState(null);
  const [indexingCounts, setIndexingCounts] = useState(null);
  const [indexingError, setIndexingError] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [answerData, setAnswerData] = useState(null);
  const [error, setError] = useState(null);
  const [graphStatus, setGraphStatus] = useState(null);
  const [selectedRepoTab, setSelectedRepoTab] = useState(
    selectedRepository === 'backstage/backstage' ? 'backstage/backstage' : selectedRepository === 'expressjs/express' ? 'expressjs/express' : 'custom'
  );
  const [activePreset, setActivePreset] = useState(
    selectedRepository === 'backstage/backstage' ? 'backstage-adr-fetch-supersession' : selectedRepository === 'expressjs/express' ? 'express-body-parser-compromise' : null
  );
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [expandedCitations, setExpandedCitations] = useState(new Set());

  // Keep customRepoStatus in sync with shared repoStatusData from application shell
  useEffect(() => {
    if (repoStatusData) {
      setCustomRepoStatus({
        repository: repoStatusData.repository || selectedRepository,
        indexed: Boolean(repoStatusData.isIndexed),
        status: repoStatusData.status,
        statusLabel: repoStatusData.statusLabel,
        counts: repoStatusData.counts,
        categories: repoStatusData.categories,
        isDurable: repoStatusData.isDurable,
        storageMode: repoStatusData.storageMode,
        storageLabel: repoStatusData.storageLabel
      });
    }
  }, [repoStatusData, selectedRepository]);

  // Sync internal repository state when selectedRepository prop updates from parent
  useEffect(() => {
    if (selectedRepository && selectedRepository !== repository) {
      setRepository(selectedRepository);
      // Clean reset of previous answer & error on repo change to prevent stale data
      setAnswerData(null);
      setError(null);
      setVoiceNotice(null);

      if (selectedRepository === 'expressjs/express') {
        setSelectedRepoTab('expressjs/express');
        setIsCustomMode(false);
        setActivePreset('express-body-parser-compromise');
        setQuestion('Why does lib/express.js export express.json directly while express.bodyParser throws an error?');
        setFilePath('lib/express.js');
        setSymbol('exports.json');
      } else if (selectedRepository === 'backstage/backstage') {
        setSelectedRepoTab('backstage/backstage');
        setIsCustomMode(false);
        setActivePreset('backstage-adr-fetch-supersession');
        setQuestion('Why was the node-fetch decision superseded by the native fetch decision in Backstage?');
        setFilePath('docs/architecture-decisions/adr014-use-fetch.md');
        setSymbol('ADR014');
      } else {
        setSelectedRepoTab('custom');
        setIsCustomMode(true);
        setActivePreset(null);
        setCustomRepoInput(selectedRepository);
        setQuestion(`Why was this architectural implementation chosen in ${selectedRepository}?`);
        setFilePath('');
        setSymbol('');
      }
    }
  }, [selectedRepository]);

  const toggleExpandCitation = (citId) => {
    setExpandedCitations(prev => {
      const next = new Set(prev);
      if (next.has(citId)) next.delete(citId);
      else next.add(citId);
      return next;
    });
  };


  // Poll storage status on mount
  useEffect(() => {
    fetch('/api/v1/evidence/status')
      .then(res => res.json())
      .then(data => setGraphStatus(data))
      .catch(() => {});
  }, []);

  const handleToggleVoiceRecord = async () => {
    if (isRecording) {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      setIsRecording(false);
      return;
    }

    setVoiceNotice(null);

    // Check for browser MediaRecorder API
    if (!navigator?.mediaDevices?.getUserMedia) {
      // Fallback to browser SpeechRecognition if available
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const rec = new SpeechRec();
          rec.lang = 'en-IN';
          rec.onresult = (evt) => {
            const transcript = evt.results[0][0].transcript;
            setQuestion(transcript);
            setVoiceNotice({
              type: 'info',
              message: `Dictated via Browser Speech Recognition: "${transcript}"`
            });
            handleInvestigate(transcript);
          };
          rec.onerror = (e) => {
            setVoiceNotice({ type: 'warning', message: `Browser voice error: ${e.error}` });
          };
          rec.start();
          return;
        } catch {
          // ignore
        }
      }
      setVoiceNotice({
        type: 'warning',
        message: 'Microphone recording is not supported in this browser. Please type your query.'
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (chunks.length === 0) return;

        const blob = new Blob(chunks, { type: 'audio/webm' });
        setIsTranscribing(true);

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result.split(',')[1];
          try {
            const res = await fetch('/api/v1/voice/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Audio,
                mimeType: blob.type || 'audio/webm',
                languageCode: 'en-IN'
              })
            });

            const data = await res.json();
            setIsTranscribing(false);

            if (res.ok && data.transcript) {
              setQuestion(data.transcript);
              setVoiceNotice({
                type: 'success',
                message: `Transcribed via Sarvam Saaras v4: "${data.transcript}"`
              });
              handleInvestigate(data.transcript);
            } else if (data.status === 'UNCONFIGURED') {
              // Graceful notice: unconfigured key
              setVoiceNotice({
                type: 'info',
                message: 'Sarvam Voice: SARVAM_API_KEY is not configured in .env. Dictation fallback active; please type your question.'
              });
            } else {
              setVoiceNotice({
                type: 'warning',
                message: data.error || 'Voice transcription unconfigured. Please type your query.'
              });
            }
          } catch (err) {
            setIsTranscribing(false);
            setVoiceNotice({
              type: 'warning',
              message: `Voice service error: ${err.message}`
            });
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      setIsRecording(false);
      const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      setVoiceNotice({
        type: 'warning',
        message: isPermissionDenied
          ? 'Microphone permission was denied by browser. Please type your query in the search box.'
          : `Microphone access error: ${err.message}`
      });
    }
  };

  const handleReadAloud = async (textToSpeak) => {
    if (isPlayingAudio) {
      if (window.currentAudioElement) {
        window.currentAudioElement.pause();
        window.currentAudioElement = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
      return;
    }

    if (!textToSpeak) return;

    try {
      setIsPlayingAudio(true);
      const res = await fetch('/api/v1/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          languageCode: 'en-IN',
          speaker: 'shubh'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          window.currentAudioElement = audio;
          audio.onended = () => setIsPlayingAudio(false);
          audio.onerror = () => setIsPlayingAudio(false);
          await audio.play();
          return;
        }
      }

      // Fallback to browser SpeechSynthesis if Sarvam API is unconfigured
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
        setVoiceNotice({
          type: 'info',
          message: 'Audio Narration: Playing via browser speech synthesis (SARVAM_API_KEY omitted in .env).'
        });
      } else {
        setIsPlayingAudio(false);
        setVoiceNotice({
          type: 'warning',
          message: 'Audio playback is unavailable in this environment.'
        });
      }
    } catch (err) {
      setIsPlayingAudio(false);
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.onend = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const handleInvestigate = async (overrideQuestion, overrideRepo, overrideFile, overrideSymbol) => {
    const q = overrideQuestion || question;
    const r = overrideRepo || repository;
    const f = overrideFile !== undefined ? overrideFile : filePath;
    const s = overrideSymbol !== undefined ? overrideSymbol : symbol;

    if (!q.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/why-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.trim(),
          repository: r,
          filePath: f,
          symbol: s,
          useLiveAi: false
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze code rationale.');
      }

      setAnswerData(data);
      // Refresh storage status
      fetch('/api/v1/evidence/status')
        .then(r => r.json())
        .then(d => setGraphStatus(d))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectPreset = (presetKey) => {
    setActivePreset(presetKey);
    // Clean reset of previous answer & error
    setAnswerData(null);
    setError(null);
    setVoiceNotice(null);

    if (presetKey === 'express-body-parser-compromise') {
      const q = 'Why does lib/express.js export express.json directly while express.bodyParser throws an error?';
      setQuestion(q);
      setRepository('expressjs/express');
      if (onSelectRepository) onSelectRepository('expressjs/express');
      setFilePath('lib/express.js');
      setSymbol('exports.json');
      setSelectedRepoTab('expressjs/express');
      setIsCustomMode(false);
      handleInvestigate(q, 'expressjs/express', 'lib/express.js', 'exports.json');
    } else if (presetKey === 'express-multipart-partial-evidence') {
      const q = 'Why did Express omit a multipart parser when re-adding express.json in 4.16.0?';
      setQuestion(q);
      setRepository('expressjs/express');
      if (onSelectRepository) onSelectRepository('expressjs/express');
      setFilePath('lib/express.js');
      setSymbol('removedMiddlewares.multipart');
      setSelectedRepoTab('expressjs/express');
      setIsCustomMode(false);
      handleInvestigate(q, 'expressjs/express', 'lib/express.js', 'removedMiddlewares.multipart');
    } else if (presetKey === 'express-mocha-jest-counterfactual') {
      const q = 'Why did Express switch from Mocha to Jest for its unit tests in Express 4.16.0?';
      setQuestion(q);
      setRepository('expressjs/express');
      if (onSelectRepository) onSelectRepository('expressjs/express');
      setFilePath('package.json');
      setSymbol('scripts.test');
      setSelectedRepoTab('expressjs/express');
      setIsCustomMode(false);
      handleInvestigate(q, 'expressjs/express', 'package.json', 'scripts.test');
    } else if (presetKey === 'backstage-adr-fetch-supersession') {
      const q = 'Why was the node-fetch decision superseded by the native fetch decision in Backstage?';
      setQuestion(q);
      setRepository('backstage/backstage');
      if (onSelectRepository) onSelectRepository('backstage/backstage');
      setFilePath('docs/architecture-decisions/adr014-use-fetch.md');
      setSymbol('ADR014');
      setSelectedRepoTab('backstage/backstage');
      setIsCustomMode(false);
      handleInvestigate(q, 'backstage/backstage', 'docs/architecture-decisions/adr014-use-fetch.md', 'ADR014');
    } else if (presetKey === 'backstage-unrecorded-benchmarks') {
      const q = 'What throughput or memory consumption benchmarks motivated Backstage to replace node-fetch with native fetch in ADR014?';
      setQuestion(q);
      setRepository('backstage/backstage');
      if (onSelectRepository) onSelectRepository('backstage/backstage');
      setFilePath('docs/architecture-decisions/adr014-use-fetch.md');
      setSymbol('ADR014');
      setSelectedRepoTab('backstage/backstage');
      setIsCustomMode(false);
      handleInvestigate(q, 'backstage/backstage', 'docs/architecture-decisions/adr014-use-fetch.md', 'ADR014');
    }
  };

  const handleSwitchRepoTab = (repoId) => {
    setSelectedRepoTab(repoId);
    setIsCustomMode(false);
    // Explicitly reset answer and citations to prevent any stale state
    setAnswerData(null);
    setError(null);
    setVoiceNotice(null);
    if (onSelectRepository) onSelectRepository(repoId);

    if (repoId === 'expressjs/express') {
      handleSelectPreset('express-body-parser-compromise');
    } else if (repoId === 'backstage/backstage') {
      handleSelectPreset('backstage-adr-fetch-supersession');
    }
  };

  const handleApplyCustomRepo = async (e) => {
    if (e) e.preventDefault();
    if (!customRepoInput.trim()) return;

    // Normalize URL
    let normalized = customRepoInput.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').trim();
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(normalized)) {
      setError('Invalid repository format. Please enter "owner/repository" (e.g. facebook/react) or full GitHub URL.');
      return;
    }

    setIsValidatingRepo(true);
    setError(null);
    setAnswerData(null);
    setVoiceNotice(null);

    try {
      const res = await fetch(`/api/v1/why-code/repository-status?repo=${encodeURIComponent(normalized)}`);
      const statusData = await res.json();
      setCustomRepoStatus(statusData);

      setRepository(normalized);
      if (onSelectRepository) onSelectRepository(normalized);
      setSelectedRepoTab('custom');
      setIsCustomMode(true);
      setActivePreset(null);

      if (normalized.toLowerCase().includes('express')) {
        handleSelectPreset('express-body-parser-compromise');
      } else if (normalized.toLowerCase().includes('backstage')) {
        handleSelectPreset('backstage-adr-fetch-supersession');
      } else {
        // Unindexed repository: set a clean empty question and investigate
        setQuestion(`Why was this architectural implementation chosen in ${normalized}?`);
        setFilePath('');
        setSymbol('');
        handleInvestigate(`Why was this architectural implementation chosen in ${normalized}?`, normalized, '', '');
      }
    } catch (err) {
      setError(`Failed to check repository status: ${err.message}`);
    } finally {
      setIsValidatingRepo(false);
    }
  };

  const handleIndexRepo = async (targetRepo, isReindex = false) => {
    const repoToIdx = targetRepo || repository;
    if (!repoToIdx) return;

    setIsIndexing(true);
    setIndexingProgress(15);
    setIndexingStage('Connecting to GitHub API and validating repository...');
    setIndexingError(null);
    setError(null);
    setIndexingCategories({
      commits: { status: 'in_progress', count: 0 },
      pullRequests: { status: 'pending', count: 0 },
      issues: { status: 'pending', count: 0 },
      adrs: { status: 'pending', count: 0 },
      manifests: { status: 'pending', count: 0 }
    });

    const progressTimer = setInterval(() => {
      setIndexingProgress(prev => {
        if (prev < 35) {
          setIndexingStage('Fetching recent commits and diffs...');
          return prev + 10;
        } else if (prev < 65) {
          setIndexingStage('Ingesting pull request discussions and issues...');
          return prev + 12;
        } else if (prev < 85) {
          setIndexingStage('Scanning architecture decision records (ADRs) and manifests...');
          return prev + 8;
        }
        return prev;
      });
    }, 600);

    try {
      const res = await fetch('/api/v1/why-code/index-repository', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repository: repoToIdx,
          forceReindex: isReindex,
          commitLimit: 25,
          prLimit: 15,
          issueLimit: 15
        })
      });

      clearInterval(progressTimer);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Indexing failed.');
      }

      setIndexingProgress(100);
      setIndexingStage('Indexing complete! Evidence graph persisted.');
      setIndexingCounts(data.counts);
      setIndexingCategories(data.categories);

      const statusObj = {
        repository: data.repository,
        indexed: true,
        status: data.status || 'READY',
        statusLabel: 'Indexed & Provenance Ready',
        isIndexed: true,
        isDurable: Boolean(data.isDurable),
        storageMode: data.storageMode || 'neo4j_active',
        storageLabel: data.storageLabel || 'Neo4j Persistent Graph',
        counts: data.counts,
        categories: data.categories,
        lastIndexedAt: new Date().toISOString()
      };
      setCustomRepoStatus(statusObj);
      if (onSelectRepository) {
        onSelectRepository(data.repository, { statusData: statusObj });
      }

      // Refresh global graph status
      fetch('/api/v1/evidence/status')
        .then(r => r.json())
        .then(d => setGraphStatus(d))
        .catch(() => {});

      // Automatically investigate query with indexed repository evidence
      if (question && question.trim()) {
        handleInvestigate(question.trim(), data.repository, '', '');
      }
    } catch (err) {
      clearInterval(progressTimer);
      setIndexingError(err.message);
      setIndexingProgress(0);
      setIndexingStage(`Indexing failed: ${err.message}`);
    } finally {
      setIsIndexing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Hero Banner: CodeWhy Core Promise */}
      <div className="p-6 rounded-2xl border border-neutral-200 dark:border-[#30363d] bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-purple-50/70 dark:from-[#161b22] dark:via-[#161b22] dark:to-[#1c2128] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white shadow-xs">
                CodeWhy
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Theme T1.1: “Why The Code Is Like This”
              </span>
              <span className="text-xs text-neutral-500 dark:text-[#8b949e]">
                hackFront India 2026
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-[#f0f6fc]">
              Discover why code and architectural decisions exist by connecting implementation to historical evidence.
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-[#8b949e] leading-relaxed">
              Standard AI chatbots invent fake performance numbers and plausible rationales. CodeWhy reconstructs verified engineering rationale by traversing AST symbols, commits, PR discussions, and ADRs with claim-level citation validation and calibrated abstention.
            </p>
          </div>

          {/* Storage & Persistence Status */}
          <div className="flex flex-col items-start md:items-end gap-2 shrink-0 text-xs font-mono">
            <div 
              className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] flex items-center gap-2 shadow-xs"
              title={graphStatus?.neo4jError || (graphStatus?.neo4jConnected ? 'Connected to live Neo4j Aura cloud database' : 'Operating in tested in-memory graph mode')}
            >
              <span className={`w-2 h-2 rounded-full ${graphStatus?.neo4jConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <Database className="w-3.5 h-3.5 text-neutral-400" />
              <span className="font-semibold">{graphStatus?.storageLabel || 'Neo4j Persistent Graph'}</span>
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-[#8b949e]">
              Active Graph: {graphStatus?.inMemoryNodeCount || 21} Nodes · {graphStatus?.inMemoryEdgeCount || 32} Edges
            </div>
          </div>
        </div>
      </div>

      {/* Repository Selection & Usability Console */}
      <div className="p-5 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-[#21262d] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-[#8b949e]">
              Step 1 · Target Repository
            </span>
            <span className="text-xs text-neutral-400 dark:text-[#6e7681]">•</span>
            <span className="text-xs text-neutral-600 dark:text-[#8b949e]">
              Select a verified demonstration slice or enter a custom repository
            </span>
          </div>
          {repository && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-500">
              <span>Active:</span>
              <span className="font-bold text-blue-600 dark:text-[#58a6ff]">{repository}</span>
            </div>
          )}
        </div>

        {/* Repository Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Repo 1: Express */}
          <button
            type="button"
            onClick={() => handleSwitchRepoTab('expressjs/express')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              selectedRepoTab === 'expressjs/express' && !isCustomMode
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-neutral-100 dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-200 dark:hover:bg-[#30363d]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>expressjs/express</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-normal bg-black/20">Indexed</span>
          </button>

          {/* Preset Repo 2: Backstage */}
          <button
            type="button"
            onClick={() => handleSwitchRepoTab('backstage/backstage')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              selectedRepoTab === 'backstage/backstage' && !isCustomMode
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-neutral-100 dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-200 dark:hover:bg-[#30363d]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>backstage/backstage (CNCF)</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-normal bg-black/20">Indexed</span>
          </button>

          {/* Custom Repo Button */}
          <button
            type="button"
            onClick={() => setIsCustomMode(!isCustomMode)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isCustomMode
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-neutral-100 dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-200 dark:hover:bg-[#30363d]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>+ Custom Repository</span>
          </button>
        </div>

        {/* Custom Repository Input Drawer */}
        {isCustomMode && (
          <form onSubmit={handleApplyCustomRepo} className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300">
                Check Repository Indexing Status
              </span>
              <span className="text-[11px] text-neutral-500 dark:text-[#8b949e]">
                Format: owner/repo or https://github.com/owner/repo
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customRepoInput}
                onChange={(e) => setCustomRepoInput(e.target.value)}
                placeholder="e.g. facebook/react, vercel/next.js, or https://github.com/facebook/react"
                className="flex-1 px-3.5 py-2 rounded-lg border border-neutral-300 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-xs font-mono text-neutral-900 dark:text-[#f0f6fc] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={isValidatingRepo || !customRepoInput.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 shrink-0 flex items-center gap-1.5"
              >
                {isValidatingRepo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                <span>Set Repository</span>
              </button>
            </div>
            {/* Indexing Progress Card */}
            {isIndexing && (
              <div className="p-3.5 rounded-lg bg-white dark:bg-[#161b22] border border-indigo-200 dark:border-indigo-900/60 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span>{indexingStage || 'Ingesting repository engineering evidence...'}</span>
                  </span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{indexingProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 rounded-full transition-all duration-300" 
                    style={{ width: `${indexingProgress}%` }}
                  />
                </div>
                {/* Source Category Status Indicators */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 flex items-center gap-1">
                    <GitCommit className="w-3 h-3 text-blue-500" /> Commits & Diffs
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900/50 flex items-center gap-1">
                    <GitPullRequest className="w-3 h-3 text-purple-500" /> Pull Requests
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-amber-500" /> Issues
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-emerald-500" /> ADRs
                  </span>
                  <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d] flex items-center gap-1">
                    <Layers className="w-3 h-3 text-neutral-500" /> Manifests
                  </span>
                </div>
              </div>
            )}

            {/* Indexing Error Banner */}
            {indexingError && !isIndexing && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-300 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{indexingError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleIndexRepo(customRepoStatus?.repository || customRepoInput, true)}
                  className="px-2.5 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Custom Repo Status & Trigger Card */}
            {customRepoStatus && !isIndexing && (
              <div className="p-3.5 rounded-lg bg-white dark:bg-[#161b22] border border-neutral-200 dark:border-[#30363d] space-y-2.5 text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${customRepoStatus.indexed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="font-bold text-neutral-900 dark:text-[#f0f6fc]">{customRepoStatus.repository}</span>
                    <span className="text-neutral-500 dark:text-[#8b949e]">· {customRepoStatus.statusLabel}</span>
                  </div>

                  {customRepoStatus.indexed ? (
                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                      {onNavigateToGraph && (
                        <button
                          type="button"
                          onClick={() => onNavigateToGraph(customRepoStatus.repository)}
                          className="px-3 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                        >
                          <GitFork className="w-3.5 h-3.5" />
                          <span>Open in Decision Graph</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleIndexRepo(customRepoStatus.repository, true)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-neutral-300 dark:border-[#30363d] hover:bg-neutral-50 dark:hover:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3 h-3 text-neutral-500" />
                        <span>Re-index Repository</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleIndexRepo(customRepoStatus.repository)}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <GitCommit className="w-3.5 h-3.5" />
                      <span>Index Repository Evidence</span>
                    </button>
                  )}
                </div>

                {customRepoStatus.indexed ? (
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-neutral-600 dark:text-[#8b949e]">
                    {customRepoStatus.counts && (
                      <div className="flex items-center gap-2 font-mono">
                        <span>{customRepoStatus.counts.commits || 0} commits</span>
                        <span>•</span>
                        <span>{customRepoStatus.counts.pullRequests || 0} PRs</span>
                        <span>•</span>
                        <span>{customRepoStatus.counts.issues || 0} issues</span>
                        {customRepoStatus.counts.adrs > 0 && (
                          <>
                            <span>•</span>
                            <span>{customRepoStatus.counts.adrs} ADRs</span>
                          </>
                        )}
                      </div>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-neutral-100 dark:bg-[#21262d] border border-neutral-200 dark:border-[#30363d] text-neutral-700 dark:text-[#c9d1d9]">
                      {customRepoStatus.storageLabel || 'In-Memory Store (Non-durable)'}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-500 dark:text-[#8b949e] leading-relaxed">
                    Repository has not yet been indexed. Click &quot;Index Repository Evidence&quot; to fetch bounded commits, PRs, issues, and ADRs through the GitHub API into the graph.
                  </p>
                )}
              </div>
            )}
          </form>
        )}

        {/* Demo Preset Buttons (Only for Indexed Repositories) */}
        {!isCustomMode && (
          <div className="space-y-2 pt-1">
            <span className="text-xs font-medium text-neutral-500 dark:text-[#8b949e]">
              Verified Demonstration Scenarios:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {selectedRepoTab === 'expressjs/express' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('express-body-parser-compromise')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                      activePreset === 'express-body-parser-compromise'
                        ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-300 font-semibold'
                        : 'bg-white dark:bg-[#21262d] border-neutral-200 dark:border-[#30363d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-50 dark:hover:bg-[#30363d]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Scenario 1: Express Body-Parser Scoped Compromise</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPreset('express-multipart-partial-evidence')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                      activePreset === 'express-multipart-partial-evidence'
                        ? 'bg-purple-50 border-purple-400 text-purple-700 dark:bg-purple-950/60 dark:border-purple-700 dark:text-purple-300 font-semibold'
                        : 'bg-white dark:bg-[#21262d] border-neutral-200 dark:border-[#30363d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-50 dark:hover:bg-[#30363d]'
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5 text-purple-500" />
                    <span>Partial Evidence: Multipart Omission (API Consensus)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPreset('express-mocha-jest-counterfactual')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                      activePreset === 'express-mocha-jest-counterfactual'
                        ? 'bg-amber-50 border-amber-400 text-amber-700 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-300 font-semibold'
                        : 'bg-white dark:bg-[#21262d] border-neutral-200 dark:border-[#30363d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-50 dark:hover:bg-[#30363d]'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Contradicted Premise: Mocha vs Jest Refutation</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSelectPreset('backstage-adr-fetch-supersession')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                      activePreset === 'backstage-adr-fetch-supersession'
                        ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-950/60 dark:border-blue-700 dark:text-blue-300 font-semibold'
                        : 'bg-white dark:bg-[#21262d] border-neutral-200 dark:border-[#30363d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-50 dark:hover:bg-[#30363d]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Scenario 2: ADR014 Native Fetch (Supersedes ADR013)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPreset('backstage-unrecorded-benchmarks')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                      activePreset === 'backstage-unrecorded-benchmarks'
                        ? 'bg-amber-50 border-amber-400 text-amber-700 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-300 font-semibold'
                        : 'bg-white dark:bg-[#21262d] border-neutral-200 dark:border-[#30363d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-50 dark:hover:bg-[#30363d]'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Scenario 3: Honest Abstention on Latency Benchmarks</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Investigation Question Console */}
      <div className="p-5 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-[#8b949e]">
            Step 2 · Investigation Question
          </span>
          <span className="text-[11px] text-neutral-400 dark:text-[#6e7681]">
            Speech-to-Text via Sarvam Saaras v4 or Browser Native
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-[#6e7681]" />
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvestigate()}
              placeholder="Ask why code exists in its current form..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-sm text-neutral-900 dark:text-[#f0f6fc] focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-[#58a6ff]"
            />
          </div>

          {/* Sarvam AI Microphone Button */}
          <button
            type="button"
            onClick={handleToggleVoiceRecord}
            disabled={isLoading || isTranscribing}
            className={`px-3.5 py-2.5 rounded-lg border transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-xs ${
              isRecording
                ? 'bg-red-500 text-white border-red-600 animate-pulse'
                : isTranscribing
                ? 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                : 'bg-white dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] border-neutral-300 dark:border-[#30363d] hover:bg-neutral-50 dark:hover:bg-[#30363d]'
            }`}
            title={isRecording ? 'Click to stop recording' : 'Dictate question with Sarvam Saaras v4 STT'}
          >
            {isRecording ? (
              <MicOff className="w-4 h-4 text-white" />
            ) : isTranscribing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
            ) : (
              <Mic className="w-4 h-4 text-neutral-600 dark:text-[#8b949e]" />
            )}
            <span className="hidden sm:inline text-xs font-semibold">
              {isRecording ? 'Listening...' : isTranscribing ? 'Transcribing...' : 'Voice Query'}
            </span>
          </button>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => handleInvestigate()}
            disabled={isLoading || !question.trim()}
            className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 shadow-xs"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span>{isLoading ? 'Investigating...' : 'Investigate Why'}</span>
          </button>
        </div>

        {/* Voice Feedback Banner */}
        {voiceNotice && (
          <div className={`p-2.5 rounded-lg text-xs flex items-center justify-between gap-2 ${
            voiceNotice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : voiceNotice.type === 'info'
              ? 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
          }`}>
            <span>{voiceNotice.message}</span>
            <button
              type="button"
              onClick={() => setVoiceNotice(null)}
              className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 font-bold ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* Scoped Entity Coordinates */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-[#8b949e] pt-1">
          <span>Target Repository: <code className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium">{repository}</code></span>
          {filePath && (
            <>
              <span>•</span>
              <span>File: <code className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium">{filePath}</code></span>
            </>
          )}
          {symbol && (
            <>
              <span>•</span>
              <span>Symbol: <code className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium">{symbol}</code></span>
            </>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl border border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Investigation Error</p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="p-8 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-center space-y-3 animate-pulse">
          <RefreshCw className="w-7 h-7 text-blue-500 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-neutral-800 dark:text-[#c9d1d9]">
            Traversing decision graph and validating historical citations...
          </p>
          <p className="text-xs text-neutral-400 dark:text-[#6e7681]">
            Cross-referencing AST symbols against commits, pull request rationales, and architecture decisions.
          </p>
        </div>
      )}

      {/* Main Results Display */}
      {answerData && !isLoading && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Unindexed Repository Notice with Direct Indexing Action */}
          {answerData.status === 'UNINDEXED_REPOSITORY' && (
            <div className="p-6 rounded-2xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 text-neutral-900 dark:text-[#f0f6fc] font-bold text-base">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <span>Repository Not Yet Indexed</span>
              </div>
              <p className="text-xs sm:text-sm text-neutral-700 dark:text-[#c9d1d9] leading-relaxed">
                Repository <code className="font-mono font-bold text-neutral-900 dark:text-[#f0f6fc]">{answerData.repository}</code> has not been indexed for historical investigation. To explain why code exists in its current form, CodeWhy requires primary historical evidence—including commit diffs, pull request discussions, issue consensus, and Architecture Decision Records (ADRs).
              </p>

              {/* Live Indexing Action Box */}
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-blue-600" />
                    <span>General-Purpose Evidence Indexing</span>
                  </span>
                  <span className="text-[11px] text-neutral-500 dark:text-[#8b949e]">
                    Bounded ingestion: Commits, PRs, Issues, ADRs
                  </span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-[#8b949e]">
                  Index this repository to fetch recent commits, diffs, pull request rationale, closed issues, and ADR documents through the GitHub API into the graph.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleIndexRepo(answerData.repository)}
                    disabled={isIndexing}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isIndexing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <GitCommit className="w-3.5 h-3.5" />}
                    <span>{isIndexing ? 'Indexing in Progress...' : `Index ${answerData.repository} Evidence Now`}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#30363d] space-y-2 text-xs">
                <p className="font-semibold text-neutral-900 dark:text-[#f0f6fc]">Verified Demonstration Presets</p>
                <p className="text-neutral-600 dark:text-[#8b949e] leading-relaxed">
                  Alternatively, explore one of the frozen multi-hop decision graphs and verified historical evidence slices:
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSwitchRepoTab('expressjs/express')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#21262d] border border-neutral-200 dark:border-[#30363d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-100 dark:hover:bg-[#30363d] shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Explore Express.js (Scoped Compromise)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchRepoTab('backstage/backstage')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#21262d] border border-neutral-200 dark:border-[#30363d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-100 dark:hover:bg-[#30363d] shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Explore Backstage (ADR Supersession)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Answer Card Top Header (For all answered or abstained queries) */}
          <div className="p-6 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 dark:border-[#21262d] pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  answerData.status === 'ANSWERED' 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                    : answerData.status === 'PARTIALLY_SUPPORTED'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                }`}>
                  Status: {answerData.status}
                </span>

                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  answerData.confidence === 'HIGH'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                    : answerData.confidence === 'MEDIUM'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300'
                    : 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'
                }`}>
                  Confidence: {answerData.confidence}
                </span>

                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getSourceOriginBadgeClass(answerData.sourceMode)}`}>
                  Origin: {getSourceOriginLabel(answerData.sourceMode)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {onNavigateToGraph && answerData.status !== 'UNINDEXED_REPOSITORY' && (
                  <button
                    type="button"
                    onClick={() => onNavigateToGraph(repository)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
                  >
                    <GitFork className="w-3.5 h-3.5" />
                    <span>Explore in Decision Graph</span>
                  </button>
                )}

                {answerData.status !== 'UNINDEXED_REPOSITORY' &&
                 answerData.sourceMode !== 'unindexed_repository' &&
                 Array.isArray(answerData.citations) &&
                 answerData.citations.length > 0 &&
                 answerData.epistemicValidation?.valid &&
                 answerData.epistemicValidation?.claimSupportConfirmed && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Citations Verified (Claim-Level Validation)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Short Answer */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider uppercase text-neutral-400 dark:text-[#6e7681]">
                  {answerData.status === 'PREMISE_CONTRADICTED' || answerData.status === 'ABSTAIN' || answerData.status === 'UNINDEXED_REPOSITORY' ? 'Abstention Summary' : 'Executive Finding'}
                </span>
                <button
                  type="button"
                  onClick={() => handleReadAloud(answerData.shortAnswer)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    isPlayingAudio
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-neutral-100 dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9] hover:bg-neutral-200 dark:hover:bg-[#30363d]'
                  }`}
                  title="Listen with Sarvam Bulbul TTS or Browser Native Speech"
                >
                  {isPlayingAudio ? (
                    <VolumeX className="w-3.5 h-3.5 animate-pulse text-amber-600" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-blue-500" />
                  )}
                  <span>{isPlayingAudio ? 'Stop Reading' : 'Listen Briefing'}</span>
                </button>
              </div>
              <p className="text-base sm:text-lg font-medium text-neutral-900 dark:text-[#f0f6fc] leading-relaxed">
                {answerData.shortAnswer}
              </p>
            </div>

            {/* Abstention & Contradicted Premise Display */}
            {(answerData.status === 'PREMISE_CONTRADICTED' || answerData.status === 'ABSTAIN') && (
              <div className="p-5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      {answerData.status === 'PREMISE_CONTRADICTED'
                        ? 'Contradicted Premise Detected'
                        : 'Documented Maintainer Rationale Unavailable in Indexed Evidence'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200">
                    Abstention Mode: Active
                  </span>
                </div>

                <div className="text-xs sm:text-sm text-amber-900 dark:text-amber-100 leading-relaxed space-y-1.5">
                  <p className="font-medium">
                    {answerData.abstentionReason}
                  </p>
                  <p className="text-xs text-amber-800/90 dark:text-amber-300/80">
                    {answerData.status === 'PREMISE_CONTRADICTED'
                      ? 'The query assumes a historical event or technical migration that the repository’s documentary evidence directly refutes.'
                      : 'While repository records were sampled and inspected, they do not record the maintainers’ causal reasoning or design consensus for this question. CodeWhy strictly requires primary engineering evidence and abstains from fabricating hypotheses.'}
                  </p>
                </div>

                {/* Inspected Records Sample (Clean human-readable list, never raw JSON) */}
                {Array.isArray(answerData.searchedEntities) && answerData.searchedEntities.length > 0 && (
                  <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900/40 space-y-1.5">
                    <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                      Sampled Records Inspected:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {answerData.searchedEntities.map((ent, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-[#161b22] border border-amber-300/80 dark:border-amber-800/60 text-neutral-800 dark:text-[#c9d1d9] shadow-2xs"
                        >
                          {ent}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actionable Next Steps */}
                <div className="p-3 rounded-lg bg-white/70 dark:bg-[#161b22]/70 border border-amber-200 dark:border-amber-900/40 space-y-1.5 text-xs text-neutral-700 dark:text-[#8b949e]">
                  <span className="font-bold text-neutral-900 dark:text-[#f0f6fc]">Recommended Developer Next Steps:</span>
                  <ul className="list-disc pl-4 space-y-1 text-[11px]">
                    <li>Try querying a specific file path or symbol (e.g. <code>package.json</code> or a core module).</li>
                    <li>If this choice was discussed in a specific pull request or issue, verify if that issue number falls within the indexed slice.</li>
                    {onNavigateToGraph && (
                      <li>
                        <button
                          type="button"
                          onClick={() => onNavigateToGraph(repository)}
                          className="text-blue-600 dark:text-[#58a6ff] hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <span>Explore connected entities in Decision Graph</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {/* Epistemic Distinction Callout (Supported Compromise) */}
            {answerData.epistemicDistinction && (
              <div className="p-4 rounded-lg bg-neutral-50 dark:bg-[#0d1117] border border-neutral-200 dark:border-[#21262d] space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-[#c9d1d9]">
                  <Scale className="w-3.5 h-3.5 text-blue-500" />
                  <span>Engineering Evidence Breakdown: Implementation Facts vs Maintainer Intent</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-neutral-600 dark:text-[#8b949e]">
                  <div>
                    <span className="font-medium text-neutral-900 dark:text-[#f0f6fc]">Direct Implementation Facts: </span>
                    <span>{answerData.epistemicDistinction.verifiedImplementationFacts}</span>
                  </div>
                  <div>
                    <span className="font-medium text-neutral-900 dark:text-[#f0f6fc]">Explicit Maintainer Rationale: </span>
                    <span>{answerData.epistemicDistinction.explicitMaintainerRationale}</span>
                  </div>
                  <div>
                    <span className="font-medium text-amber-700 dark:text-amber-400">Security Misattribution Guard: </span>
                    <span>{answerData.epistemicDistinction.epistemicCorrectionOnSecurity}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Two-Column Grid: Timeline on Left, Epistemic Breakdown on Right */}
          {(answerData.status === 'ANSWERED' || answerData.status === 'PARTIALLY_SUPPORTED') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Decision Timeline (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-5 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-[#21262d] pb-3">
                    <Clock className="w-4 h-4 text-neutral-500 dark:text-[#8b949e]" />
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-[#f0f6fc]">
                      Historical Decision Timeline
                    </h3>
                  </div>

                  <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200 dark:before:bg-[#30363d]">
                    {answerData.timeline?.map((event, idx) => (
                      <div key={idx} className="relative space-y-1">
                        <span className={`absolute -left-[19px] top-1 w-3 h-3 rounded-full border-2 border-white dark:border-[#161b22] ${
                          event.status === 'ACTIVE'
                            ? 'bg-emerald-500'
                            : event.status === 'PARTIALLY_SUPERSEDED'
                            ? 'bg-amber-500'
                            : 'bg-blue-500'
                        }`} />
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium text-neutral-400 dark:text-[#6e7681]">
                            {event.date}
                          </span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                            event.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                          }`}>
                            {event.status}
                          </span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-[#f0f6fc]">
                          {event.title}
                        </h4>
                        <p className="text-xs text-neutral-600 dark:text-[#8b949e] leading-relaxed">
                          {event.description}
                        </p>
                        <div className="pt-0.5 flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-[#6e7681]">
                          <User className="w-3 h-3" />
                          <span>{event.actor}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Epistemic Breakdown (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Verified Facts */}
                <div className="p-5 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-3">
                  <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-[#21262d] pb-3">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-[#f0f6fc]">
                      Verified Facts (100% Grounded in Commits/Issues)
                    </h3>
                  </div>

                  <ul className="space-y-3">
                    {answerData.verifiedFacts?.map((fact) => (
                      <li key={fact.id} className="text-xs sm:text-sm text-neutral-700 dark:text-[#c9d1d9] flex items-start gap-2.5 leading-relaxed">
                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          [{fact.id}]
                        </span>
                        <span>{fact.statement}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Uncertain Findings (If partial support) */}
                {answerData.uncertainFindings?.length > 0 && (
                  <div className="p-5 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 border-b border-purple-100 dark:border-purple-900/40 pb-2">
                      <Scale className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <h4 className="text-xs font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wider">
                        Uncertain / Unverified Technical Hypotheses
                      </h4>
                    </div>
                    <ul className="space-y-2">
                      {answerData.uncertainFindings.map((uf) => (
                        <li key={uf.id} className="text-xs text-neutral-700 dark:text-[#c9d1d9] space-y-0.5">
                          <p className="font-medium">{uf.statement}</p>
                          <p className="text-[11px] text-neutral-500 dark:text-[#8b949e]">{uf.rationale}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Active Rationale Hypothesis */}
                {answerData.activeRationaleHypothesis && (
                  <div className="p-5 rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
                        Active Rationale Hypothesis ({answerData.activeRationaleHypothesis.certainty})
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-neutral-800 dark:text-[#c9d1d9] leading-relaxed">
                      {answerData.activeRationaleHypothesis.summary}
                    </p>
                  </div>
                )}

                {/* Contradictory / Divergent Evidence */}
                {answerData.contradictoryEvidence?.length > 0 && (
                  <div className="p-5 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-3">
                    <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-[#21262d] pb-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-[#f0f6fc] uppercase tracking-wider">
                        Divergent / Contradictory Evidence in Record
                      </h4>
                    </div>
                    {answerData.contradictoryEvidence.map((cont, idx) => (
                      <div key={idx} className="space-y-1 text-xs">
                        <p className="italic text-neutral-600 dark:text-[#8b949e]">
                          "{cont.excerpt}" — <span className="font-medium text-neutral-800 dark:text-[#c9d1d9]">{cont.author}</span>
                        </p>
                        <p className="text-neutral-500 dark:text-[#6e7681]">
                          <span className="font-semibold">Significance:</span> {cont.impact}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Missing Information Panel */}
          {answerData.missingInformation?.length > 0 && (
            <div className="p-5 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-3">
              <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-[#21262d] pb-2">
                <Info className="w-4 h-4 text-blue-500" />
                <h4 className="text-xs font-bold text-neutral-900 dark:text-[#f0f6fc] uppercase tracking-wider">
                  Missing Information / Gaps in Documentary Record
                </h4>
              </div>
              <ul className="space-y-2">
                {answerData.missingInformation.map((item, idx) => (
                  <li key={idx} className="text-xs text-neutral-600 dark:text-[#8b949e] flex items-start gap-2">
                    <span className="font-mono text-neutral-400 dark:text-[#6e7681]">[{item.id || idx + 1}]</span>
                    <div>
                      <span className="text-neutral-800 dark:text-[#c9d1d9] font-medium">{item.description}</span>
                      {item.rationale && <span className="text-neutral-500 dark:text-[#6e7681]"> — {item.rationale}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Clickable Evidence Cards */}
          {answerData.citations?.length > 0 && (
            <div className="p-5 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 dark:border-[#21262d] pb-3">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-[#f0f6fc]">
                    Retrieved Source Evidence & Permalinks
                  </h3>
                </div>
                <span className="text-xs text-neutral-500 dark:text-[#8b949e]">
                  {answerData.citations.length} Verified Sources
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {answerData.citations.map((cit) => {
                  const isExpanded = expandedCitations.has(cit.id);
                  const excerpt = (cit.verbatimExcerpt || '').trim();
                  const isLong = excerpt.length > 220;
                  const displayExcerpt = isExpanded || !isLong ? excerpt : excerpt.slice(0, 200) + '...';

                  return (
                    <div
                      key={cit.id}
                      className="p-4 rounded-lg border border-neutral-200 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] space-y-2 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                            cit.type === 'adr'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                              : cit.type === 'pull_request'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : cit.type === 'commit'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                              : cit.type === 'issue'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : cit.type === 'manifest'
                              ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/80 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800'
                              : 'bg-neutral-200 dark:bg-[#21262d] text-neutral-700 dark:text-[#c9d1d9]'
                          }`}>
                            {cit.type === 'adr' ? 'ADR Record' : cit.type === 'pull_request' ? 'Pull Request' : cit.type === 'manifest' ? 'Manifest' : cit.type === 'commit' ? 'Commit' : cit.type === 'issue' ? 'Issue' : cit.type}
                          </span>
                          <span className="text-[11px] font-mono text-neutral-400 dark:text-[#6e7681]">
                            {cit.timestamp?.split('T')[0] || 'Historical'}
                          </span>
                        </div>

                        <h5 className="text-xs font-semibold text-neutral-900 dark:text-[#f0f6fc] line-clamp-2">
                          {cit.title}
                        </h5>

                        <p className="text-[11px] text-neutral-500 dark:text-[#8b949e]">
                          Author: <span className="font-medium text-neutral-700 dark:text-[#c9d1d9]">{cit.author || 'Maintainers'}</span>
                        </p>

                        <div className="p-2.5 rounded bg-white dark:bg-[#161b22] border border-neutral-200 dark:border-[#21262d] font-mono text-[11px] text-neutral-700 dark:text-[#8b949e]">
                          <pre className="whitespace-pre-wrap font-mono leading-relaxed">{displayExcerpt}</pre>
                          {isLong && (
                            <button
                              type="button"
                              onClick={() => toggleExpandCitation(cit.id)}
                              className="text-[10px] text-blue-600 dark:text-[#58a6ff] hover:underline font-semibold mt-1.5 flex items-center gap-0.5"
                            >
                              {isExpanded ? (
                                <>
                                  <span>Collapse excerpt</span>
                                  <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  <span>Show full excerpt ({excerpt.length} chars)</span>
                                  <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {cit.url && cit.url.startsWith('https://') && (
                        <a
                          href={cit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="pt-2 text-xs font-medium text-blue-600 dark:text-[#58a6ff] hover:underline flex items-center gap-1"
                        >
                          <span>View GitHub Artifact</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collapsible Technical Verification & Graph Provenance Details */}
          <details className="p-4 rounded-xl border border-neutral-200 dark:border-[#30363d] bg-neutral-50/60 dark:bg-[#161b22]/50 text-xs text-neutral-600 dark:text-[#8b949e]">
            <summary className="font-semibold text-neutral-800 dark:text-[#c9d1d9] cursor-pointer hover:text-blue-600 dark:hover:text-[#58a6ff] flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Technical Verification & Graph Provenance Details</span>
              </div>
              <span className="text-[11px] font-normal text-neutral-400">Click to expand diagnostics</span>
            </summary>
            <div className="pt-3 mt-3 border-t border-neutral-200 dark:border-[#21262d] space-y-3 font-mono text-[11px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-neutral-700 dark:text-[#c9d1d9]">
                <div><span className="text-neutral-500">Repository Scoped:</span> {answerData.repository}</div>
                <div><span className="text-neutral-500">Source Mode:</span> {answerData.sourceMode}</div>
                <div><span className="text-neutral-500">Storage Mode:</span> {answerData.storageMode}</div>
                <div><span className="text-neutral-500">Claim-Level Verified:</span> {answerData.epistemicValidation?.claimSupportConfirmed ? 'Yes (Strict 1:1 Grounding)' : 'Pending / Abstained'}</div>
              </div>
              {answerData.epistemicValidation?.checks && (
                <div className="p-2.5 rounded bg-white dark:bg-[#0d1117] border border-neutral-200 dark:border-[#21262d] space-y-1">
                  <span className="text-neutral-500 font-sans font-bold">Rule Evaluation Checks:</span>
                  <ul className="space-y-0.5">
                    {Object.entries(answerData.epistemicValidation.checks).map(([chk, pass]) => (
                      <li key={chk} className="flex items-center gap-1.5">
                        <span className={pass ? 'text-emerald-500' : 'text-amber-500'}>{pass ? '✓' : '✗'}</span>
                        <span>{chk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
