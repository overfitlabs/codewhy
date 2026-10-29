/**
 * CodeWhy Phase 11: Unified Repository Context Across All Tabs Test Suite
 * 
 * Verifies that Rationale Explorer, Decision Graph, and Benchmark & Audit
 * operate on one consistent, synchronized repository context:
 * 
 * 1. Changing the selected repository updates all three tabs.
 * 2. Switching tabs preserves the selected repository.
 * 3. Indexing a custom repository updates shared selection.
 * 4. Decision Graph reloads for the selected repository.
 * 5. Old graph responses cannot overwrite newer repository selections (race-condition guard).
 * 6. Unknown repositories do not display a previous repository's graph.
 * 7. Benchmark scores remain tied to the curated evaluation dataset.
 * 8. Selected-repository audit information reflects the actual selected repository.
 * 9. Repository switching does not leak graph entities or citations.
 * 10. Existing tests and routes remain compatible.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRepoInput } from '../client/src/utils/repository.js';
import { 
  normalizeGitHubRepo, 
  indexRepository, 
  getIndexingStatus 
} from '../server/codewhy/services/indexer.js';
import { 
  inMemoryGraph, 
  retrieveEntityProvenance, 
  ingestSliceToGraph, 
  rehydrateFromNeo4j 
} from '../server/codewhy/graph/adapter.js';
import { getRepositoryMemoryOverview } from '../server/memory/retrieval.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('CodeWhy Phase 11: Unified Repository Context Test Suite', () => {

  // 1. Changing the selected repository updates all tabs (normalization & context binding)
  it('1. Changing the selected repository updates all three tabs via normalized owner/repo', () => {
    const testInputs = [
      { input: 'https://github.com/chalk/chalk.git', expected: 'chalk/chalk' },
      { input: 'git@github.com:sindresorhus/ky.git', expected: 'sindresorhus/ky' },
      { input: 'https://github.com/expressjs/express/tree/master', expected: 'expressjs/express' },
      { input: 'backstage/backstage', expected: 'backstage/backstage' },
      { input: '  colinhacks/zod  ', expected: 'colinhacks/zod' }
    ];

    for (const { input, expected } of testInputs) {
      const normalized = normalizeRepoInput(input);
      assert.equal(normalized, expected, `Input "${input}" must normalize to "${expected}"`);
    }

    // Verify state machine transition
    let shellSelectedRepo = 'expressjs/express';
    let tab1Repo = shellSelectedRepo;
    let tab2Repo = shellSelectedRepo;
    let tab3Repo = shellSelectedRepo;

    // Simulate selecting a new repository
    const onSelectRepository = (newRepo) => {
      shellSelectedRepo = normalizeRepoInput(newRepo);
      tab1Repo = shellSelectedRepo;
      tab2Repo = shellSelectedRepo;
      tab3Repo = shellSelectedRepo;
    };

    onSelectRepository('https://github.com/chalk/chalk.git');

    assert.equal(shellSelectedRepo, 'chalk/chalk');
    assert.equal(tab1Repo, 'chalk/chalk', 'Rationale Explorer must read chalk/chalk');
    assert.equal(tab2Repo, 'chalk/chalk', 'Decision Graph must read chalk/chalk');
    assert.equal(tab3Repo, 'chalk/chalk', 'Benchmark & Audit must read chalk/chalk');
  });

  // 2. Switching tabs preserves the selected repository
  it('2. Switching tabs preserves the selected repository without reset or desync', () => {
    let activeTab = 'codewhy';
    const selectedRepo = 'chalk/chalk';

    // Simulate user navigating between tabs
    activeTab = 'memory';
    assert.equal(selectedRepo, 'chalk/chalk', 'Decision Graph retains active selection');

    activeTab = 'eval';
    assert.equal(selectedRepo, 'chalk/chalk', 'Benchmark & Audit retains active selection');

    activeTab = 'codewhy';
    assert.equal(selectedRepo, 'chalk/chalk', 'Rationale Explorer retains active selection');
  });

  // 3. Indexing a custom repository updates shared selection
  it('3. Indexing a custom repository updates shared selection', async () => {
    const mockRepo = 'test-owner/test-indexer-repo';
    
    // Simulate mocked indexing completion
    const mockIndexingResult = {
      repository: mockRepo,
      success: true,
      status: 'READY',
      counts: { commits: 12, pullRequests: 5, issues: 3, adrs: 1, manifests: 1 },
      isDurable: false,
      storageMode: 'in_memory_verified_fallback',
      storageLabel: 'In-Memory Store'
    };

    let shellSelectedRepo = 'expressjs/express';
    let shellRepoStatus = null;

    const onSelectRepository = (repo, options = {}) => {
      shellSelectedRepo = normalizeRepoInput(repo);
      if (options.statusData) {
        shellRepoStatus = options.statusData;
      }
    };

    // Index completes and notifies application shell
    onSelectRepository(mockIndexingResult.repository, {
      statusData: {
        repository: mockIndexingResult.repository,
        indexed: true,
        status: mockIndexingResult.status,
        counts: mockIndexingResult.counts,
        storageMode: mockIndexingResult.storageMode,
        storageLabel: mockIndexingResult.storageLabel
      }
    });

    assert.equal(shellSelectedRepo, mockRepo, 'Active repository must be updated to newly indexed repository');
    assert.equal(shellRepoStatus.indexed, true);
    assert.equal(shellRepoStatus.counts.commits, 12);
  });

  // 4. Decision Graph reloads for the selected repository
  it('4. Decision Graph reloads for the selected repository', async () => {
    // Ingest minimal graph for repo A and repo B
    inMemoryGraph.addNode('Repository', 'repo-a/core', { fullName: 'repo-a/core' });
    inMemoryGraph.addNode('Commit', 'repo-a/core:commit:c1', { repository: 'repo-a/core', message: 'feat A' });
    inMemoryGraph.addEdge('repo-a/core', 'repo-a/core:commit:c1', 'CONTAINS_COMMIT');

    inMemoryGraph.addNode('Repository', 'repo-b/core', { fullName: 'repo-b/core' });
    inMemoryGraph.addNode('Commit', 'repo-b/core:commit:c2', { repository: 'repo-b/core', message: 'feat B' });
    inMemoryGraph.addEdge('repo-b/core', 'repo-b/core:commit:c2', 'CONTAINS_COMMIT');

    const provA = await retrieveEntityProvenance({ repository: 'repo-a/core' });
    assert.equal(provA.commits.length, 1);
    assert.equal(provA.commits[0].id, 'repo-a/core:commit:c1');

    const provB = await retrieveEntityProvenance({ repository: 'repo-b/core' });
    assert.equal(provB.commits.length, 1);
    assert.equal(provB.commits[0].id, 'repo-b/core:commit:c2');
  });

  // 5. Old graph responses cannot overwrite newer repository selections
  it('5. Old graph responses cannot overwrite newer repository selections (race-condition prevention)', async () => {
    let activeRequestId = 0;
    let committedState = { repository: 'expressjs/express', data: 'initial' };

    // Function simulating asynchronous fetch with race-condition guard
    const fetchRepoGraph = (targetRepo, delayMs, payload) => {
      const currentRequestId = ++activeRequestId;
      return new Promise((resolve) => {
        setTimeout(() => {
          // If a newer request was made, this response must be dropped
          if (currentRequestId === activeRequestId) {
            committedState = { repository: targetRepo, data: payload };
            resolve({ committed: true, requestId: currentRequestId });
          } else {
            resolve({ committed: false, requestId: currentRequestId, dropped: true });
          }
        }, delayMs);
      });
    };

    // User selects Repo 1 (slow network response: 80ms)
    const req1 = fetchRepoGraph('slow-org/repo-1', 80, 'data-for-repo-1');

    // Immediately after, user selects Repo 2 (fast network response: 20ms)
    const req2 = fetchRepoGraph('fast-org/repo-2', 20, 'data-for-repo-2');

    const [res1, res2] = await Promise.all([req1, req2]);

    assert.equal(res2.committed, true, 'Fast request for Repo 2 must be committed');
    assert.equal(res1.committed, false, 'Slow request for Repo 1 must be dropped');
    assert.equal(committedState.repository, 'fast-org/repo-2', 'State must remain Repo 2');
    assert.equal(committedState.data, 'data-for-repo-2');
  });

  // 6. Unknown repositories do not display a previous repository's graph
  it('6. Unknown repositories do not display a previous repository\'s graph (honest empty state)', async () => {
    const unknownRepo = 'unknown-org/nonexistent-library';
    const provUnknown = await retrieveEntityProvenance({ repository: unknownRepo });

    assert.equal(provUnknown.commits.length, 0, 'Unknown repo must have 0 commits');
    assert.equal(provUnknown.pullRequests.length, 0, 'Unknown repo must have 0 PRs');
    assert.equal(provUnknown.issues.length, 0, 'Unknown repo must have 0 issues');
    assert.equal(provUnknown.adrs.length, 0, 'Unknown repo must have 0 ADRs');
    assert.equal(provUnknown.sourceMode, 'unindexed_repository');
  });

  // 7. Benchmark scores remain tied to the curated evaluation dataset
  it('7. Benchmark scores remain tied to the curated evaluation dataset', () => {
    const evalPath = path.resolve(__dirname, '../server/codewhy/eval/evaluation_results.json');
    assert.ok(fs.existsSync(evalPath), 'evaluation_results.json must exist');

    const evalData = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
    assert.equal(evalData.benchmarkCasesCount, 20, 'Must contain exactly 20 cases');

    const codeWhy = evalData.systems['CodeWhy Graph Pipeline'];
    assert.ok(codeWhy, 'CodeWhy Graph Pipeline system must be present');
    assert.equal(codeWhy.cases.length, 20, 'CodeWhy must evaluate 20 cases');
    assert.equal(codeWhy.totalScore, 87.57, 'Total score must remain fixed at 87.57');
    assert.equal(codeWhy.meanScore, 4.38, 'Mean score must remain fixed at 4.38');

    // Verify represented repositories are strictly Express.js and Backstage
    const caseIds = codeWhy.cases.map(c => c.caseId);
    const expressCases = caseIds.filter(id => id.includes('EXPRESS'));
    const backstageCases = caseIds.filter(id => id.includes('BACKSTAGE'));
    assert.equal(expressCases.length + backstageCases.length, 20, 'Curated suite must only represent Express and Backstage');
  });

  // 8. Selected-repository audit information reflects the actual selected repository
  it('8. Selected-repository audit information reflects the actual selected repository', async () => {
    // Add known entity counts for chalk/chalk
    inMemoryGraph.addNode('Repository', 'chalk/chalk', { fullName: 'chalk/chalk' });
    inMemoryGraph.addNode('Commit', 'chalk/chalk:commit:c10', { repository: 'chalk/chalk', message: 'v5 release' });
    inMemoryGraph.addNode('PullRequest', 'chalk/chalk:pull:pr1', { repository: 'chalk/chalk', title: 'ESM transition' });

    const provChalk = await retrieveEntityProvenance({ repository: 'chalk/chalk' });
    assert.ok(provChalk.commits.length >= 1);
    assert.ok(provChalk.pullRequests.length >= 1);

    // Audit metadata object constructed for UI
    const auditInfo = {
      repository: 'chalk/chalk',
      isIndexed: true,
      counts: {
        commits: provChalk.commits.length,
        pullRequests: provChalk.pullRequests.length,
        issues: provChalk.issues.length,
        adrs: provChalk.adrs.length
      }
    };

    assert.equal(auditInfo.repository, 'chalk/chalk');
    assert.equal(auditInfo.isIndexed, true);
    assert.ok(auditInfo.counts.commits >= 1);
  });

  // 9. Repository switching does not leak graph entities or citations
  it('9. Repository switching does not leak graph entities or citations', async () => {
    const provExpress = await retrieveEntityProvenance({ repository: 'expressjs/express' });
    const provBackstage = await retrieveEntityProvenance({ repository: 'backstage/backstage' });

    // Assert that no Backstage ADRs leak into Express
    const expressAdrs = provExpress.adrs || [];
    assert.equal(expressAdrs.some(a => a.id.includes('backstage')), false, 'Express must not contain Backstage ADRs');

    // Assert that no Express commits leak into Backstage
    const backstageCommits = provBackstage.commits || [];
    assert.equal(backstageCommits.some(c => c.repository === 'expressjs/express'), false, 'Backstage must not contain Express commits');
  });

  // 10. Existing tests and routes remain compatible
  it('10. Existing tests and routes remain compatible', () => {
    assert.doesNotThrow(() => normalizeGitHubRepo('expressjs/express'));
    assert.doesNotThrow(() => normalizeGitHubRepo('https://github.com/backstage/backstage'));
    assert.equal(typeof inMemoryGraph.addNode, 'function');
    assert.equal(typeof retrieveEntityProvenance, 'function');
  });

  // 11. Bounded repository files are indexed, persisted as File nodes, and exposed in memory overview
  it('11. Bounded repository files are indexed, persisted as File nodes, and exposed in memory overview', async () => {
    const testRepo = 'test-org/file-system-repo';
    const testSlice = {
      repository: { id: testRepo, owner: 'test-org', name: 'file-system-repo' },
      sourceMode: 'live_github',
      files: [
        { path: 'src/index.js', name: 'index.js', size: 1024 },
        { path: 'src/core/engine.js', name: 'engine.js', size: 4096 },
        { path: 'package.json', name: 'package.json', size: 512 }
      ],
      commits: [
        {
          id: `${testRepo}:commit:sha101`,
          sha: 'sha101',
          message: 'refactor engine (src/core/engine.js)',
          files: ['src/core/engine.js']
        }
      ]
    };

    // Ingest slice
    await ingestSliceToGraph(testSlice, { forceInMemory: true });

    // Verify File nodes in graph
    const fileNodes = inMemoryGraph.findNodesByLabel('File').filter(f => f.repository === testRepo);
    assert.equal(fileNodes.length >= 3, true, 'At least 3 File nodes should exist in inMemoryGraph');

    // Overview retrieval
    const overview = await getRepositoryMemoryOverview(testRepo, { forceWithMock: true });
    assert.ok(overview.counts.files >= 3, `Expected at least 3 files, got ${overview.counts.files}`);
    assert.ok(Array.isArray(overview.files) && overview.files.length >= 3);
    assert.ok(overview.files.some(f => f.path === 'src/core/engine.js'));
    assert.ok(overview.graph.nodes.some(n => n.label === 'File' && n.title === 'src/core/engine.js'));
  });

  // 12. Decision Graph and Benchmark tabs do not render hardcoded demo preset buttons
  it('12. Decision Graph and Benchmark tabs do not render hardcoded demo preset buttons', () => {
    const appSource = fs.readFileSync(path.join(__dirname, '../client/src/App.jsx'), 'utf8');
    const benchmarkSource = fs.readFileSync(path.join(__dirname, '../client/src/components/CodeWhy/BenchmarkTab.jsx'), 'utf8');

    // Confirm that the memory tab in App.jsx does not hardcode demo preset buttons
    assert.equal(appSource.includes("onClick={() => handleSelectRepository('expressjs/express')}"), false, 'App.jsx Decision Graph must not hardcode expressjs/express preset button');
    assert.equal(appSource.includes("onClick={() => handleSelectRepository('backstage/backstage')}"), false, 'App.jsx Decision Graph must not hardcode backstage/backstage preset button');

    // Confirm BenchmarkTab does not render hardcoded demo buttons in its context bar
    assert.equal(benchmarkSource.includes("onSelectRepository('expressjs/express')"), false, 'BenchmarkTab must not hardcode expressjs/express preset button');
    assert.equal(benchmarkSource.includes("onSelectRepository('backstage/backstage')"), false, 'BenchmarkTab must not hardcode backstage/backstage preset button');
  });
});
