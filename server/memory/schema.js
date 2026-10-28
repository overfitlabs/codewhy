/**
 * Project Memory Graph Schema (Phase 3)
 * Defines node labels, relationship types, deterministic repository-scoped identifiers,
 * and idempotent Neo4j uniqueness constraints.
 */

import { runQuery } from '../db/neo4j.js';

export const NODE_LABELS = Object.freeze({
  REPOSITORY: 'Repository',
  FILE: 'File',
  COMPONENT: 'Component',
  SYMBOL: 'Symbol',
  FUNCTION: 'Function',
  CLASS: 'Class',
  COMMIT: 'Commit',
  BUG: 'Bug',
  FIX: 'Fix',
  TECHNICAL_DECISION: 'TechnicalDecision',
  TEST: 'Test'
});

export const REL_TYPES = Object.freeze({
  REPOSITORY_CONTAINS_FILE: 'REPOSITORY_CONTAINS_FILE',
  REPOSITORY_HAS_COMPONENT: 'REPOSITORY_HAS_COMPONENT',
  COMPONENT_CONTAINS_FILE: 'COMPONENT_CONTAINS_FILE',
  FILE_DEFINES_SYMBOL: 'FILE_DEFINES_SYMBOL',
  SYMBOL_CALLS_SYMBOL: 'SYMBOL_CALLS_SYMBOL',
  COMPONENT_DEPENDS_ON_COMPONENT: 'COMPONENT_DEPENDS_ON_COMPONENT',
  COMMIT_CHANGED_FILE: 'COMMIT_CHANGED_FILE',
  COMMIT_CHANGED_SYMBOL: 'COMMIT_CHANGED_SYMBOL',
  BUG_AFFECTS_COMPONENT: 'BUG_AFFECTS_COMPONENT',
  BUG_AFFECTS_FILE: 'BUG_AFFECTS_FILE',
  FIX_RESOLVES_BUG: 'FIX_RESOLVES_BUG',
  FIX_APPLIED_IN_COMMIT: 'FIX_APPLIED_IN_COMMIT',
  DECISION_AFFECTS_COMPONENT: 'DECISION_AFFECTS_COMPONENT',
  TEST_COVERS_SYMBOL: 'TEST_COVERS_SYMBOL'
});

/**
 * Normalizes a repository full name (owner/repo) or path segment for stable IDs.
 */
export function normalizePath(p = '') {
  return String(p)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export function slugify(text = '') {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/**
 * Generates deterministic, repository-scoped identifiers for all graph entities.
 */
export const GraphIds = {
  repository(repoFullName) {
    return normalizePath(repoFullName).toLowerCase();
  },
  component(repoFullName, componentPath) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const normComp = normalizePath(componentPath) || 'root';
    return `${repoKey}::component::${normComp}`;
  },
  file(repoFullName, filePath) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const normFile = normalizePath(filePath);
    return `${repoKey}::file::${normFile}`;
  },
  symbol(repoFullName, filePath, kind, symbolName) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const normFile = normalizePath(filePath);
    const normKind = String(kind || 'symbol').toLowerCase();
    return `${repoKey}::symbol::${normFile}::${normKind}::${String(symbolName).trim()}`;
  },
  test(repoFullName, filePath, testName) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const normFile = normalizePath(filePath);
    return `${repoKey}::test::${normFile}::${slugify(testName)}`;
  },
  commit(repoFullName, sha) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    const cleanSha = String(sha || '').trim().toLowerCase();
    return `${repoKey}::commit::${cleanSha}`;
  },
  bug(repoFullName, keyOrTitle) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::bug::${slugify(keyOrTitle)}`;
  },
  fix(repoFullName, keyOrSummary) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::fix::${slugify(keyOrSummary)}`;
  },
  decision(repoFullName, keyOrTitle) {
    const repoKey = normalizePath(repoFullName).toLowerCase();
    return `${repoKey}::decision::${slugify(keyOrTitle)}`;
  }
};

export const SCHEMA_CONSTRAINTS = [
  'CREATE CONSTRAINT repo_id_unique IF NOT EXISTS FOR (r:Repository) REQUIRE r.id IS UNIQUE',
  'CREATE CONSTRAINT file_id_unique IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE',
  'CREATE CONSTRAINT component_id_unique IF NOT EXISTS FOR (c:Component) REQUIRE c.id IS UNIQUE',
  'CREATE CONSTRAINT symbol_id_unique IF NOT EXISTS FOR (s:Symbol) REQUIRE s.id IS UNIQUE',
  'CREATE CONSTRAINT commit_id_unique IF NOT EXISTS FOR (cm:Commit) REQUIRE cm.id IS UNIQUE',
  'CREATE CONSTRAINT bug_id_unique IF NOT EXISTS FOR (b:Bug) REQUIRE b.id IS UNIQUE',
  'CREATE CONSTRAINT fix_id_unique IF NOT EXISTS FOR (fx:Fix) REQUIRE fx.id IS UNIQUE',
  'CREATE CONSTRAINT decision_id_unique IF NOT EXISTS FOR (d:TechnicalDecision) REQUIRE d.id IS UNIQUE',
  'CREATE CONSTRAINT test_id_unique IF NOT EXISTS FOR (t:Test) REQUIRE t.id IS UNIQUE'
];

export const SCHEMA_INDEXES = [
  'CREATE INDEX file_repo_idx IF NOT EXISTS FOR (f:File) ON (f.repoFullName)',
  'CREATE INDEX component_repo_idx IF NOT EXISTS FOR (c:Component) ON (c.repoFullName)',
  'CREATE INDEX symbol_repo_idx IF NOT EXISTS FOR (s:Symbol) ON (s.repoFullName)',
  'CREATE INDEX commit_repo_idx IF NOT EXISTS FOR (cm:Commit) ON (cm.repoFullName)',
  'CREATE INDEX bug_repo_idx IF NOT EXISTS FOR (b:Bug) ON (b.repoFullName)',
  'CREATE INDEX fix_repo_idx IF NOT EXISTS FOR (fx:Fix) ON (fx.repoFullName)',
  'CREATE INDEX decision_repo_idx IF NOT EXISTS FOR (d:TechnicalDecision) ON (d.repoFullName)',
  'CREATE INDEX test_repo_idx IF NOT EXISTS FOR (t:Test) ON (t.repoFullName)'
];

let schemaInitialized = false;

/**
 * Ensures Neo4j uniqueness constraints and property indexes exist. Safe and idempotent across invocations.
 */
export async function ensureGraphSchema(options = {}) {
  if (schemaInitialized && !options.force) {
    return { initialized: true, cached: true };
  }

  for (const statement of SCHEMA_CONSTRAINTS) {
    await runQuery(statement, {}, options);
  }
  for (const indexStmt of SCHEMA_INDEXES) {
    await runQuery(indexStmt, {}, options);
  }

  schemaInitialized = true;
  return {
    initialized: true,
    constraintsApplied: SCHEMA_CONSTRAINTS.length,
    indexesApplied: SCHEMA_INDEXES.length
  };
}

export function resetSchemaCacheForTesting() {
  schemaInitialized = false;
}
