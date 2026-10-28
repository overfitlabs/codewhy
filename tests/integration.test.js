import 'dotenv/config';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateNeo4jConfig,
  checkNeo4jHealth,
  runQuery,
  closeDriver
} from '../server/db/neo4j.js';
import { ensureGraphSchema } from '../server/memory/schema.js';
import {
  buildProjectMemoryGraphPayload,
  persistProjectMemoryPayload
} from '../server/memory/ingestion.js';
import {
  recordProjectMemoryEntry,
  retrieveGraphContextForQuestion,
  formatGraphEvidenceMarkdown,
  getRepositoryMemoryOverview
} from '../server/memory/retrieval.js';
import { aiProvider } from '../server/ai/provider.js';

const configStatus = validateNeo4jConfig();
const TEST_REPO = 'devlens-test/integration-memory-spec';

const INTEGRATION_ANALYSIS = {
  repository: {
    owner: 'devlens-test',
    repo: 'integration-memory-spec',
    fullName: TEST_REPO,
    branch: 'main',
    description: 'Integration test repository for Neo4j Project Memory',
    primaryLanguage: 'JavaScript',
    license: 'MIT',
    url: 'https://github.com/devlens-test/integration-memory-spec'
  },
  projectType: 'Fullstack Web Application',
  architecture: {
    pattern: 'Client-Server Architecture',
    entryPoints: [{ path: 'server/index.js', type: 'Server Entry', language: 'Node.js', size: 320 }]
  },
  structure: {
    classifiedDirectories: [
      { path: '/server', name: 'server', role: 'Backend Server', category: 'backend', description: 'API server' },
      { path: '/services', name: 'services', role: 'Service Layer', category: 'domain', description: 'Domain services' }
    ]
  },
  aiContextReady: {
    filePaths: ['server/index.js', 'services/rateLimiter.js']
  }
};

