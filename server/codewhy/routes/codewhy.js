/**
 * CodeWhy API Routes
 * 
 * Endpoints for:
 * - POST /api/v1/evidence/ingest-slice
 * - POST /api/v1/why-code
 * - GET  /api/v1/why-code/presets
 * - GET  /api/v1/evidence/status
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchEvidenceSlice } from '../evidence/fetcher.js';
import { ingestSliceToGraph, retrieveEntityProvenance, rehydrateFromNeo4j, inMemoryGraph } from '../graph/adapter.js';
import { synthesizeWhyAnswer } from '../services/synthesizer.js';
import { checkNeo4jHealth } from '../../db/neo4j.js';
import { indexRepository, getIndexingStatus, normalizeGitHubRepo } from '../services/indexer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const codewhyRouter = express.Router();

/**
 * GET /api/v1/why-code/presets
 * Returns curated demo presets for supported investigations, partial-evidence queries, and abstention tests.
 */
codewhyRouter.get('/why-code/presets', (req, res) => {
  res.json({
    repositories: [
      { 
        id: 'expressjs/express', 
        name: 'Express.js (Node.js)', 
        indexed: true, 
        status: 'FULLY_INDEXED',
        statusLabel: 'Fully Indexed (Commits, Issues, Decisions)',
        coverage: '4.0–4.16.0 body-parser compromise line'
      },
      { 
        id: 'backstage/backstage', 
        name: 'Backstage (CNCF)', 
        indexed: true, 
        status: 'FULLY_INDEXED',
        statusLabel: 'Fully Indexed (ADRs, Pull Requests, Supersession)',
        coverage: 'ADR013 -> ADR014 native fetch supersession'
      }
    ],
    presets: [
      {
        id: 'express-body-parser-compromise',
        type: 'SUPPORTED_INVESTIGATION',
        title: 'Express 4.16 Scoped Body-Parser Re-addition',
        repository: 'expressjs/express',
        file: 'lib/express.js',
        symbol: 'exports.json',
        question: 'Why does lib/express.js export express.json directly while express.bodyParser throws an error?',
        description: 'Demonstrates a scoped compromise: restoring convenience wrappers for JSON while upholding the removal of generic bodyParser.'
      },
      {
        id: 'backstage-adr-fetch-supersession',
        type: 'SUPPORTED_INVESTIGATION',
        title: 'Backstage ADR014 Native Fetch Supersession',
        repository: 'backstage/backstage',
        file: 'docs/architecture-decisions/adr014-use-fetch.md',
        symbol: 'ADR014',
        question: 'Why was the node-fetch decision superseded by the native fetch decision in Backstage?',
        description: 'Demonstrates cross-repository formal supersession: ADR013 superseded by ADR014 due to Node 20 runtime standard and library issue resolution.'
      },
      {
        id: 'express-mocha-jest-counterfactual',
        type: 'PREMISE_CONTRADICTED',
        title: 'Mocha to Jest Migration Query (Contradicted Premise)',
        repository: 'expressjs/express',
        file: 'package.json',
        symbol: 'scripts.test',
        question: 'Why did Express switch from Mocha to Jest for its unit tests in Express 4.16.0?',
        description: 'Demonstrates honest abstention: system verifies the premise is contradicted by package.json devDependencies and declines to speculate.'
      },
      {
        id: 'backstage-unrecorded-benchmarks',
        type: 'INSUFFICIENT_EVIDENCE',
        title: 'Backstage Performance Benchmarks Query (Insufficient Evidence)',
        repository: 'backstage/backstage',
        file: 'docs/architecture-decisions/adr014-use-fetch.md',
        symbol: 'ADR014',
        question: 'What throughput or memory consumption benchmarks motivated Backstage to replace node-fetch with native fetch in ADR014?',
        description: 'Demonstrates honest abstention on partial evidence: system explains Node 20 runtime rationale but declines to fabricate unrecorded benchmarks.'
      },
      {
        id: 'express-multipart-partial-evidence',
        type: 'PARTIAL_EVIDENCE_INVESTIGATION',
        title: 'Express 4.16 Multipart Omission (Partial Evidence)',
        repository: 'expressjs/express',
        file: 'lib/express.js',
        symbol: 'removedMiddlewares.multipart',
        question: 'Why did Express omit a multipart parser when re-adding express.json in 4.16.0?',
        description: 'Demonstrates partial evidence: verifies maintainer API consensus rationale while labeling benchmark and disk I/O claims as unverified.'
      }
    ]
  });
});

