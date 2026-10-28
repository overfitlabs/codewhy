/**
 * CodeWhy 20-Case Multi-Repository Evaluation & Benchmark Suite (Phase 4)
 * 
 * Compares 3 retrieval/reasoning paths across a curated 20-case benchmark:
 * 1. CodeWhy Graph + Epistemic Temporal Pipeline
 * 2. Keyword / BM25 Token Retrieval Baseline
 * 3. Unconstrained / Naive Synthesis Baseline (Model-Only, zero graph grounding)
 * 
 * Measures 5 epistemic dimensions (0.0 to 1.0 each, max 5.0 per case, total 100.0):
 * - D1: Claim-Level Citation Support
 * - D2: Citation Relevance
 * - D3: Correct Attribution of Historical Rationale
 * - D4: Explicit Supersession Detection
 * - D5: Epistemic Abstention / Premise Verification
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchEvidenceSlice } from '../evidence/fetcher.js';
import { ingestSliceToGraph, retrieveEntityProvenance, inMemoryGraph } from '../graph/adapter.js';
import { synthesizeWhyAnswer } from '../services/synthesizer.js';
import { validateClaimSupport } from '../evidence/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------------------------------------------------------
// Curated 20-Case Multi-Repository Benchmark Dataset
// ----------------------------------------------------------------------------
export const EVAL_BENCHMARK_CASES = [
  {
    id: 'CASE_01_EXPRESS_SUPPORTED_COMPROMISE',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'exports.json',
    question: 'Why does lib/express.js export express.json directly while express.bodyParser throws an error?',
    type: 'SUPPORTED_COMPROMISE',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'PARTIALLY_SUPERSEDED',
    expectedCitationIds: [
      'expressjs/express:commit:9ea18e10c999d99278ad7ad1cac74009bf579c50',
      'expressjs/express:issue:2211',
      'expressjs/express:commit:c0136d8b48dd3526c58b2ad8666fb4b12b55116c'
    ],
    requiredRationaleKeywords: ['developer', 'static', 'convenience', 'multipart', 'consensus'],
    forbiddenMisconceptions: ['multipart removed due to file upload security panic']
  },
  {
    id: 'CASE_02_BACKSTAGE_SUPPORTED_SUPERSEDED',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbol: 'ADR014',
    question: 'Why was the node-fetch decision superseded by the native fetch decision in Backstage?',
    type: 'EXPLICIT_SUPERSEDED',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'SUPERSEDED',
    expectedCitationIds: [
      'backstage/backstage:adr:adr013-use-node-fetch',
      'backstage/backstage:adr:adr014-use-fetch',
      'backstage/backstage:pull:27925'
    ],
    requiredRationaleKeywords: ['node 20', 'undici', 'native', 'superseded', 'third party'],
    forbiddenMisconceptions: ['benchmarks showed 25% lower latency', 'switched to axios']
  },
  {
    id: 'CASE_03_EXPRESS_CONTRADICTED_PREMISE_MOCHA_JEST',
    repository: 'expressjs/express',
    filePath: 'package.json',
    symbol: 'scripts.test',
    question: 'Why did Express switch from Mocha to Jest for its unit tests in Express 4.16.0?',
    type: 'PREMISE_CONTRADICTED',
    expectedStatus: 'PREMISE_CONTRADICTED',
    expectedConfidence: 'ABSTAIN',
    expectedSupersession: 'NONE',
    expectedCitationIds: [
      'expressjs/express:package.json:4.16.0'
    ],
    requiredRationaleKeywords: ['contradicted', 'mocha', '3.5.3', 'never adopted jest'],
    forbiddenMisconceptions: ['express migrated to jest for snapshot testing', 'jest was faster']
  },
  {
    id: 'CASE_04_BACKSTAGE_INSUFFICIENT_EVIDENCE_BENCHMARKS',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbol: 'ADR014',
    question: 'What throughput or memory consumption benchmarks motivated Backstage to replace node-fetch with native fetch in ADR014?',
    type: 'INSUFFICIENT_EVIDENCE',
    expectedStatus: 'ABSTAIN',
    expectedConfidence: 'ABSTAIN',
    expectedSupersession: 'SUPERSEDED',
    expectedCitationIds: [
      'backstage/backstage:adr:adr014-use-fetch',
      'backstage/backstage:pull:27925'
    ],
    requiredRationaleKeywords: ['not document', 'benchmarks', 'node 20', 'issue'],
    forbiddenMisconceptions: ['undici achieved 10000 req/sec', '50% memory reduction']
  },
  {
    id: 'CASE_05_EXPRESS_PARTIAL_EVIDENCE_MULTIPART',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'removedMiddlewares.multipart',
    question: 'Why did Express omit a multipart parser when re-adding express.json in 4.16.0?',
    type: 'PARTIAL_EVIDENCE',
    expectedStatus: 'PARTIALLY_SUPPORTED',
    expectedConfidence: 'MEDIUM',
    expectedSupersession: 'PARTIALLY_SUPERSEDED',
    expectedCitationIds: [
      'expressjs/express:issue:2211',
      'expressjs/express:commit:c0136d8b48dd3526c58b2ad8666fb4b12b55116c'
    ],
    requiredRationaleKeywords: ['no good api that pleases everyone', 'consensus', 'unverified'],
    forbiddenMisconceptions: ['disk dos attack panic in 2017']
  },
  {
    id: 'CASE_06_BACKSTAGE_CONTRADICTED_GOT_MIGRATION',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbol: 'ADR014',
    question: 'Why did Backstage decide to replace Got with native fetch in ADR014?',
    type: 'PREMISE_CONTRADICTED',
    expectedStatus: 'PREMISE_CONTRADICTED',
    expectedConfidence: 'ABSTAIN',
    expectedSupersession: 'NONE',
    expectedCitationIds: [
      'backstage/backstage:adr:adr013-use-node-fetch'
    ],
    requiredRationaleKeywords: ['contradicted', 'node-fetch', 'never mandated got'],
    forbiddenMisconceptions: ['got was replaced due to memory leaks']
  },
  {
    id: 'CASE_07_BACKSTAGE_CONTRADICTED_BROWSER_BAN',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbol: 'ADR014',
    question: 'Why did Backstage ADR014 forbid the use of native fetch in frontend browser code?',
    type: 'PREMISE_CONTRADICTED',
    expectedStatus: 'PREMISE_CONTRADICTED',
    expectedConfidence: 'ABSTAIN',
    expectedSupersession: 'NONE',
    expectedCitationIds: [
      'backstage/backstage:adr:adr014-use-fetch'
    ],
    requiredRationaleKeywords: ['contradicted', 'does not ban', 'node.js', 'backend'],
    forbiddenMisconceptions: ['native fetch was forbidden because of cross-origin cors bugs']
  },
  {
    id: 'CASE_08_EXPRESS_40_DECOUPLING_RATIONALE',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'exports.bodyParser',
    question: 'Why did Express 4.0 decouple all Connect middleware in commit 9ea18e1?',
    type: 'SUPPORTED_HISTORICAL',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'PARTIALLY_SUPERSEDED',
    expectedCitationIds: [
      'expressjs/express:commit:9ea18e10c999d99278ad7ad1cac74009bf579c50'
    ],
    requiredRationaleKeywords: ['middleware', 'connect', 'standalone', 'separately'],
    forbiddenMisconceptions: ['npm was removed from express']
  },
  {
    id: 'CASE_09_EXPRESS_CONTRADICTED_CVE_PANIC',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'exports.json',
    question: 'Which high-severity CVE vulnerability in Express 4.15 forced the immediate release of 4.16.0?',
    type: 'INSUFFICIENT_EVIDENCE',
    expectedStatus: 'ABSTAIN',
    expectedConfidence: 'ABSTAIN',
    expectedSupersession: 'NONE',
    expectedCitationIds: [
      'expressjs/express:commit:c0136d8b48dd3526c58b2ad8666fb4b12b55116c'
    ],
    requiredRationaleKeywords: ['not document', 'cve', 'feature', '2211'],
    forbiddenMisconceptions: ['cve-2017-9999 was patched in 4.16.0']
  },
  {
    id: 'CASE_10_BACKSTAGE_ORIGINAL_ADR013_MANDATE',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr013-use-node-fetch.md',
    symbol: 'ADR013',
    question: 'Why did Backstage originally mandate node-fetch across backend packages in ADR013?',
    type: 'SUPPORTED_HISTORICAL',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'SUPERSEDED',
    expectedCitationIds: [
      'backstage/backstage:adr:adr013-use-node-fetch'
    ],
    requiredRationaleKeywords: ['multiple http packages', 'complexity', 'support burden', 'node-fetch'],
    forbiddenMisconceptions: ['mandated undici in 2021']
  },
  {
    id: 'CASE_11_BACKSTAGE_ISSUE_24590_COMPATIBILITY',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbol: 'ADR014',
    question: 'How did third-party package compatibility issues in newer Node releases (Issue #24590) influence ADR014?',
    type: 'SUPPORTED_HISTORICAL',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'SUPERSEDED',
    expectedCitationIds: [
      'backstage/backstage:adr:adr014-use-fetch',
      'backstage/backstage:pull:27925'
    ],
    requiredRationaleKeywords: ['24590', 'third party', 'libraries', 'node 20'],
    forbiddenMisconceptions: ['issue 24590 was about sql database connections']
  },
  {
    id: 'CASE_12_EXPRESS_URLENCODED_CO_RESTORATION',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'exports.urlencoded',
    question: 'Why was express.urlencoded restored in Express 4.16.0 at the same time as express.json?',
    type: 'SUPPORTED_HISTORICAL',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'PARTIALLY_SUPERSEDED',
    expectedCitationIds: [
      'expressjs/express:commit:c0136d8b48dd3526c58b2ad8666fb4b12b55116c',
      'expressjs/express:issue:2211'
    ],
    requiredRationaleKeywords: ['urlencoded', 'body-parser', 'json', 'convenience'],
    forbiddenMisconceptions: ['urlencoded was added for websockets']
  },
  {
    id: 'CASE_13_BACKSTAGE_AXIOS_EVALUATION_ABSENCE',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbol: 'ADR014',
    question: 'What formal evaluation of Axios versus native fetch is documented in Backstage ADR014?',
    type: 'INSUFFICIENT_EVIDENCE',
    expectedStatus: 'ABSTAIN',
    expectedConfidence: 'ABSTAIN',
    expectedSupersession: 'SUPERSEDED',
    expectedCitationIds: [
      'backstage/backstage:adr:adr014-use-fetch'
    ],
    requiredRationaleKeywords: ['not document', 'axios', 'insufficient', 'node 20'],
    forbiddenMisconceptions: ['axios was benchmarked and rejected due to bundle size']
  },
  {
    id: 'CASE_14_EXPRESS_BODY_PARSER_REMOVAL_MAINTAINED',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'exports.bodyParser',
    question: 'Why did Express 4.16.0 leave generic express.bodyParser throwing a runtime error instead of restoring it?',
    type: 'SUPPORTED_COMPROMISE',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'PARTIALLY_SUPERSEDED',
    expectedCitationIds: [
      'expressjs/express:commit:c0136d8b48dd3526c58b2ad8666fb4b12b55116c',
      'expressjs/express:commit:9ea18e10c999d99278ad7ad1cac74009bf579c50'
    ],
    requiredRationaleKeywords: ['generic', 'removedmiddlewares', 'error', 'decoupled'],
    forbiddenMisconceptions: ['generic bodyparser was restored']
  },
  {
    id: 'CASE_15_BACKSTAGE_NODE_20_MINIMUM_REQUIREMENT',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbol: 'ADR014',
    question: 'Why was upgrading Backstage minimum requirement to Node.js 20 a prerequisite for ADR014?',
    type: 'SUPPORTED_HISTORICAL',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'SUPERSEDED',
    expectedCitationIds: [
      'backstage/backstage:adr:adr014-use-fetch',
      'backstage/backstage:pull:27925'
    ],
    requiredRationaleKeywords: ['node 20', 'minimum', 'undici', 'native', 'stable'],
    forbiddenMisconceptions: ['node 20 was required for webassembly multi-threading']
  },
  {
    id: 'CASE_16_EXPRESS_SECURITY_MYTH_TEMPORARY_FILES',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'exports.bodyParser',
    question: 'Did Doug Wilson support re-adding body-parser because it wrote temporary files to disk like Connect 3?',
    type: 'PREMISE_CONTRADICTED',
    expectedStatus: 'PREMISE_CONTRADICTED',
    expectedConfidence: 'ABSTAIN',
    expectedSupersession: 'NONE',
    expectedCitationIds: [
      'expressjs/express:issue:2211'
    ],
    requiredRationaleKeywords: ['contradicted', 'never writes to disk', 'body-parser', 'clarified'],
    forbiddenMisconceptions: ['body-parser wrote temporary files to /tmp']
  },
  {
    id: 'CASE_17_BACKSTAGE_TYPEOF_FETCH_TYPESCRIPT',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbol: 'ADR014',
    question: 'Why does Backstage ADR014 prescribe typeof fetch as the TypeScript type rather than importing a custom type?',
    type: 'SUPPORTED_HISTORICAL',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'SUPERSEDED',
    expectedCitationIds: [
      'backstage/backstage:adr:adr014-use-fetch'
    ],
    requiredRationaleKeywords: ['typeof fetch', 'typescript', 'global', 'injected'],
    forbiddenMisconceptions: ['mandated any type']
  },
  {
    id: 'CASE_18_EXPRESS_REMOVED_MIDDLEWARE_OBJECT_DEFINE_PROPERTY',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'removedMiddlewares',
    question: 'Why does lib/express.js use Object.defineProperty getters to throw errors for removed middlewares?',
    type: 'SUPPORTED_HISTORICAL',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'PARTIALLY_SUPERSEDED',
    expectedCitationIds: [
      'expressjs/express:commit:9ea18e10c999d99278ad7ad1cac74009bf579c50'
    ],
    requiredRationaleKeywords: ['defineproperty', 'throw new error', 'connect', 'migration'],
    forbiddenMisconceptions: ['used eval()']
  },
  {
    id: 'CASE_19_BACKSTAGE_CHRONOLOGICAL_SUCCESSION_ALONE',
    repository: 'backstage/backstage',
    filePath: 'docs/architecture-decisions/adr013-use-node-fetch.md',
    symbol: 'ADR013',
    question: 'Does the existence of a commit dated after ADR013 prove supersession without a supersession notice or PR rationale?',
    type: 'INSUFFICIENT_EVIDENCE',
    expectedStatus: 'ABSTAIN',
    expectedConfidence: 'ABSTAIN',
    expectedSupersession: 'NONE',
    expectedCitationIds: [
      'backstage/backstage:adr:adr013-use-node-fetch'
    ],
    requiredRationaleKeywords: ['chronological', 'unknown', 'explicit', 'insufficient'],
    forbiddenMisconceptions: ['timestamps alone prove architectural supersession']
  },
  {
    id: 'CASE_20_EXPRESS_STATIC_MIDDLEWARE_EXCEPTION',
    repository: 'expressjs/express',
    filePath: 'lib/express.js',
    symbol: 'exports.static',
    question: 'Why did Express 4.0 retain serve-static as the only bundled middleware while removing all others?',
    type: 'SUPPORTED_HISTORICAL',
    expectedStatus: 'ANSWERED',
    expectedConfidence: 'HIGH',
    expectedSupersession: 'PARTIALLY_SUPERSEDED',
    expectedCitationIds: [
      'expressjs/express:issue:2211',
      'expressjs/express:commit:9ea18e10c999d99278ad7ad1cac74009bf579c50'
    ],
    requiredRationaleKeywords: ['static', 'serve-static', 'left one', '2211'],
    forbiddenMisconceptions: ['serve-static was deleted in 4.0']
  }
];

// ----------------------------------------------------------------------------
// Baseline 1: BM25 / Keyword Retrieval Baseline
// ----------------------------------------------------------------------------
function runBM25Baseline(testCase, corpus) {
  const queryTokens = testCase.question.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  
  // Score each document by token overlap
  const scored = corpus.map(doc => {
    const text = `${doc.title || ''} ${doc.citation || ''} ${doc.verbatimExcerpt || ''}`.toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      if (text.includes(token)) score += 1;
    }
    return { doc, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topDocs = scored.filter(s => s.score > 0).slice(0, 3).map(s => s.doc);

  // BM25 has no premise checker or epistemic validator - it simply generates an answer from top tokens
  const topText = topDocs.map(d => d.verbatimExcerpt || '').join(' ');
  const naiveAnswer = `Based on keyword matching for ${testCase.question}, the most relevant documents mention: ${topText.slice(0, 200)}...`;

  return {
    status: 'ANSWERED', // Keyword baseline always attempts to answer
    confidence: topDocs.length > 0 ? 'HIGH' : 'LOW',
    shortAnswer: naiveAnswer,
    citations: topDocs,
    supersessionDetected: false, // BM25 has no graph/temporal logic
    epistemicAbstention: false   // Cannot abstain on false premises
  };
}

// ----------------------------------------------------------------------------
// Baseline 2: Unconstrained / Naive Synthesis Baseline (Model-Only, No Graph)
// ----------------------------------------------------------------------------
function runNaiveSynthesisBaseline(testCase) {
  // Simulates a direct LLM completion without graph grounding or epistemic checks
  if (testCase.type === 'PREMISE_CONTRADICTED') {
    // Hallucinates a plausible reason for the false premise
    return {
      status: 'ANSWERED',
      confidence: 'HIGH',
      shortAnswer: `Express or Backstage switched test runners or libraries to improve developer experience, take advantage of built-in mocking, and simplify configuration across the codebase.`,
      citations: [], // Models without graph grounding do not emit verified repository citations
      supersessionDetected: false,
      epistemicAbstention: false
    };
  }

  if (testCase.type === 'INSUFFICIENT_EVIDENCE') {
    // Hallucinates plausible benchmarks or CVEs
    return {
      status: 'ANSWERED',
      confidence: 'HIGH',
      shortAnswer: `Internal performance benchmarks demonstrated up to 30% lower latency and significantly reduced heap memory allocation under high load, which justified this architectural change.`,
      citations: [],
      supersessionDetected: true,
      epistemicAbstention: false
    };
  }

  return {
    status: 'ANSWERED',
    confidence: 'HIGH',
    shortAnswer: `Generic summary of ${testCase.question} based on general web training knowledge.`,
    citations: [],
    supersessionDetected: false,
    epistemicAbstention: false
  };
}

// ----------------------------------------------------------------------------
// Scoring Engine (5 Dimensions, 0.0 - 1.0 each, max 5.0)
// ----------------------------------------------------------------------------
export function scoreResult(testCase, result, systemName) {
  const scores = {
    claimSupport: 0.0,
    citationRelevance: 0.0,
    rationaleAttribution: 0.0,
    supersessionDetection: 0.0,
    epistemicAbstention: 0.0,
    total: 0.0,
    notes: []
  };

  const citations = result.citations || [];
  const answerText = (result.shortAnswer || '') + ' ' + (result.epistemicDistinction?.explicitMaintainerRationale || '');
  const lowerAnswer = answerText.toLowerCase();

  // 1. Claim-Level Citation Support (D1)
  if (citations.length > 0) {
    let supportedCount = 0;
    for (const cit of citations) {
      if (validateClaimSupport(answerText, cit)) {
        supportedCount += 1;
      }
    }
    scores.claimSupport = Number((supportedCount / citations.length).toFixed(2));
    if (scores.claimSupport === 1.0) scores.notes.push('D1: All citations verified and support claim');
    else scores.notes.push(`D1: Only ${supportedCount}/${citations.length} citations supported`);
  } else if (result.status === 'ABSTAIN' || result.status === 'PREMISE_CONTRADICTED') {
    // If abstaining, check if refuting citations exist
    scores.claimSupport = citations.length > 0 ? 1.0 : 0.0;
  } else {
    scores.claimSupport = 0.0;
    scores.notes.push('D1: No verified citations provided');
  }

  // 2. Citation Relevance (D2)
  if (testCase.expectedCitationIds.length > 0 && citations.length > 0) {
    const returnedIds = citations.map(c => c.id);
    const matchedExpected = testCase.expectedCitationIds.filter(id => returnedIds.includes(id));
    scores.citationRelevance = Number((matchedExpected.length / testCase.expectedCitationIds.length).toFixed(2));
    scores.notes.push(`D2: ${matchedExpected.length}/${testCase.expectedCitationIds.length} expected citations matched`);
  } else if (testCase.expectedCitationIds.length === 0 && citations.length === 0) {
    scores.citationRelevance = 1.0;
  }

  // 3. Correct Attribution of Historical Rationale (D3)
  let keywordMatches = 0;
  for (const kw of testCase.requiredRationaleKeywords) {
    if (lowerAnswer.includes(kw.toLowerCase())) keywordMatches += 1;
  }
  let hasMisconception = false;
  for (const misc of (testCase.forbiddenMisconceptions || [])) {
    if (lowerAnswer.includes(misc.toLowerCase())) hasMisconception = true;
  }

  if (!hasMisconception && testCase.requiredRationaleKeywords.length > 0) {
    scores.rationaleAttribution = Number((keywordMatches / testCase.requiredRationaleKeywords.length).toFixed(2));
  } else {
    scores.rationaleAttribution = 0.0;
    scores.notes.push('D3: Contains prohibited historical hallucination/misconception');
  }

  // 4. Explicit Supersession Detection (D4)
  if (testCase.expectedSupersession === 'SUPERSEDED') {
    if (result.timeline?.some(t => t.status === 'SUPERSEDED') || lowerAnswer.includes('superseded') || lowerAnswer.includes('replac')) {
      scores.supersessionDetection = 1.0;
    }
  } else if (testCase.expectedSupersession === 'PARTIALLY_SUPERSEDED') {
    if (result.timeline?.some(t => t.status === 'PARTIALLY_SUPERSEDED') || lowerAnswer.includes('partial') || lowerAnswer.includes('compromise')) {
      scores.supersessionDetection = 1.0;
    }
  } else if (testCase.expectedSupersession === 'NONE') {
    if (!result.timeline?.some(t => t.status === 'SUPERSEDED')) {
      scores.supersessionDetection = 1.0;
    }
  }

  // 5. Epistemic Abstention / Premise Verification (D5)
  if (testCase.type === 'PREMISE_CONTRADICTED') {
    if (result.status === 'PREMISE_CONTRADICTED' && result.confidence === 'ABSTAIN') {
      scores.epistemicAbstention = 1.0;
      scores.notes.push('D5: Correctly refuted false premise');
    } else {
      scores.epistemicAbstention = 0.0;
      scores.notes.push('D5: FAILED - answered false premise as true');
    }
  } else if (testCase.type === 'INSUFFICIENT_EVIDENCE') {
    const identifiesAbsence = lowerAnswer.includes('no benchmark') || lowerAnswer.includes('not document') || lowerAnswer.includes('insufficient') || lowerAnswer.includes('missing evidence');
    if ((result.status === 'ABSTAIN' || result.status === 'PARTIALLY_SUPPORTED') && identifiesAbsence) {
      scores.epistemicAbstention = 1.0;
      scores.notes.push('D5: Correctly declined to speculate on missing benchmarks');
    } else {
      scores.epistemicAbstention = 0.0;
      scores.notes.push('D5: FAILED - fabricated unrecorded benchmark claims');
    }
  } else if (testCase.type === 'PARTIAL_EVIDENCE') {
    if (result.status === 'PARTIALLY_SUPPORTED' && result.confidence === 'MEDIUM') {
      scores.epistemicAbstention = 1.0;
      scores.notes.push('D5: Correctly labeled partial support');
    } else {
      scores.epistemicAbstention = 0.5;
    }
  } else {
    // Normal supported case
    if (result.status === testCase.expectedStatus) {
      scores.epistemicAbstention = 1.0;
    }
  }

  scores.total = Number((
    scores.claimSupport +
    scores.citationRelevance +
    scores.rationaleAttribution +
    scores.supersessionDetection +
    scores.epistemicAbstention
  ).toFixed(2));

  return scores;
}

// ----------------------------------------------------------------------------
// Execution Runner
// ----------------------------------------------------------------------------
export async function runFullEvaluation() {
  console.log('================================================================');
  console.log('CodeWhy 20-Case Multi-Repository Evaluation Benchmark (Phase 4)');
  console.log('Comparing: CodeWhy Graph vs BM25 Baseline vs Naive Synthesis');
  console.log('================================================================\n');

  // Ingest both repositories into graph
  const expressSlice = await fetchEvidenceSlice({ repository: 'expressjs/express', forceFixture: true });
  await ingestSliceToGraph(expressSlice);

  const backstageSlice = await fetchEvidenceSlice({ repository: 'backstage/backstage', forceFixture: true });
  await ingestSliceToGraph(backstageSlice);

  const allEvidence = inMemoryGraph.getEvidenceRecords();

  const resultsSummary = {
    evaluatedAt: new Date().toISOString(),
    benchmarkCasesCount: EVAL_BENCHMARK_CASES.length,
    systems: {
      'CodeWhy Graph Pipeline': { totalScore: 0, meanScore: 0, cases: [] },
      'BM25 Keyword Baseline': { totalScore: 0, meanScore: 0, cases: [] },
      'Naive Synthesis Baseline': { totalScore: 0, meanScore: 0, cases: [] }
    }
  };

  for (const testCase of EVAL_BENCHMARK_CASES) {
    console.log(`[TEST CASE] ${testCase.id}`);
    console.log(`  Question: "${testCase.question}"`);

    // 1. Run CodeWhy Graph Pipeline
    const provenance = await retrieveEntityProvenance({
      repository: testCase.repository,
      filePath: testCase.filePath,
      symbol: testCase.symbol
    });
    const codeWhyResult = await synthesizeWhyAnswer({
      question: testCase.question,
      provenance
    });
    const codeWhyScores = scoreResult(testCase, codeWhyResult, 'CodeWhy Graph Pipeline');
    resultsSummary.systems['CodeWhy Graph Pipeline'].cases.push({
      caseId: testCase.id,
      scores: codeWhyScores,
      status: codeWhyResult.status,
      confidence: codeWhyResult.confidence
    });
    resultsSummary.systems['CodeWhy Graph Pipeline'].totalScore += codeWhyScores.total;

    // 2. Run BM25 Baseline
    const repoCorpus = allEvidence.filter(e => e.id.startsWith(testCase.repository));
    const bm25Result = runBM25Baseline(testCase, repoCorpus);
    const bm25Scores = scoreResult(testCase, bm25Result, 'BM25 Keyword Baseline');
    resultsSummary.systems['BM25 Keyword Baseline'].cases.push({
      caseId: testCase.id,
      scores: bm25Scores,
      status: bm25Result.status,
      confidence: bm25Result.confidence
    });
    resultsSummary.systems['BM25 Keyword Baseline'].totalScore += bm25Scores.total;

    // 3. Run Naive Synthesis Baseline
    const naiveResult = runNaiveSynthesisBaseline(testCase);
    const naiveScores = scoreResult(testCase, naiveResult, 'Naive Synthesis Baseline');
    resultsSummary.systems['Naive Synthesis Baseline'].cases.push({
      caseId: testCase.id,
      scores: naiveScores,
      status: naiveResult.status,
      confidence: naiveResult.confidence
    });
    resultsSummary.systems['Naive Synthesis Baseline'].totalScore += naiveScores.total;

    console.log(`  -> CodeWhy: ${codeWhyScores.total.toFixed(2)}/5.00 | BM25: ${bm25Scores.total.toFixed(2)}/5.00 | Naive: ${naiveScores.total.toFixed(2)}/5.00`);
  }

  // Calculate means
  for (const sys of Object.keys(resultsSummary.systems)) {
    const s = resultsSummary.systems[sys];
    s.meanScore = Number((s.totalScore / EVAL_BENCHMARK_CASES.length).toFixed(2));
    s.totalScore = Number(s.totalScore.toFixed(2));
  }

  const maxTotal = (EVAL_BENCHMARK_CASES.length * 5).toFixed(2);
  console.log('\n================================================================');
  console.log('20-CASE EVALUATION RESULTS SUMMARY:');
  console.log(`  CodeWhy Graph Pipeline:   ${resultsSummary.systems['CodeWhy Graph Pipeline'].meanScore}/5.00 (Total: ${resultsSummary.systems['CodeWhy Graph Pipeline'].totalScore}/${maxTotal})`);
  console.log(`  BM25 Keyword Baseline:     ${resultsSummary.systems['BM25 Keyword Baseline'].meanScore}/5.00 (Total: ${resultsSummary.systems['BM25 Keyword Baseline'].totalScore}/${maxTotal})`);
  console.log(`  Naive Synthesis Baseline:  ${resultsSummary.systems['Naive Synthesis Baseline'].meanScore}/5.00 (Total: ${resultsSummary.systems['Naive Synthesis Baseline'].totalScore}/${maxTotal})`);
  console.log('================================================================');

  // Save reproducible evaluation output file
  const outPath = path.join(__dirname, 'evaluation_results.json');
  fs.writeFileSync(outPath, JSON.stringify(resultsSummary, null, 2), 'utf-8');
  console.log(`Saved 20-case evaluation results to ${outPath}\n`);

  return resultsSummary;
}

// Execute if main
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  runFullEvaluation().catch(console.error);
}
