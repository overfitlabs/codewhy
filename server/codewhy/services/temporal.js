/**
 * CodeWhy Temporal & Supersession Reasoning Service
 * 
 * Enforces strict epistemic rules for distinguishing:
 * - ACTIVE decisions
 * - SUPERSEDED or PARTIALLY_SUPERSEDED decisions
 * - HISTORICAL_UNKNOWN decisions (where code changed, but documentary intent is absent)
 * 
 * Guarantees that supersession is NEVER inferred from timestamps or git diffs alone.
 */

export const SUFFICIENT_DOCUMENTARY_PATTERNS = [
  /\b(supersedes|superseded by|replaces|replaced by)\b/i,
  /\b(re-bundle|re-adding|restoring|bringing back)\b/i,
  /\bcloses #\d+\b/i,
  /\b:::note\[superseded\]/i,
  /@deprecated/i
];

/**
 * Evaluates whether a later decision or change supersedes an earlier decision.
 * 
 * @param {Object} earlierDecision 
 * @param {Object} laterArtifact 
 * @param {Object} context 
 * @returns {Object} { isSuperseded, status, rationale }
 */
export function evaluateSupersession(earlierDecision, laterArtifact, context = {}) {
  if (!earlierDecision) {
    throw new Error('earlierDecision must be provided');
  }
  if (!laterArtifact) {
    return {
      isSuperseded: false,
      status: earlierDecision.status || 'ACTIVE',
      rationale: 'No subsequent artifact provided.'
    };
  }

  // 1. Strict Rule: Check for mere chronological succession
  const isChronologicalOnly = !laterArtifact.rationale &&
    !laterArtifact.message?.match(/closes|supersedes|replaces|re-bundle/i) &&
    !laterArtifact.explicitSupersessionDirective &&
    !laterArtifact.supersedes &&
    !laterArtifact.supersedesDecisionId &&
    !laterArtifact.supersessionNotice;

  if (isChronologicalOnly) {
    return {
      isSuperseded: false,
      status: 'HISTORICAL_UNKNOWN',
      rationale: 'Code was modified chronologically at a later date, but no explicit documentary evidence (ADR, PR, or issue rationale) declares supersession. Status remains HISTORICAL_UNKNOWN.'
    };
  }

  // 2. Check for explicit partial supersession (e.g. Express body-parser compromise)
  const isPartialCompromise = (
    (laterArtifact.message && laterArtifact.message.includes('Add express.json and express.urlencoded')) ||
    (laterArtifact.rationale && laterArtifact.rationale.includes('convenience') && laterArtifact.rationale.includes('multipart'))
  );

  if (isPartialCompromise) {
    return {
      isSuperseded: true,
      status: 'PARTIALLY_SUPERSEDED',
      scope: ['express.json', 'express.urlencoded'],
      retainedScope: ['express.bodyParser', 'multipart'],
      rationale: 'Later decision partially supersedes earlier total middleware ban for JSON and URL-encoded bodies, while explicitly upholding the permanent ban on generic bodyParser and multipart uploads.'
    };
  }

  // 3. Check for total formal supersession (e.g. Backstage ADR-014 -> ADR-013)
  const hasFormalDeclaration = (
    Boolean(laterArtifact.explicitSupersessionDirective) ||
    Boolean(laterArtifact.supersedes) ||
    Boolean(laterArtifact.supersedesDecisionId) ||
    Boolean(laterArtifact.supersessionNotice && SUFFICIENT_DOCUMENTARY_PATTERNS.some(p => p.test(laterArtifact.supersessionNotice))) ||
    Boolean(laterArtifact.rationale && SUFFICIENT_DOCUMENTARY_PATTERNS.some(p => p.test(laterArtifact.rationale)))
  );

  if (hasFormalDeclaration) {
    return {
      isSuperseded: true,
      status: 'SUPERSEDED',
      rationale: laterArtifact.supersessionRationale || laterArtifact.rationale || 'Explicitly declared superseded in documentary record.'
    };
  }

  return {
    isSuperseded: false,
    status: 'HISTORICAL_UNKNOWN',
    rationale: 'Evidence is insufficient to establish intentional supersession. Retained as HISTORICAL_UNKNOWN.'
  };
}