/**
 * GET /api/v1/why-code/repository-status
 * Validates repository format and returns honest indexing status & guidance.
 */
codewhyRouter.get('/why-code/repository-status', async (req, res) => {
  const repoRaw = (req.query.repository || req.query.repo || '').trim();
  if (!repoRaw) {
    return res.status(400).json({ status: 'ERROR', error: 'Repository parameter is required.' });
  }

  let repoMeta;
  try {
    repoMeta = normalizeGitHubRepo(repoRaw);
  } catch (err) {
    return res.status(400).json({ status: 'ERROR', error: 'Invalid repository format. Expected "owner/repo" or full GitHub URL.' });
  }

  const repo = repoMeta.fullName;
  const repoLower = repo.toLowerCase();
  const isExpress = repoLower.includes('express');
  const isBackstage = repoLower.includes('backstage');

  // If repository is not yet in in-memory graph, attempt to rehydrate from persistent Neo4j store
  if (!inMemoryGraph.getNode(repo)) {
    await rehydrateFromNeo4j(repo).catch(() => false);
  }

  // Check in-memory index registry
  const regStatus = getIndexingStatus(repo);
  const repoNode = inMemoryGraph.getNode(repo);
  const inGraph = Boolean(repoNode && repoNode.sourceMode !== 'unindexed_repository' && (inMemoryGraph.findNodesByLabel('Commit').some(c => c.repository === repo) || inMemoryGraph.findNodesByLabel('ADR').some(a => a.id.startsWith(repo))));

  if (regStatus && regStatus.status !== 'IDLE') {
    return res.json({
      repository: repo,
      indexed: regStatus.status === 'READY' || regStatus.status === 'PARTIAL',
      status: regStatus.status,
      statusLabel: regStatus.status === 'READY'
        ? 'Indexed & Provenance Ready'
        : regStatus.status === 'PARTIAL'
        ? 'Partially Indexed'
        : regStatus.status === 'INDEXING'
        ? 'Indexing In Progress'
        : regStatus.status === 'FAILED'
        ? 'Indexing Failed'
        : 'Not Yet Indexed',
      stage: regStatus.stage,
      progress: regStatus.progress,
      counts: regStatus.counts,
      categories: regStatus.categories,
      isDurable: regStatus.isDurable,
      storageMode: regStatus.storageMode,
      storageLabel: regStatus.storageLabel,
      lastIndexedAt: regStatus.lastIndexedAt,
      error: regStatus.error,
      nextStep: (regStatus.status === 'READY' || regStatus.status === 'PARTIAL')
        ? 'Ready to ask rationale questions about this repository.'
        : regStatus.status === 'FAILED'
        ? 'Retry indexing or verify GitHub repository accessibility.'
        : 'Indexing in progress...'
    });
  }

  const isIndexed = isExpress || isBackstage || inGraph;

  const commits = inMemoryGraph.findNodesByLabel('Commit').filter(c => c.repository === repo || c.id?.startsWith(`${repo}:`));
  const prs = inMemoryGraph.findNodesByLabel('PullRequest').filter(p => p.repository === repo || p.id?.startsWith(`${repo}:`));
  const issues = inMemoryGraph.findNodesByLabel('Issue').filter(i => i.repository === repo || i.id?.startsWith(`${repo}:`));
  const adrs = inMemoryGraph.findNodesByLabel('ADR').filter(a => a.id.startsWith(repo) || a.repository === repo);
  const manifests = inMemoryGraph.findNodesByLabel('Manifest').filter(m => m.id.startsWith(repo) || m.repository === repo);
  const files = inMemoryGraph.findNodesByLabel('File').filter(f => {
    const r = (f.repository || f.repoFullName || '').toLowerCase();
    const id = (f.id || '').toLowerCase();
    return r === repoLower || id.startsWith(`${repoLower}:`) || id.startsWith(`${repoLower}::`);
  });

  const neo4jHealth = await checkNeo4jHealth().catch(() => ({ connected: false }));
  const isDurable = Boolean(neo4jHealth.connected);

  res.json({
    repository: repo,
    indexed: isIndexed,
    status: isIndexed ? 'FULLY_INDEXED' : 'UNINDEXED',
    statusLabel: isIndexed ? 'Indexed & Provenance Ready' : 'Not Yet Indexed',
    counts: isIndexed ? {
      commits: commits.length,
      pullRequests: prs.length,
      issues: issues.length,
      adrs: adrs.length,
      manifests: manifests.length,
      files: files.length
    } : {
      commits: 0,
      pullRequests: 0,
      issues: 0,
      adrs: 0,
      manifests: 0,
      files: 0
    },
    isDurable: isIndexed ? isDurable : false,
    storageMode: isIndexed ? (isDurable ? 'neo4j_active' : 'in_memory_verified_fallback') : 'unindexed_repository',
    storageLabel: isIndexed ? (isDurable ? 'Neo4j Persistent Graph' : 'In-Memory Store') : 'Unindexed Store',
    description: isExpress 
      ? 'Verified Node.js framework historical slice: 4.0-4.16.0 body-parser compromise line with maintainer consensus and manifest artifacts.' 
      : isBackstage 
      ? 'Verified CNCF project ADR slice: ADR013 to ADR014 native fetch supersession with PR #27925 maintainer quote.' 
      : (isIndexed ? 'Indexed repository with historical evidence records in graph store.' : 'This repository has not been indexed for historical investigation in this demonstration environment.'),
    nextStep: isIndexed ? 'Ready to ask rationale questions about this repository.' : 'Click "Index Repository Evidence" to ingest commits, issues, PRs, and decisions.'
  });
});

