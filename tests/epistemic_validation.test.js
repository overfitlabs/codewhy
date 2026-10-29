import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateClaimSupport, validateWhyAnswer } from '../server/codewhy/evidence/schemas.js';
import { synthesizeWhyAnswer } from '../server/codewhy/services/synthesizer.js';
import { inMemoryGraph, retrieveEntityProvenance } from '../server/codewhy/graph/adapter.js';

describe('Priority 3: Deterministic Claim-Support & Epistemic Validation Suite', () => {

  // 1. A manifest-supported implementation fact
  it('1. Validates that a package manifest can verify implementation facts but cannot establish causal why rationale', () => {
    const manifestRecord = {
      id: 'chalk/chalk:manifest:package.json',
      type: 'manifest',
      url: 'https://github.com/chalk/chalk/blob/main/package.json',
      title: 'package.json manifest',
      author: 'Maintainers',
      timestamp: '2026-01-01T00:00:00Z',
      verbatimExcerpt: '{\n  "name": "chalk",\n  "type": "module",\n  "scripts": {\n    "test": "xo && c8 node --test"\n  }\n}'
    };

    // A: Factual configuration statement is validated as supported
    const factualStatement = 'Package manifest (package.json manifest) defines repository configuration: scripts test is "xo && c8 node --test" and type is module.';
    const factSupported = validateClaimSupport(factualStatement, manifestRecord);
    assert.equal(factSupported, true, 'Manifest must validate factual configuration statements');

    // B: Causal rationale statement ("why maintainers chose...") cannot be supported by manifest alone
    const causalWhyStatement = 'Maintainers decided to switch to xo and c8 because node test runner had higher performance throughput.';
    const causalSupported = validateClaimSupport(causalWhyStatement, manifestRecord);
    assert.equal(causalSupported, false, 'Manifest alone must NOT validate causal design rationale ("why") claims');
  });

  // 2. A historical rationale supported by an explicit issue or PR
  it('2. Validates historical rationale when supported by an explicit PR discussion with maintainer consensus', async () => {
    const repo = 'test-org/event-stream';
    const prRecord = {
      id: `${repo}:pull:104`,
      type: 'pull_request',
      url: `https://github.com/${repo}/pull/104`,
      title: 'PR #104: Migrate to Web Streams standard',
      author: 'lead-dev',
      createdAt: '2026-02-10T12:00:00Z',
      verbatimExcerpt: 'Migrate to standard Web Streams API because Node.js 18+ provides native support, eliminating our custom streampolyfill dependency and reducing bundle size.'
    };

    inMemoryGraph.addNode('Repository', repo, { sourceMode: 'live_github' });
    inMemoryGraph.addNode('PullRequest', prRecord.id, {
      ...prRecord,
      repository: repo
    });

    const provenance = await retrieveEntityProvenance({
      repository: repo,
      filePath: 'src/stream.js',
      symbol: 'createStream'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'Why did event-stream migrate to Web Streams standard?',
      provenance
    });

    assert.equal(answer.status, 'ANSWERED');
    assert.equal(answer.confidence, 'HIGH');
    assert.ok(answer.citations.length > 0);
    assert.equal(answer.citations[0].id, prRecord.id);
    assert.equal(answer.epistemicValidation.valid, true);
    assert.equal(answer.epistemicValidation.claimSupportConfirmed, true);
  });

  // 3. A keyword-related source that does not support the claim
  it('3. Rejects keyword-related records that lack substantive causal rationale', () => {
    // Incident report / stack trace issue mentioning package.json and dependencies, but containing no design rationale
    const incidentalIssueRecord = {
      id: 'chalk/chalk:issue:690',
      type: 'issue',
      url: 'https://github.com/chalk/chalk/issues/690',
      title: 'Issue #690: Cannot find module in node_modules/package.json',
      author: 'bug-reporter',
      timestamp: '2025-05-12T14:30:00Z',
      verbatimExcerpt: 'Error: Cannot find module ./node_modules/package.json while running scripts in test environment. Reproducible on Node 20.'
    };

    // Statement asserting causal rationale for scripts
    const claimStatement = 'Maintainers chose xo and c8 for unit tests because Issue #690 reported test environment script errors.';
    const supported = validateClaimSupport(claimStatement, incidentalIssueRecord);
    assert.equal(supported, false, 'Incidental keyword matches must NOT pass claim-support validation for rationale claims');
  });

  // 4. A question with a false premise
  it('4. Detects contradicted premises from evidence and honestly declines to speculate', async () => {
    const provenance = await retrieveEntityProvenance({
      repository: 'expressjs/express',
      filePath: 'package.json',
      symbol: 'scripts.test'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'Why did Express switch from Mocha to Jest for its unit tests in Express 4.16.0?',
      provenance
    });

    assert.equal(answer.status, 'PREMISE_CONTRADICTED');
    assert.equal(answer.confidence, 'ABSTAIN');
    assert.ok(answer.shortAnswer.includes('Mocha'));
    assert.ok(answer.shortAnswer.toLowerCase().includes('jest') || answer.shortAnswer.toLowerCase().includes('not switch') || answer.shortAnswer.toLowerCase().includes('declines'));
    assert.ok(answer.abstentionReason.includes('Contradicted premise'));
    assert.equal(answer.epistemicValidation.valid, true);
  });

  // 5. A question for which no documentary rationale is available
  it('5. Honestly abstains when no documentary rationale exists for an architectural question', async () => {
    const repo = 'clean-org/micro-cache';
    inMemoryGraph.addNode('Repository', repo, { sourceMode: 'live_github' });
    inMemoryGraph.addNode('Commit', `${repo}:commit:111`, {
      id: `${repo}:commit:111`,
      repository: repo,
      sha: '111222333',
      message: 'Initial project setup and directory layout',
      author: 'Author',
      date: '2026-01-01T00:00:00Z'
    });

    const provenance = await retrieveEntityProvenance({
      repository: repo,
      filePath: 'src/cache.js',
      symbol: 'LRUCache'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'What formal memory benchmarks motivated micro-cache to adopt LRU eviction over LFU?',
      provenance
    });

    assert.equal(answer.status, 'ABSTAIN');
    assert.equal(answer.confidence, 'ABSTAIN');
    assert.ok(answer.abstentionReason.toLowerCase().includes('insufficient') || answer.abstentionReason.toLowerCase().includes('no supporting evidence'));
    assert.equal(answer.epistemicValidation.valid, true);
  });

  // 6. Repository isolation during retrieval and citation rendering
  it('6. Strictly isolates evidence, citations, and graph nodes between distinct repositories', async () => {
    const repoAlpha = 'acme/alpha-service';
    const repoBeta = 'acme/beta-service';

    inMemoryGraph.addNode('Repository', repoAlpha, { sourceMode: 'live_github' });
    inMemoryGraph.addNode('Repository', repoBeta, { sourceMode: 'live_github' });

    inMemoryGraph.addNode('Commit', `${repoAlpha}:commit:aaa1`, {
      id: `${repoAlpha}:commit:aaa1`,
      repository: repoAlpha,
      sha: 'aaa1',
      message: 'Alpha commit implementing rate limiting',
      author: 'Alice',
      date: '2026-01-01T00:00:00Z'
    });

    inMemoryGraph.addNode('Commit', `${repoBeta}:commit:bbb1`, {
      id: `${repoBeta}:commit:bbb1`,
      repository: repoBeta,
      sha: 'bbb1',
      message: 'Beta commit implementing Kafka streaming',
      author: 'Bob',
      date: '2026-01-02T00:00:00Z'
    });

    const provAlpha = await retrieveEntityProvenance({ repository: repoAlpha });
    const provBeta = await retrieveEntityProvenance({ repository: repoBeta });

    // Strictly isolated: Alpha must have 0 Beta commits
    assert.ok(provAlpha.commits.every(c => c.repository === repoAlpha || c.id.startsWith(repoAlpha)));
    assert.ok(!provAlpha.commits.some(c => c.id.includes(repoBeta)));

    // Strictly isolated: Beta must have 0 Alpha commits
    assert.ok(provBeta.commits.every(c => c.repository === repoBeta || c.id.startsWith(repoBeta)));
    assert.ok(!provBeta.commits.some(c => c.id.includes(repoAlpha)));

    // When answering for Alpha, citations must never leak Beta records
    const answerAlpha = await synthesizeWhyAnswer({
      question: 'Why did alpha-service implement rate limiting?',
      provenance: provAlpha
    });

    assert.ok(answerAlpha.citations.every(c => c.id.startsWith(repoAlpha)));
    assert.ok(!answerAlpha.citations.some(c => c.id.includes(repoBeta)));
  });

});
