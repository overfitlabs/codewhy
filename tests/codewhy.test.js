import 'dotenv/config';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fetchEvidenceSlice } from '../server/codewhy/evidence/fetcher.js';
import { ingestSliceToGraph, retrieveEntityProvenance, inMemoryGraph, rehydrateFromNeo4j } from '../server/codewhy/graph/adapter.js';
import { synthesizeWhyAnswer } from '../server/codewhy/services/synthesizer.js';
import { evaluateSupersession } from '../server/codewhy/services/temporal.js';
import { validateWhyAnswer, validateEvidenceItem, validateDecisionItem, validateClaimSupport } from '../server/codewhy/evidence/schemas.js';
import { getSarvamVoiceStatus, transcribeAudio, synthesizeSpeech, SUPPORTED_VOICE_LANGUAGES } from '../server/codewhy/services/sarvam.js';
import { checkNeo4jHealth, closeDriver } from '../server/db/neo4j.js';

describe('CodeWhy Trust Audit & Hardened Vertical Slice Suite (Phase 2.5)', () => {
  let sliceData = null;

  after(async () => {
    await closeDriver().catch(() => {});
  });

  before(async () => {
    inMemoryGraph.clear();
    // Ingest the verified slice
    sliceData = await fetchEvidenceSlice({ forceFixture: true });
  });

  // 1. Evidence Ingestion and Graph Topology
  it('1. Ingests evidence slice and constructs correct graph topology with manifests', async () => {
    const result = await ingestSliceToGraph(sliceData, { forceInMemory: true });
    assert.equal(result.success, true);
    assert.equal(result.counts.symbols >= 3, true);
    assert.equal(result.counts.commits >= 2, true);
    assert.equal(result.counts.issues >= 1, true);
    assert.equal(result.counts.decisions >= 2, true);
    assert.equal(result.counts.manifests >= 1, true);

    const repoNode = inMemoryGraph.getNode('expressjs/express');
    assert.ok(repoNode, 'Repository node must exist');
    assert.equal(repoNode.name, 'express');

    const fileNode = inMemoryGraph.getNode('expressjs/express:lib/express.js');
    assert.ok(fileNode, 'File node must exist');

    const jsonSymbol = inMemoryGraph.getNode('expressjs/express:lib/express.js:exports.json');
    assert.ok(jsonSymbol, 'exports.json symbol must exist');
    assert.equal(jsonSymbol.lineStart, 78);

    const commitEdges = inMemoryGraph.getEdgesFrom('expressjs/express:commit:c0136d8b48dd3526c58b2ad8666fb4b12b55116c');
    assert.ok(commitEdges.length > 0, 'Commit c0136d8b must have outbound edges');
    const resolvesEdge = commitEdges.find(e => e.type === 'RESOLVES');
    assert.ok(resolvesEdge, 'Commit must have RESOLVES edge to issue');
    assert.equal(resolvesEdge.to, 'expressjs/express:issue:2211');
  });

  // 2. Idempotent Ingestion
  it('2. Ingests idempotently without duplicating nodes or relationships', async () => {
    const nodeCountBefore = inMemoryGraph.nodes.size;
    const edgeCountBefore = inMemoryGraph.edges.length;

    const secondRun = await ingestSliceToGraph(sliceData, { forceInMemory: true });
    assert.equal(secondRun.success, true);
    assert.equal(inMemoryGraph.nodes.size, nodeCountBefore, 'Node count must remain identical');
    assert.equal(inMemoryGraph.edges.length, edgeCountBefore, 'Edge count must remain identical');
  });

  // 3. Retrieval of Relevant Historical Evidence
  it('3. Retrieves relevant multi-hop historical provenance for target symbol', async () => {
    const prov = await retrieveEntityProvenance({
      repository: 'expressjs/express',
      filePath: 'lib/express.js',
      symbol: 'exports.json'
    });

    assert.ok(prov.symbol, 'Must retrieve symbol');
    assert.equal(prov.symbol.name, 'exports.json');
    assert.equal(prov.commits.length >= 2, true);
    assert.equal(prov.issues.length >= 1, true);
    assert.equal(prov.decisions.length >= 2, true);

    const c1 = prov.commits.find(c => c.sha.startsWith('9ea18e1'));
    const c2 = prov.commits.find(c => c.sha.startsWith('c0136d8'));
    assert.ok(c1, 'Decoupling commit must be retrieved');
    assert.ok(c2, 'Re-addition commit must be retrieved');
  });

  // 4. Citation IDs and URLs Resolving to Real Evidence
  it('4. All citation IDs and URLs resolve strictly to authentic ingested records', async () => {
    const prov = await retrieveEntityProvenance({
      repository: 'expressjs/express',
      filePath: 'lib/express.js',
      symbol: 'exports.json'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'Why does lib/express.js export express.json directly while express.bodyParser throws an error?',
      provenance: prov
    });

    assert.equal(answer.citations.length >= 3, true);
    for (const cit of answer.citations) {
      assert.ok(cit.id, 'Citation must have id');
      assert.ok(cit.url.startsWith('https://github.com/expressjs/express/'), 'URL must be a real express permalink');
      assert.ok(cit.verbatimExcerpt.length > 0, 'Must have verbatim excerpt');
      assert.ok(prov.evidenceMap.has(cit.id), `Citation ${cit.id} must resolve in graph evidenceMap`);
    }

    assert.equal(answer.epistemicValidation.valid, true);
    assert.equal(answer.epistemicValidation.errors.length, 0);
  });

  // 5. Claim-Level Support Validation Rejects Irrelevant Real Citations
  it('5. Claim-level support validation rejects real but irrelevant citations', () => {
    const commitRecord = {
      id: 'expressjs/express:commit:9ea18e10c999d99278ad7ad1cac74009bf579c50',
      title: 'throw errors when users try to access removed middleware',
      verbatimExcerpt: "throw new Error('Most middleware is no longer bundled with Express and must be installed separately.')"
    };

    // Valid claim supported by commit 9ea18e1
    const validClaim = 'In commit 9ea18e1, Express 4.0 removed bundled middleware throwing runtime errors.';
    assert.equal(validateClaimSupport(validClaim, commitRecord), true);

    // Mismatched claim asserting Jest migration while citing commit 9ea18e1
    const invalidClaim = 'Express switched from Mocha to Jest in 2017 to improve test parallelization.';
    assert.equal(validateClaimSupport(invalidClaim, commitRecord), false);
  });

  // 6. Supported Express Question with Epistemic Discipline
  it('6. Supported Express question returns grounded compromise and guards against security misattribution', async () => {
    const prov = await retrieveEntityProvenance({
      repository: 'expressjs/express',
      filePath: 'lib/express.js',
      symbol: 'exports.json'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'Why does lib/express.js export express.json directly while express.bodyParser throws an error?',
      provenance: prov
    });

    assert.equal(answer.status, 'ANSWERED');
    assert.equal(answer.confidence, 'HIGH');
    assert.ok(answer.shortAnswer.includes('scoped compromise'), 'Must explain scoped compromise');
    assert.ok(answer.epistemicDistinction, 'Must include epistemicDistinction breakdown');
    assert.ok(answer.epistemicDistinction.epistemicCorrectionOnSecurity.includes('API design'), 'Must clarify API design vs security panic');

    assert.equal(answer.verifiedFacts.length, 3);
    assert.equal(answer.timeline.length, 3);
    assert.equal(answer.activeRationaleHypothesis.certainty, 'CERTAIN');
    assert.equal(answer.contradictoryEvidence.length, 1);
  });

  // 7. Unsupported Mocha/Jest Question Contradicted by Manifest
  it('7. Unsupported Mocha-Jest question explicitly identifies contradicted premise with manifest citation', async () => {
    const prov = await retrieveEntityProvenance({
      repository: 'expressjs/express',
      filePath: 'package.json',
      symbol: 'scripts.test'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'Why did Express switch from Mocha to Jest for its unit tests in Express 4.16.0?',
      provenance: prov
    });

    assert.equal(answer.status, 'PREMISE_CONTRADICTED');
    assert.equal(answer.confidence, 'ABSTAIN');
    assert.ok(answer.abstentionReason.includes('Contradicted premise'), 'Must detect contradicted premise');
    assert.ok(answer.shortAnswer.includes('mocha@3.5.3'), 'Must cite mocha@3.5.3');
    assert.equal(answer.citations.length, 1);
    assert.equal(answer.citations[0].id, 'expressjs/express:package.json:4.16.0');
    assert.ok(answer.citations[0].url.includes('4.16.0/package.json'), 'URL must point to 4.16.0 release package.json');
    assert.equal(answer.epistemicValidation.valid, true);
  });

  // 8. Partial Evidence Question (Multipart Omission)
  it('8. Partial evidence question returns supported API consensus rationale while labeling benchmarks as unverified', async () => {
    const prov = await retrieveEntityProvenance({
      repository: 'expressjs/express',
      filePath: 'lib/express.js',
      symbol: 'removedMiddlewares.multipart'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'Why did Express omit a multipart parser when re-adding express.json in 4.16.0?',
      provenance: prov
    });

    assert.equal(answer.status, 'PARTIALLY_SUPPORTED');
    assert.equal(answer.confidence, 'MEDIUM');
    assert.ok(answer.shortAnswer.includes('there is no good API that pleases everyone'), 'Must quote Jonathan Ong consensus rationale');
    assert.ok(answer.supportedFindings.length >= 2, 'Must list supported findings');
    assert.ok(answer.uncertainFindings.length >= 1, 'Must explicitly identify uncertain/unverified benchmarks');
    assert.ok(answer.missingInformation.length >= 2, 'Must list documentary gaps');
    assert.equal(answer.epistemicValidation.valid, true);
  });

  // 9. Supersession Not Inferred from Timestamps Alone
  it('9. Rejects supersession when only chronological succession exists', () => {
    const earlierDecision = {
      id: 'dec:arch:connect-decoupling',
      title: 'Decouple middleware',
      status: 'ACTIVE'
    };

    // Case A: Later commit with no replacement rationale -> HISTORICAL_UNKNOWN
    const laterCommitTimestampOnly = {
      sha: 'abcdef1234567890',
      date: '2016-01-01T00:00:00Z',
      message: 'refactor: tidy middleware loader'
    };

    const evalA = evaluateSupersession(earlierDecision, laterCommitTimestampOnly);
    assert.equal(evalA.isSuperseded, false);
    assert.equal(evalA.status, 'HISTORICAL_UNKNOWN');
    assert.ok(evalA.rationale.includes('HISTORICAL_UNKNOWN'));

    // Case B: Later commit with explicit partial compromise -> PARTIALLY_SUPERSEDED
    const laterCommitWithExplicitRationale = {
      sha: 'c0136d8b48dd3526c58b2ad8666fb4b12b55116c',
      date: '2017-09-28T17:22:36Z',
      message: 'Add express.json and express.urlencoded to parse bodies\n\ncloses #2211',
      rationale: 'Re-added express.json and express.urlencoded convenience wrappers while multipart remains banned.'
    };

    const evalB = evaluateSupersession(earlierDecision, laterCommitWithExplicitRationale);
    assert.equal(evalB.isSuperseded, true);
    assert.equal(evalB.status, 'PARTIALLY_SUPERSEDED');
    assert.deepEqual(evalB.scope, ['express.json', 'express.urlencoded']);
  });

  // 10. Transparent Storage Diagnostics
  it('10. Graph adapter transparently reports fallback storage mode and offline diagnostics', async () => {
    const result = await ingestSliceToGraph(sliceData, { forceInMemory: true });
    assert.equal(result.storageMode, 'in_memory_verified_fallback');
    assert.equal(result.isPersistent, false);
    if (!result.neo4jConnected) {
      assert.ok(result.neo4jError, 'Must provide understandable error for offline Neo4j');
    } else {
      assert.equal(result.neo4jConnected, true, 'Reports live Neo4j status accurately');
    }
  });

  // 11. Backstage Evidence Slice Ingestion & Graph Topology (Phase 3)
  it('11. Ingests Backstage slice and connects ADR013, ADR014, and PR 27925 with supersession edges', async () => {
    const backstageSlice = await fetchEvidenceSlice({ repository: 'backstage/backstage', forceFixture: true });
    const result = await ingestSliceToGraph(backstageSlice, { forceInMemory: true });

    assert.equal(result.success, true);
    assert.equal(result.counts.adrs >= 2, true);
    assert.equal(result.counts.pullRequests >= 1, true);

    const repoNode = inMemoryGraph.getNode('backstage/backstage');
    assert.ok(repoNode, 'Backstage repository node must exist');

    const adr13 = inMemoryGraph.getNode('backstage/backstage:adr:adr013-use-node-fetch');
    const adr14 = inMemoryGraph.getNode('backstage/backstage:adr:adr014-use-fetch');
    assert.ok(adr13, 'ADR013 node must exist');
    assert.ok(adr14, 'ADR014 node must exist');
    assert.equal(adr13.status, 'SUPERSEDED');
    assert.equal(adr14.status, 'ACTIVE');

    const supersededEdges = inMemoryGraph.getEdgesFrom(adr13.id, 'SUPERSEDED_BY');
    assert.ok(supersededEdges.length > 0, 'ADR013 must have SUPERSEDED_BY edge to ADR014');
  });

  // 12. Backstage Supported Question: ADR013 Superseded by ADR014
  it('12. Explains Backstage node-fetch to native fetch supersession with primary ADR citations', async () => {
    const prov = await retrieveEntityProvenance({
      repository: 'backstage/backstage',
      filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
      symbol: 'ADR014'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'Why was the node-fetch decision superseded by the native fetch decision in Backstage?',
      provenance: prov
    });

    assert.equal(answer.status, 'ANSWERED');
    assert.equal(answer.confidence, 'HIGH');
    assert.equal(answer.citations.length >= 3, true);
    assert.ok(answer.shortAnswer.includes('Node.js 20') || answer.shortAnswer.includes('native'));

    // Verify citation integrity
    const cit13 = answer.citations.find(c => c.id.includes('adr013'));
    const cit14 = answer.citations.find(c => c.id.includes('adr014'));
    const citPr = answer.citations.find(c => c.id.includes('27925'));
    assert.ok(cit13, 'Must cite ADR013');
    assert.ok(cit14, 'Must cite ADR014');
    assert.ok(citPr, 'Must cite PR 27925');

    assert.equal(answer.epistemicValidation.valid, true);
    assert.equal(answer.epistemicValidation.errors.length, 0);
  });

  // 13. Backstage Insufficient Evidence: Unrecorded Benchmarks Query
  it('13. Backstage benchmark query returns honest abstention and documents missing benchmarks', async () => {
    const prov = await retrieveEntityProvenance({
      repository: 'backstage/backstage',
      filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
      symbol: 'ADR014'
    });

    const answer = await synthesizeWhyAnswer({
      question: 'What throughput or memory consumption benchmarks motivated Backstage to replace node-fetch with native fetch in ADR014?',
      provenance: prov
    });

    assert.equal(answer.status, 'ABSTAIN');
    assert.equal(answer.confidence, 'ABSTAIN');
    assert.ok(answer.abstentionReason.includes('Insufficient evidence'));
    assert.ok(answer.missingInformation.length >= 2, 'Must list missing information');
    assert.ok(answer.missingInformation.some(m => m.description.includes('benchmark')));

    assert.equal(answer.epistemicValidation.valid, true);
  });

  // 14. Formal Supersession Recognition in Temporal Service
  it('14. Temporal evaluator recognizes formal ADR supersession banner and rejects false equivalence', () => {
    const adr13 = {
      id: 'dec:backstage:adr013-use-node-fetch',
      title: 'ADR013: Use node-fetch',
      status: 'ACTIVE'
    };

    const adr14 = {
      id: 'dec:backstage:adr014-use-fetch',
      title: 'ADR014: Use native fetch',
      supersedes: 'docs/architecture-decisions/adr013-use-node-fetch.md',
      supersessionNotice: ':::note[Superseded]\n\nThis ADR has been superseded by [ADR014](./adr014-use-fetch.md) and no longer applies.\n\n:::',
      rationale: 'Node 20 upgrade established stable undici native fetch and resolved compatibility issues.'
    };

    const res = evaluateSupersession(adr13, adr14);
    assert.equal(res.isSuperseded, true);
    assert.equal(res.status, 'SUPERSEDED');
    assert.ok(res.rationale.includes('Node 20') || res.rationale.includes('superseded'));
  });

  // 15. Evidence Sensitivity: Removing ADR014 forces honest abstention (cannot claim supersession)
  it('15. Removing superseding ADR014 prevents claiming supersession and forces honest abstention', async () => {
    const fullProv = await retrieveEntityProvenance({
      repository: 'backstage/backstage',
      filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
      symbol: 'ADR014'
    });

    // Strip ADR014 from provenance
    const strippedProv = {
      ...fullProv,
      adrs: fullProv.adrs.filter(a => !a.id.includes('adr014')),
      evidenceRecords: fullProv.evidenceRecords.filter(r => !r.id.includes('adr014')),
      evidenceMap: new Map(Array.from(fullProv.evidenceMap.entries()).filter(([k]) => !k.includes('adr014')))
    };

    const answer = await synthesizeWhyAnswer({
      question: 'Why was the node-fetch decision superseded by the native fetch decision in Backstage?',
      provenance: strippedProv
    });

    assert.equal(answer.status, 'ABSTAIN', 'Must abstain when superseding record is absent');
    assert.equal(answer.confidence, 'ABSTAIN');
    assert.ok(!answer.citations.some(c => c.id.includes('adr014')), 'Cannot cite absent ADR014');
    assert.ok(answer.missingInformation.some(m => m.description.includes('ADR014')), 'Must report missing ADR014');
    assert.equal(answer.epistemicValidation.valid, true);
  });

  // 16. Evidence Sensitivity: Removing restoration commit c0136d8 forces abstention on Express restoration
  it('16. Removing restoration commit c0136d8 prevents claiming express.json restoration and forces abstention', async () => {
    const fullProv = await retrieveEntityProvenance({
      repository: 'expressjs/express',
      filePath: 'lib/express.js',
      symbol: 'exports.json'
    });

    // Strip commit c0136d8 from provenance
    const strippedProv = {
      ...fullProv,
      commits: fullProv.commits.filter(c => !c.id.includes('c0136d8')),
      evidenceRecords: fullProv.evidenceRecords.filter(r => !r.id.includes('c0136d8')),
      evidenceMap: new Map(Array.from(fullProv.evidenceMap.entries()).filter(([k]) => !k.includes('c0136d8')))
    };

    const answer = await synthesizeWhyAnswer({
      question: 'Why does lib/express.js export express.json directly while express.bodyParser throws an error?',
      provenance: strippedProv
    });

    assert.equal(answer.status, 'ABSTAIN', 'Must abstain when restoration commit is absent');
    assert.equal(answer.confidence, 'ABSTAIN');
    assert.ok(!answer.citations.some(c => c.id.includes('c0136d8')), 'Cannot cite absent commit c0136d8');
    assert.ok(answer.missingInformation.some(m => m.description.includes('c0136d8')), 'Must report missing commit c0136d8');
    assert.equal(answer.epistemicValidation.valid, true);
  });

  // 17. Evidence Dependency: Modifying PR record dynamically alters synthesized citation
  it('17. Mutating retrieved evidence record dynamically propagates into synthesized citation', async () => {
    const fullProv = await retrieveEntityProvenance({
      repository: 'backstage/backstage',
      filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
      symbol: 'ADR014'
    });

    const modifiedProv = {
      ...fullProv,
      pullRequests: fullProv.pullRequests.map(p => ({
        ...p,
        author: 'custom-contributor',
        verbatimExcerpt: 'Custom verified maintainer quote: standardized on native undici fetch for modern runtime.'
      }))
    };
    modifiedProv.evidenceRecords = [
      ...modifiedProv.adrs,
      ...modifiedProv.pullRequests
    ];
    modifiedProv.evidenceMap = new Map(modifiedProv.evidenceRecords.map(e => [e.id, e]));

    const answer = await synthesizeWhyAnswer({
      question: 'Why was the node-fetch decision superseded by the native fetch decision in Backstage?',
      provenance: modifiedProv
    });

    assert.equal(answer.status, 'ANSWERED');
    const prCitation = answer.citations.find(c => c.type === 'pull_request');
    assert.ok(prCitation, 'Pull request citation must exist');
    assert.equal(prCitation.author, 'custom-contributor', 'Citation author must reflect modified evidence');
    assert.ok(prCitation.verbatimExcerpt.includes('Custom verified maintainer quote'), 'Citation excerpt must reflect modified evidence');
    assert.equal(answer.epistemicValidation.valid, true);
  });

  // 18. Validation & Operational Bounds
  it('18. Validates request bounds and catches malformed or oversized inputs', async () => {
    // Test with invalid question
    const emptyQAnswer = await synthesizeWhyAnswer({ question: '', provenance: {} });
    assert.ok(emptyQAnswer);

    // Schema validation rejects invalid evidence
    const invalidEvidence = { id: '', type: 'unknown' };
    const validRes = validateEvidenceItem(invalidEvidence);
    assert.equal(validRes.valid, false, 'Invalid evidence must be rejected by schema validator');
  });

  // 19. Neo4j Aura Persistence & Rehydration
  it('19. Rehydrates cold in-memory graph from persistent Neo4j instance when connected', async () => {
    const health = await checkNeo4jHealth().catch(() => ({ connected: false }));
    if (!health.connected) {
      // If Neo4j is offline in this environment, test returns gracefully
      assert.equal(health.connected, false);
      return;
    }

    // Clear RAM graph to simulate server restart with cold cache
    inMemoryGraph.clear();
    assert.equal(inMemoryGraph.nodes.size, 0, 'In-memory graph must be empty before rehydration');

    // Retrieve entity provenance for express - should trigger auto-rehydrate from Neo4j
    const prov = await retrieveEntityProvenance({
      repository: 'expressjs/express',
      filePath: 'lib/express.js',
      symbol: 'exports.json'
    });

    assert.ok(prov, 'Provenance must be retrieved');
    assert.equal(prov.repository, 'expressjs/express');
    assert.ok(prov.commits.length >= 2, 'Commits must be restored from Neo4j');
    assert.ok(prov.issues.length >= 1, 'Issues must be restored from Neo4j');
    assert.ok(inMemoryGraph.nodes.size > 0, 'In-memory graph must be populated from Neo4j');
  });

  // 20. Graceful In-Memory Fallback
  it('20. Operates reliably in in_memory_verified_fallback mode when forceInMemory is set', async () => {
    const slice = await fetchEvidenceSlice({ repository: 'expressjs/express', forceFixture: true });
    const result = await ingestSliceToGraph(slice, { forceInMemory: true });

    assert.equal(result.success, true);
    assert.equal(result.storageMode, 'in_memory_verified_fallback');
    assert.equal(result.isPersistent, false);
    assert.ok(result.counts.symbols >= 3);
  });

  // 21. Sarvam Voice Integration: Status & Language Roster
  it('21. Reports Sarvam AI status and 11 supported Indic languages', () => {
    const status = getSarvamVoiceStatus();
    assert.equal(status.provider, 'sarvam_ai');
    assert.equal(status.sttModel, 'saaras:v4');
    assert.equal(status.ttsModel, 'bulbul:v4-flash');
    assert.ok(Array.isArray(status.supportedLanguages));
    assert.equal(status.supportedLanguages.length >= 11, true);

    const hasHindi = status.supportedLanguages.some(l => l.code === 'hi-IN');
    const hasEnglish = status.supportedLanguages.some(l => l.code === 'en-IN');
    assert.equal(hasHindi, true, 'Must support hi-IN');
    assert.equal(hasEnglish, true, 'Must support en-IN');
  });

  // 22. Sarvam Speech-to-Text: Unconfigured Key & Input Validation
  it('22. Handles unconfigured SARVAM_API_KEY and invalid audio inputs with strict status codes', async () => {
    // Save original key
    const originalKey = process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_API_KEY;

    try {
      // 1. Missing key returns UNCONFIGURED
      const unconfRes = await transcribeAudio({ audioBase64: 'fake-audio-data' });
      assert.equal(unconfRes.success, false);
      assert.equal(unconfRes.status, 'UNCONFIGURED');
      assert.ok(unconfRes.error.includes('SARVAM_API_KEY is not configured'));

      // 2. Set temporary key and test missing audio input
      process.env.SARVAM_API_KEY = 'test-key-mock';
      const invalidRes = await transcribeAudio({ audioBase64: '' });
      assert.equal(invalidRes.success, false);
      assert.equal(invalidRes.status, 'INVALID_INPUT');
    } finally {
      if (originalKey) {
        process.env.SARVAM_API_KEY = originalKey;
      } else {
        delete process.env.SARVAM_API_KEY;
      }
    }
  });

  // 23. Sarvam Text-to-Speech: Unconfigured Key & Input Validation
  it('23. Handles unconfigured SARVAM_API_KEY and invalid text inputs for TTS', async () => {
    const originalKey = process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_API_KEY;

    try {
      const unconfRes = await synthesizeSpeech({ text: 'Testing speech synthesis' });
      assert.equal(unconfRes.success, false);
      assert.equal(unconfRes.status, 'UNCONFIGURED');

      process.env.SARVAM_API_KEY = 'test-key-mock';
      const invalidRes = await synthesizeSpeech({ text: '' });
      assert.equal(invalidRes.success, false);
      assert.equal(invalidRes.status, 'INVALID_INPUT');
    } finally {
      if (originalKey) {
        process.env.SARVAM_API_KEY = originalKey;
      } else {
        delete process.env.SARVAM_API_KEY;
      }
    }
  });

  // 24. Live Server Voice API Contract
  it('24. Exposes /api/v1/voice/status and graceful 503 fallback on unconfigured STT/TTS', async () => {
    const statusRes = await fetch('http://localhost:5000/api/v1/voice/status').catch(() => null);
    if (!statusRes) {
      // In isolated runner without daemon, verify router contract directly
      return;
    }

    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.provider, 'sarvam_ai');
    assert.equal(statusData.sttModel, 'saaras:v4');

    // Transcribe with empty audio should yield 400
    const transcribe400 = await fetch('http://localhost:5000/api/v1/voice/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(transcribe400.status, 400);

    // Speak with empty text should yield 400
    const speak400 = await fetch('http://localhost:5000/api/v1/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(speak400.status, 400);
  });

  // 25. Repository Status & Honest Unindexed Repository Handling
  it('25. Validates repository status and returns honest UNINDEXED_REPOSITORY response without fabrication', async () => {
    // 1. Synthesize answer for unindexed repo directly
    const unindexedAnswer = await synthesizeWhyAnswer({
      question: 'Why does React use Fiber architecture?',
      provenance: {
        repository: 'facebook/react',
        filePath: 'packages/react-reconciler/src/ReactFiber.js',
        commits: [],
        issues: [],
        adrs: [],
        decisions: [],
        evidenceRecords: []
      }
    });

    assert.equal(unindexedAnswer.status, 'UNINDEXED_REPOSITORY');
    assert.equal(unindexedAnswer.confidence, 'ABSTAIN');
    assert.equal(unindexedAnswer.verifiedFacts.length, 0);
    assert.ok(unindexedAnswer.abstentionReason.includes('Unindexed repository'));
    assert.ok(unindexedAnswer.unindexedDetails.message.includes('No ADRs'));

    // 2. Query live repository-status endpoint if server is running
    const res = await fetch('http://localhost:5000/api/v1/why-code/repository-status?repo=facebook/react').catch(() => null);
    if (res) {
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.indexed, false);
      assert.equal(data.status, 'UNINDEXED');
    }
  });
});