/**
 * POST /api/v1/why-code/index-repository
 * Triggers general-purpose indexing for an arbitrary GitHub repository.
 * Fetches commits, diffs, PRs, issues, ADRs, and manifests through GitHub API.
 */
codewhyRouter.post('/why-code/index-repository', async (req, res) => {
  try {
    const {
      repository,
      repo,
      forceReindex = false,
      commitLimit = 25,
      prLimit = 15,
      issueLimit = 15,
      githubToken
    } = req.body || {};

    const targetRepo = repository || repo;
    if (!targetRepo || typeof targetRepo !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Repository parameter is required (format: owner/repo or full GitHub URL).'
      });
    }

    try {
      normalizeGitHubRepo(targetRepo);
    } catch (normErr) {
      return res.status(400).json({
        success: false,
        error: normErr.message
      });
    }

    // Execute indexing
    const result = await indexRepository(targetRepo, {
      forceReindex: Boolean(forceReindex),
      commitLimit: Number(commitLimit) || 25,
      prLimit: Number(prLimit) || 15,
      issueLimit: Number(issueLimit) || 15,
      githubToken: githubToken || process.env.GITHUB_TOKEN
    });

    if (!result.success) {
      return res.status(result.status === 'FAILED' ? 422 : 500).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('[CodeWhy] Indexing route error:', err.message);
    res.status(500).json({
      success: false,
      error: `Indexing failed: ${err.message}`
    });
  }
});

/**
 * GET /api/v1/why-code/evaluation
 * Returns frozen 20-case quantitative benchmark evaluation results comparing
 * CodeWhy Graph Pipeline vs BM25 Keyword Baseline vs Naive LLM Synthesis.
 */