describe('Neo4j Live Integration Suite (Phase 2 - Phase 6)', { skip: !configStatus.valid }, () => {
  after(async () => {
    try {
      await runQuery(
        `MATCH (n) WHERE n.repoFullName = $repo OR (n:Repository AND n.id = $repo) DETACH DELETE n`,
        { repo: TEST_REPO }
      );
    } finally {
      await closeDriver();
    }
  });

  it('connects to the configured Neo4j instance and verifies schema constraints', async () => {
    const health = await checkNeo4jHealth();
    assert.equal(health.connected, true, `Expected Neo4j to connect, got status=${health.status}`);

    const schemaRes = await ensureGraphSchema({ force: true });
    assert.equal(schemaRes.initialized, true);
  });

  it('ingests repository, components, files, symbols, and commits idempotently in Neo4j', async () => {
    const sourceContents = {
      'services/rateLimiter.js': [
        "export function checkQuota(remaining) {",
        "  return remaining > 0;",
        "}",
        "export function enforceRateLimit(headers) {",
        "  return checkQuota(Number(headers['x-ratelimit-remaining'] || 0));",
        "}"
      ].join('\n'),
      'server/index.js': [
        "import { enforceRateLimit } from '../services/rateLimiter.js';",
        "export function startApp(req) {",
        "  return enforceRateLimit(req.headers);",
        "}"
      ].join('\n')
    };

    const commits = [
      {
        sha: 'abcdef1234567890',
        shortSha: 'abcdef1',
        message: 'Harden GitHub rate limit quota check',
        author: 'shubham',
        date: '2026-10-11T04:00:00Z',
        files: [
          {
            path: 'services/rateLimiter.js',
            status: 'modified',
            additions: 4,
            deletions: 1,
            changedRanges: [{ startLine: 4, endLine: 6 }]
          }
        ]
      }
    ];

    const payload = buildProjectMemoryGraphPayload(INTEGRATION_ANALYSIS, {
      sourceContents,
      commits
    });

    const firstIngest = await persistProjectMemoryPayload(payload);
    assert.equal(firstIngest.ingested, true);

    const countQuery = `
      MATCH (n) WHERE n.repoFullName = $repo
      RETURN count(n) AS totalNodes
    `;
    const firstCountRes = await runQuery(countQuery, { repo: TEST_REPO }, { accessMode: 'READ' });
    const firstNodeCount = firstCountRes.records[0].totalNodes;
    assert.ok(firstNodeCount >= 7);

    // Re-ingest exact same payload and verify node count is unchanged (idempotency)
    const secondIngest = await persistProjectMemoryPayload(payload);
    assert.equal(secondIngest.ingested, true);

    const secondCountRes = await runQuery(countQuery, { repo: TEST_REPO }, { accessMode: 'READ' });
    const secondNodeCount = secondCountRes.records[0].totalNodes;
    assert.equal(secondNodeCount, firstNodeCount, 'Re-ingestion must be strictly idempotent');
  });

  it('records a bug, fix, commit, and technical decision and retrieves them for a debugging query', async () => {
    const rec = await recordProjectMemoryEntry({
      type: 'bug_fix',
      repoFullName: TEST_REPO,
      bugTitle: 'Rate limit header parsed as NaN when missing',
      bugDescription: 'enforceRateLimit failed when x-ratelimit-remaining header was undefined',
      severity: 'high',
      symptoms: 'Unexpected 429 error on unauthenticated requests',
      componentPath: 'services',
      filePath: 'services/rateLimiter.js',
      fixSummary: 'Default missing x-ratelimit-remaining header to 0 before Number conversion',
      commitSha: 'abcdef1234567890',
      decisionTitle: 'Use single-shot Git Trees API to avoid rate limit exhaustion',
      decisionRationale: 'Fetching recursive tree in 1 API call prevents hitting the 60 req/hr limit.'
    });

    assert.equal(rec.recorded, true);
    assert.ok(rec.bugId.includes('rate-limit-header-parsed-as-nan'));

    const retrieved = await retrieveGraphContextForQuestion(
      TEST_REPO,
      'Why did enforceRateLimit fail with 429 rate limit errors in services/rateLimiter.js?'
    );

    assert.equal(retrieved.available, true);
    assert.equal(retrieved.hasEvidence, true);
    assert.ok(retrieved.bugsAndFixes.length >= 1);
    assert.equal(retrieved.bugsAndFixes[0].title, 'Rate limit header parsed as NaN when missing');
    assert.ok(retrieved.decisions.some(d => d.title.includes('single-shot Git Trees API')));
    assert.ok(retrieved.componentDependencies.some(
      dep => dep.sourceComponent === 'server' && dep.targetComponent === 'services'
    ));
    assert.ok(retrieved.symbols.some(s => s.name === 'enforceRateLimit'));

    const markdown = formatGraphEvidenceMarkdown(retrieved);
    assert.ok(markdown.includes('Rate limit header parsed as NaN when missing'));
    assert.ok(markdown.includes('enforceRateLimit'));
  });

  it('executes Flagship Demo ("The bug that came back"): records auth bug/fix + decision, verifies Graph Explorer overview, and grounds Gemini investigation', async () => {
    // 1. Ingest authentication component & symbol into the repository graph
    const authPayload = buildProjectMemoryGraphPayload(
      {
        ...INTEGRATION_ANALYSIS,
        aiContextReady: {
          filePaths: ['server/index.js', 'services/rateLimiter.js', 'services/auth.js']
        }
      },
      {
        sourceContents: {
          'services/auth.js': [
            "export function verifyAuthToken(token, nowMs = Date.now()) {",
            "  if (!token || !token.exp) throw new Error('401 Unauthorized: missing exp');",
            "  return (token.exp * 1000) + 30000 > nowMs;",
            "}"
          ].join('\n'),
          'server/index.js': [
            "import { verifyAuthToken } from '../services/auth.js';",
            "export function authenticateRequest(req) {",
            "  return verifyAuthToken(req.token);",
            "}"
          ].join('\n')
        },
        commits: [
          {
            sha: '9f8e7d6c5b4a3210',
            shortSha: '9f8e7d6',
            message: 'Add 30s clock skew tolerance to verifyAuthToken',
            author: 'shubham',
            date: '2026-10-11T06:00:00Z',
            files: [
              {
                path: 'services/auth.js',
                status: 'modified',
                additions: 2,
                deletions: 1,
                changedRanges: [{ startLine: 1, endLine: 4 }]
              }
            ]
          }
        ]
      }
    );
    await persistProjectMemoryPayload(authPayload);

    // 2. Record previous authentication bug and its fix
    const bugFixRec = await recordProjectMemoryEntry({
      type: 'bug_fix',
      repoFullName: TEST_REPO,
      bugTitle: 'Authentication API 401 error on valid tokens due to clock skew',
      bugDescription: 'verifyAuthToken rejected newly issued JWT tokens when API gateway clock drifted by 5-15 seconds',
      severity: 'high',
      symptoms: 'Intermittent 401 Unauthorized responses on /api/auth endpoints',
      componentPath: 'services',
      filePath: 'services/auth.js',
      fixSummary: 'Added 30-second clock skew grace window in verifyAuthToken (services/auth.js)',
      commitSha: '9f8e7d6c5b4a3210'
    });
    assert.equal(bugFixRec.recorded, true);

    // 3. Record standalone technical decision affecting the authentication component
    const decisionRec = await recordProjectMemoryEntry({
      type: 'decision',
      repoFullName: TEST_REPO,
      decisionTitle: 'Enforce strict stateless JWT exp claim validation in services/auth.js',
      decisionRationale: 'Stateless JWT validation avoids database lookups per request, requiring callers to supply numeric Unix epoch seconds in token.exp.',
      componentPath: 'services',
      filePath: 'services/auth.js',
      commitSha: '9f8e7d6c5b4a3210'
    });
    assert.equal(decisionRec.recorded, true);

    // 4. Verify stored items appear in Project Memory Overview & Interactive Graph Explorer
    const overview = await getRepositoryMemoryOverview(TEST_REPO);
    assert.equal(overview.available, true);
    assert.equal(overview.status, 'connected');
    assert.ok(overview.counts.bugs >= 2);
    assert.ok(overview.counts.fixes >= 2);
    assert.ok(overview.counts.decisions >= 2);
    assert.ok(overview.counts.symbols >= 4);
    assert.ok(overview.counts.relationships >= 8);
    assert.ok(overview.bugsAndFixes.some(b => b.title.includes('Authentication API 401 error')));
    assert.ok(overview.decisions.some(d => d.title.includes('Enforce strict stateless JWT')));
    assert.ok(overview.graph.nodes.some(n => n.label === 'Bug' && n.title.includes('Authentication API 401')));
    assert.ok(overview.graph.nodes.some(n => n.label === 'TechnicalDecision' && n.title.includes('Enforce strict stateless JWT')));

    // 5. Ask the flagship investigation question
    const flagshipQuestion = 'Could the current authentication API error be related to the previous fix? What should I investigate?';
    const graphContext = await retrieveGraphContextForQuestion(TEST_REPO, flagshipQuestion);
    assert.equal(graphContext.available, true);
    assert.equal(graphContext.hasEvidence, true);
    assert.ok(graphContext.bugsAndFixes.some(b => b.title.includes('Authentication API 401 error')));
    assert.ok(graphContext.decisions.some(d => d.title.includes('Enforce strict stateless JWT')));

    if (process.env.GEMINI_API_KEY) {
      const geminiAnswer = await aiProvider.answerQuestion(
        flagshipQuestion,
        {
          ...INTEGRATION_ANALYSIS,
          aiContextReady: {
            hasReadme: true,
            manifestFiles: ['package.json'],
            filePaths: ['server/index.js', 'services/rateLimiter.js', 'services/auth.js'],
            sampleReadmeExcerpt: '# Integration Spec'
          }
        },
        { graphContext }
      );

      assert.equal(geminiAnswer.available, true, `Expected Gemini response, got error: ${geminiAnswer.error}`);
      assert.equal(geminiAnswer.graphMemory.used, true);
      assert.ok(geminiAnswer.answer.includes('Confirmed Facts'));
      assert.ok(
        geminiAnswer.answer.includes('services/auth.js') || geminiAnswer.answer.includes('verifyAuthToken'),
        'Gemini answer should reference retrieved file or symbol provenance'
      );
    }

    // 6. Re-fetch overview (simulating browser refresh/reopen) and confirm persistence in Neo4j
    const reloadedOverview = await getRepositoryMemoryOverview(TEST_REPO);
    assert.equal(reloadedOverview.available, true);
    assert.equal(reloadedOverview.counts.bugs, overview.counts.bugs);
    assert.equal(reloadedOverview.counts.decisions, overview.counts.decisions);
  });
});
