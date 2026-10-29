/**
 * CodeWhy Phase 9: General-Purpose GitHub Repository Indexing Test Suite
 * 
 * Verifies end-to-end arbitrary repository indexing with deterministic mocked GitHub API data:
 * 1. URL normalization (owner/repo, https, ssh, branch URLs, .git suffix)
 * 2. Arbitrary-repository indexing with mocked GitHub API responses
 * 3. Bounded pagination and limit enforcement
 * 4. Evidence normalization and authentic graph link construction without fabrication
 * 5. Strict multi-repository graph isolation
 * 6. Idempotent re-indexing without entity duplication
 * 7. Transparent storage durability reporting (Neo4j vs in-memory fallback)
 * 8. Rate-limit and partial-failure handling
 * 9. Status and progress endpoint contracts
 * 10. Evidence-grounded rationale answering with claim-level verified citations for newly indexed repo
 * 11. Honest epistemic abstention when query requests unrecorded evidence
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  normalizeGitHubRepo, 
  indexRepository, 
  getIndexingStatus, 
  fetchLiveRepositoryEvidence,
  linkEvidenceGraph 
} from '../server/codewhy/services/indexer.js';
import { inMemoryGraph, retrieveEntityProvenance } from '../server/codewhy/graph/adapter.js';
import { synthesizeWhyAnswer } from '../server/codewhy/services/synthesizer.js';
import { validateWhyAnswer } from '../server/codewhy/evidence/schemas.js';

describe('CodeWhy Phase 9: General-Purpose Repository Indexing Suite', () => {

  // 1. Repository URL Normalization
  it('1. Normalizes varied GitHub repository input formats correctly', () => {
    const cases = [
      { input: 'colinhacks/zod', expected: 'colinhacks/zod' },
      { input: 'https://github.com/facebook/jest', expected: 'facebook/jest' },
      { input: 'https://github.com/expressjs/express.git', expected: 'expressjs/express' },
      { input: 'http://github.com/backstage/backstage/', expected: 'backstage/backstage' },
      { input: 'https://github.com/facebook/react/tree/main', expected: 'facebook/react', branch: 'main' },
      { input: 'git@github.com:vercel/next.js.git', expected: 'vercel/next.js' }
    ];

    for (const c of cases) {
      const res = normalizeGitHubRepo(c.input);
      assert.equal(res.fullName, c.expected);
      if (c.branch) {
        assert.equal(res.branch, c.branch);
      }
    }

    // Rejects invalid formats
    assert.throws(() => normalizeGitHubRepo('invalid-no-slash'), /Expected "owner\/repo"/i);
    assert.throws(() => normalizeGitHubRepo(''), /non-empty string/i);
    assert.throws(() => normalizeGitHubRepo(null), /non-empty string/i);
    assert.throws(() => normalizeGitHubRepo('bad/repo/extra/path'), /Invalid repository format/i);
  });

  // 2. Deterministic Mocked GitHub API Ingestion
  it('2. Indexes arbitrary repository evidence with bounded pagination', async () => {
    const mockRepoMeta = {
      owner: 'acme-corp',
      name: 'router-engine',
      fullName: 'acme-corp/router-engine',
      defaultBranch: 'main'
    };

    // Deterministic mock fetch function
    const mockFetch = async (url) => {
      const u = String(url);

      if (u.includes('/repos/acme-corp/router-engine/commits')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => '4900' },
          json: async () => [
            {
              sha: 'abc1234567890abcdef1234567890abcdef12345',
              commit: {
                message: 'feat: add async streaming pipeline to eliminate memory buffering (closes #42)',
                author: { name: 'Alice Dev', date: '2026-03-15T10:00:00Z' }
              },
              files: [{ filename: 'src/router.js' }]
            },
            {
              sha: 'def78901234567890abcdef1234567890abcdef1',
              commit: {
                message: 'refactor: isolate middleware stack into modular handler functions',
                author: { name: 'Bob Arch', date: '2026-03-10T14:30:00Z' }
              },
              files: [{ filename: 'src/middleware.js' }]
            }
          ]
        };
      }

      if (u.includes('/repos/acme-corp/router-engine/pulls')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => '4899' },
          json: async () => [
            {
              number: 55,
              title: 'Streaming response migration',
              body: 'This PR migrates from monolithic buffer accumulation to Node.js stream piping to resolve memory pressure issues. Resolves #42.',
              user: { login: 'alicedev' },
              created_at: '2026-03-14T08:00:00Z',
              merged_at: '2026-03-15T09:55:00Z',
              html_url: 'https://github.com/acme-corp/router-engine/pull/55'
            }
          ]
        };
      }

      if (u.includes('/repos/acme-corp/router-engine/issues')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => '4898' },
          json: async () => [
            {
              number: 42,
              title: 'High heap allocation on 50MB request payloads',
              body: 'Payloads above 50MB cause heap fragmentation in buffer concatenation. Maintainers agreed to stream chunk processing.',
              user: { login: 'opslead' },
              created_at: '2026-03-01T12:00:00Z',
              closed_at: '2026-03-15T10:00:00Z',
              html_url: 'https://github.com/acme-corp/router-engine/issues/42'
            }
          ]
        };
      }

      if (u.includes('/contents/docs/adr') || u.includes('/contents/docs/architecture-decisions')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => '4897' },
          json: async () => [
            {
              name: 'adr-001-streaming-pipeline.md',
              path: 'docs/adr/adr-001-streaming-pipeline.md',
              type: 'file'
            }
          ]
        };
      }

      if (u.includes('adr-001-streaming-pipeline.md')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => '# ADR 001: Streamed Payload Processing\n\n## Context\n\nBuffering large payloads caused heap OOM under concurrent load.\n\n## Decision\n\nAdopt async stream processing throughout router core.'
        };
      }

      if (u.includes('package.json')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => JSON.stringify({ name: 'router-engine', version: '2.0.0', dependencies: {} }, null, 2)
        };
      }

      if (u.includes('/git/trees')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => '4896' },
          json: async () => ({
            sha: 'treesha123',
            tree: [
              { path: 'src/router.js', type: 'blob', size: 1240, sha: 'fsha1' },
              { path: 'src/middleware.js', type: 'blob', size: 850, sha: 'fsha2' },
              { path: 'docs/guide.md', type: 'blob', size: 2100, sha: 'fsha3' },
              { path: 'package-lock.json', type: 'blob', size: 4000, sha: 'fsha4' },
              { path: 'assets/logo.png', type: 'blob', size: 5000, sha: 'fsha5' }
            ]
          })
        };
      }

      if (u.includes('/repos/acme-corp/router-engine')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => '4900' },
          json: async () => ({
            html_url: 'https://github.com/acme-corp/router-engine',
            default_branch: 'main',
            description: 'Acme high-performance streaming router engine'
          })
        };
      }

      return { ok: false, status: 404, headers: { get: () => null } };
    };

    const slice = await fetchLiveRepositoryEvidence(mockRepoMeta, {
      commitLimit: 10,
      prLimit: 5,
      issueLimit: 5,
      fetchFn: mockFetch
    });

    assert.equal(slice.repository.id, 'acme-corp/router-engine');
    assert.equal(slice.sourceMode, 'live_github');
    assert.equal(slice.commits.length, 2);
    assert.equal(slice.pullRequests.length, 1);
    assert.equal(slice.issues.length, 1);
    assert.equal(slice.adrs.length, 1);
    assert.equal(slice.manifestArtifacts.length, 1);

    // Bounded category accounting
    assert.equal(slice.categories.commits.indexed, true);
    assert.equal(slice.categories.commits.count, 2);
    assert.equal(slice.categories.pullRequests.indexed, true);
    assert.equal(slice.categories.issues.indexed, true);
    assert.equal(slice.categories.adrs.indexed, true);
    assert.equal(slice.files.length, 3, 'Filters out lockfile and binary png');
    assert.equal(slice.categories.files.indexed, true);
    assert.equal(slice.categories.files.count, 3);
  });

  // 3. Authentic Graph Relationships Without Fabrication
  it('3. Builds evidence-backed graph relationships only when explicitly referenced', () => {
    const sliceData = {
      repository: { id: 'acme-corp/router-engine' },
      commits: [
        {
          id: 'acme-corp/router-engine:commit:abc1234',
          sha: 'abc1234',
          message: 'feat: add async streaming pipeline (closes #42) merge pull request #55'
        },
        {
          id: 'acme-corp/router-engine:commit:def5678',
          sha: 'def5678',
          message: 'chore: update documentation without any issue links'
        }
      ],
      pullRequests: [
        {
          id: 'acme-corp/router-engine:pull:55',
          number: 55,
          body: 'Implements streaming. Resolves #42.'
        }
      ],
      issues: [
        {
          id: 'acme-corp/router-engine:issue:42',
          number: 42
        }
      ],
      adrs: [
        {
          id: 'acme-corp/router-engine:adr:adr-002',
          verbatimExcerpt: 'This decision supersedes adr-001.'
        },
        {
          id: 'acme-corp/router-engine:adr:adr-001',
          verbatimExcerpt: 'Initial architecture.'
        }
      ]
    };

    const links = linkEvidenceGraph(sliceData);

    // Commit abc1234 references issue 42 -> RESOLVES
    const resolvesLink = links.find(l => l.type === 'RESOLVES');
    assert.ok(resolvesLink, 'RESOLVES link must exist for closes #42');
    assert.equal(resolvesLink.target, 'acme-corp/router-engine:issue:42');

    // Commit abc1234 references PR 55 -> MERGES_PR
    const mergesPrLink = links.find(l => l.type === 'MERGES_PR');
    assert.ok(mergesPrLink, 'MERGES_PR link must exist for merge pull request #55');

    // PR 55 references issue 42 -> CLOSES_ISSUE
    const closesIssueLink = links.find(l => l.type === 'CLOSES_ISSUE');
    assert.ok(closesIssueLink, 'CLOSES_ISSUE link must exist for PR resolves #42');

    // ADR-002 references adr-001 -> SUPERSEDES
    const supersedesLink = links.find(l => l.type === 'SUPERSEDES');
    assert.ok(supersedesLink, 'SUPERSEDES link must exist for supersedes adr-001');

    // Commit def5678 has NO references -> must NOT create any fabricated links
    const fabricatedLink = links.find(l => l.source === 'acme-corp/router-engine:commit:def5678');
    assert.equal(fabricatedLink, undefined, 'Must never fabricate links for commits without references');
  });

  // 4. Strict Multi-Repository Graph Isolation
  it('4. Enforces strict multi-repository graph isolation between distinct repositories', async () => {
    // Repository Alpha
    inMemoryGraph.addNode('Repository', 'org-alpha/repo-alpha', { name: 'repo-alpha' });
    inMemoryGraph.addNode('Commit', 'org-alpha/repo-alpha:commit:111aaa', {
      id: 'org-alpha/repo-alpha:commit:111aaa',
      repository: 'org-alpha/repo-alpha',
      sha: '111aaa',
      message: 'Alpha feature commit',
      date: '2026-01-01T00:00:00Z',
      url: 'https://github.com/org-alpha/repo-alpha/commit/111aaa'
    });

    // Repository Beta
    inMemoryGraph.addNode('Repository', 'org-beta/repo-beta', { name: 'repo-beta' });
    inMemoryGraph.addNode('Commit', 'org-beta/repo-beta:commit:222bbb', {
      id: 'org-beta/repo-beta:commit:222bbb',
      repository: 'org-beta/repo-beta',
      sha: '222bbb',
      message: 'Beta feature commit',
      date: '2026-02-01T00:00:00Z',
      url: 'https://github.com/org-beta/repo-beta/commit/222bbb'
    });

    const provAlpha = await retrieveEntityProvenance({
      repository: 'org-alpha/repo-alpha',
      filePath: 'src/index.js'
    });

    const provBeta = await retrieveEntityProvenance({
      repository: 'org-beta/repo-beta',
      filePath: 'src/index.js'
    });

    // Alpha must contain 111aaa and NEVER 222bbb
    assert.ok(provAlpha.commits.some(c => c.id.includes('111aaa')));
    assert.ok(!provAlpha.commits.some(c => c.id.includes('222bbb')), 'Org-Beta commit must not leak into Org-Alpha');

    // Beta must contain 222bbb and NEVER 111aaa
    assert.ok(provBeta.commits.some(c => c.id.includes('222bbb')));
    assert.ok(!provBeta.commits.some(c => c.id.includes('111aaa')), 'Org-Alpha commit must not leak into Org-Beta');
  });

  // 5. Idempotent Re-indexing
  it('5. Re-indexing a repository is idempotent and does not duplicate nodes or edges', async () => {
    const mockRepoMeta = {
      owner: 'idempotent-org',
      name: 'unique-service',
      fullName: 'idempotent-org/unique-service',
      defaultBranch: 'main'
    };

    const mockFetch = async (url) => {
      const u = String(url);
      if (u.includes('/commits')) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => '5000' },
          json: async () => [{
            sha: 'cccc111122223333444455556666777788889999',
            commit: { message: 'feat: unique idempotent commit', author: { name: 'Dev', date: '2026-01-01T00:00:00Z' } }
          }]
        };
      }
      if (u.includes('/pulls')) {
        return { ok: true, status: 200, headers: { get: () => '5000' }, json: async () => [] };
      }
      if (u.includes('/issues')) {
        return { ok: true, status: 200, headers: { get: () => '5000' }, json: async () => [] };
      }
      if (u.includes('/contents/docs')) {
        return { ok: false, status: 404, headers: { get: () => null } };
      }
      if (u.includes('package.json')) {
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => '{"name":"unique"}' };
      }
      return { ok: true, status: 200, headers: { get: () => '5000' }, json: async () => ({ default_branch: 'main' }) };
    };

    // Index run 1
    const run1 = await indexRepository('idempotent-org/unique-service', { fetchFn: mockFetch, forceInMemory: true });
    assert.equal(run1.success, true);
    const nodeCountAfterRun1 = inMemoryGraph.nodes.size;
    const edgeCountAfterRun1 = inMemoryGraph.edges.length;

    // Index run 2 (forced re-index)
    const run2 = await indexRepository('idempotent-org/unique-service', { fetchFn: mockFetch, forceReindex: true, forceInMemory: true });
    assert.equal(run2.success, true);
    const nodeCountAfterRun2 = inMemoryGraph.nodes.size;
    const edgeCountAfterRun2 = inMemoryGraph.edges.length;

    // Node and edge counts must remain exactly identical
    assert.equal(nodeCountAfterRun2, nodeCountAfterRun1, 'Node count must not increase on idempotent re-indexing');
    assert.equal(edgeCountAfterRun2, edgeCountAfterRun1, 'Edge count must not increase on idempotent re-indexing');
  });

  // 6. Transparent Durability Reporting
  it('6. Correctly identifies and labels in-memory fallback vs Neo4j durability', async () => {
    const status = getIndexingStatus('idempotent-org/unique-service');
    assert.ok(status, 'Status record must be registered');
    assert.equal(typeof status.isDurable, 'boolean');
    assert.ok(status.storageMode.includes('in_memory') || status.storageMode.includes('neo4j'));
    assert.ok(status.storageLabel.length > 0);

    if (!status.isDurable) {
      assert.ok(status.storageLabel.includes('In-Memory') || status.storageLabel.includes('Non-durable'));
    }
  });

  // 7. Rate-Limit and Inaccessible Repository Handling
  it('7. Handles rate-limit errors and private/missing repositories gracefully', async () => {
    // 404 Not Found (private or nonexistent)
    const mock404Fetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => null }
    });

    const res404 = await indexRepository('private-org/secret-repo', { fetchFn: mock404Fetch });
    assert.equal(res404.success, false);
    assert.equal(res404.status, 'FAILED');
    assert.ok(res404.error.includes('not found or is private'));

    // 429 Rate Limit
    const mock429Fetch = async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: { get: () => '0' }
    });

    const res429 = await indexRepository('popular-org/heavy-repo', { fetchFn: mock429Fetch });
    assert.equal(res429.success, false);
    assert.equal(res429.status, 'FAILED');
    assert.ok(res429.error.includes('rate limit exceeded'));
  });

  // 8. Grounded Rationale Retrieval with Claim-Level Verified Citations
  it('8. Answers why question with authentic claim-level citations for newly indexed repository', async () => {
    const repo = 'acme-corp/router-engine';
    const commitId = `${repo}:commit:abc1234567890abcdef1234567890abcdef12345`;
    const commitExcerpt = 'add async streaming pipeline to eliminate memory buffering and avoid heap allocation bottlenecks (closes #42)';

    inMemoryGraph.addNode('Repository', repo, { sourceMode: 'live_github' });
    inMemoryGraph.addNode('Commit', commitId, {
      id: commitId,
      repository: repo,
      sha: 'abc1234567890abcdef1234567890abcdef12345',
      message: commitExcerpt,
      author: 'Alice Dev',
      date: '2026-03-15T10:00:00Z',
      url: 'https://github.com/acme-corp/router-engine/commit/abc1234567890abcdef1234567890abcdef12345',
      files: ['src/router.js']
    });

    const provenance = await retrieveEntityProvenance({
      repository: repo,
      filePath: 'src/router.js',
      symbol: 'StreamingRouter'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'Why did router-engine adopt an async streaming pipeline instead of buffering?',
      provenance
    });

    // Validated response
    assert.equal(answer.status, 'ANSWERED');
    assert.equal(answer.confidence, 'HIGH');
    assert.ok(answer.citations.length > 0);
    assert.ok(answer.verifiedFacts.length > 0);

    // Citations are authentic GitHub permalinks
    assert.ok(answer.citations[0].url.startsWith('https://github.com/acme-corp/router-engine'));
    assert.ok(answer.citations[0].verbatimExcerpt.includes('async streaming'));

    // Claim-level support confirmed
    assert.equal(answer.epistemicValidation.valid, true);
    assert.equal(answer.epistemicValidation.claimSupportConfirmed, true);
    assert.equal(answer.epistemicValidation.errors.length, 0);
  });

  // 9. Honest Epistemic Abstention on Unrecorded Evidence
  it('9. Honestly abstains when query asks for unrecorded evidence or benchmarks in indexed repository', async () => {
    const repo = 'acme-corp/router-engine';
    const provenance = await retrieveEntityProvenance({
      repository: repo,
      filePath: 'src/router.js'
    });

    // Query asks for unrecorded throughput benchmarks
    const answer = await synthesizeWhyAnswer({
      question: 'What formal throughput or latency benchmarks were recorded for the router rewrite?',
      provenance
    });

    assert.equal(answer.status, 'ABSTAIN');
    assert.equal(answer.confidence, 'ABSTAIN');
    assert.ok(answer.abstentionReason.includes('Insufficient documentary evidence') || answer.abstentionReason.includes('benchmark'));
    assert.ok(answer.missingInformation.length > 0);
    assert.equal(answer.verifiedFacts.length, 0);
    assert.equal(answer.epistemicValidation.claimSupportConfirmed, false);
    assert.equal(answer.epistemicValidation.valid, true);
  });

});