codewhyRouter.get('/why-code/evaluation', (req, res) => {
  try {
    const evalPath = path.resolve(__dirname, '../eval/evaluation_results.json');
    if (fs.existsSync(evalPath)) {
      const data = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
      return res.json({ success: true, ...data });
    }
    return res.status(404).json({ success: false, error: 'Evaluation results not yet generated.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/evidence/status
 * Returns current graph counts and transparent storage mode diagnostics.
 */
codewhyRouter.get('/evidence/status', async (req, res) => {
  const health = await checkNeo4jHealth().catch((err) => ({ connected: false, error: err.message, status: 'unreachable' }));
  const repoNodes = inMemoryGraph.findNodesByLabel('Repository').map(r => r.id);
  const activeRepositories = Array.from(new Set(['expressjs/express', 'backstage/backstage', ...repoNodes])).filter(r => Boolean(inMemoryGraph.getNode(r)));

  res.json({
    neo4jConnected: Boolean(health.connected),
    neo4jStatus: health.status || (health.connected ? 'connected' : 'unreachable'),
    neo4jError: health.connected ? null : (health.errors?.[0] || 'Neo4j instance is unreachable in this environment; operating in verified in-memory graph mode.'),
    isPersistent: Boolean(health.connected),
    storageMode: health.connected ? 'neo4j_active' : 'in_memory_verified_fallback',
    storageLabel: health.connected ? 'Neo4j Persistent Graph' : 'In-Memory Fallback (Neo4j Offline)',
    inMemoryNodeCount: inMemoryGraph.nodes.size,
    inMemoryEdgeCount: inMemoryGraph.edges.length,
    activeRepositories
  });
});

/**
 * POST /api/v1/evidence/ingest-slice
 * Ingests a repository slice into the graph.
 */
codewhyRouter.post('/evidence/ingest-slice', async (req, res) => {
  try {
    const {
      repository = 'expressjs/express',
      targetFiles = ['lib/express.js'],
      forceFixture = false
    } = req.body || {};

    // 1. Fetch slice artifacts
    const sliceData = await fetchEvidenceSlice({
      repository,
      targetFiles,
      forceFixture
    });

    // 2. Ingest into graph
    const ingestionResult = await ingestSliceToGraph(sliceData);

    res.json({
      success: true,
      repository: sliceData.repository,
      sourceMode: sliceData.sourceMode,
      fallbackReason: sliceData.fallbackReason || null,
      storageMode: ingestionResult.storageMode,
      neo4jIngested: ingestionResult.neo4jIngested,
      counts: ingestionResult.counts,
      targetEntity: sliceData.targetEntity
    });
  } catch (err) {
    console.error('[CodeWhy] Ingestion error:', err.message);
    res.status(500).json({
      success: false,
      error: `Ingestion failed: ${err.message}`
    });
  }
});

/**
 * POST /api/v1/why-code
 * Primary Rationale Explorer endpoint: asks why code exists in its current form.
 */
codewhyRouter.post('/why-code', async (req, res) => {
  try {
    const {
      repository = 'expressjs/express',
      filePath = (req.body?.repository && !req.body.repository.toLowerCase().includes('express')) ? (req.body.filePath || null) : (req.body?.filePath || 'lib/express.js'),
      symbol = (req.body?.repository && !req.body.repository.toLowerCase().includes('express')) ? (req.body.symbol || null) : (req.body?.symbol || 'exports.json'),
      question = req.body?.question || req.body?.query || (req.body?.repository?.toLowerCase().includes('express') ? 'Why does lib/express.js export express.json directly while express.bodyParser throws an error?' : ''),
      useLiveAi = false
    } = req.body || {};

    // Input Validation & Defense in Depth
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ status: 'ERROR', error: 'A non-empty question string is required.' });
    }
    if (question.length > 1000) {
      return res.status(400).json({ status: 'ERROR', error: 'Question exceeds maximum length of 1000 characters.' });
    }
    if (typeof repository !== 'string' || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
      return res.status(400).json({ status: 'ERROR', error: 'Invalid repository format. Expected "owner/repo".' });
    }
    if (filePath && (filePath.includes('..') || filePath.includes('\0'))) {
      return res.status(400).json({ status: 'ERROR', error: 'Invalid filePath provided.' });
    }

    // Auto-ingest repository slice if not yet in graph
    if (!inMemoryGraph.getNode(repository)) {
      const sliceData = await fetchEvidenceSlice({ repository, targetFiles: filePath ? [filePath] : null });
      if (sliceData.isIndexed !== false && sliceData.sourceMode !== 'unindexed_repository') {
        await ingestSliceToGraph(sliceData);
      }
    }

    // 1. Retrieve graph provenance
    const provenance = await retrieveEntityProvenance({
      repository,
      filePath,
      symbol
    });

    // 2. Synthesize answer with epistemic validation
    const answer = await synthesizeWhyAnswer({
      question: question.trim(),
      provenance,
      useLiveAi
    });

    // Attach verified storage and source origin metadata
    const health = await checkNeo4jHealth().catch(() => ({ connected: false }));
    if (!answer.sourceMode) {
      answer.sourceMode = provenance.sourceMode || 'verified_fixture';
    }
    answer.storageMode = health.connected ? 'neo4j_active' : 'in_memory_verified_fallback';

    res.json(answer);
  } catch (err) {
    console.error('[CodeWhy] Why query error:', err.message);
    res.status(500).json({
      status: 'ERROR',
      error: `Investigation failed: ${err.message}`
    });
  }
});
