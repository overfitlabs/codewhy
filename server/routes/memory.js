import express from 'express';
import { checkNeo4jHealth, validateNeo4jConfig, sanitizeErrorMessage } from '../db/neo4j.js';
import {
  recordProjectMemoryEntry,
  retrieveGraphContextForQuestion,
  getRepositoryMemoryOverview
} from '../memory/retrieval.js';
import { ingestRepositoryAnalysis } from '../memory/ingestion.js';

export const memoryRouter = express.Router();

/**
 * Middleware for protected health check when HEALTH_CHECK_TOKEN is configured.
 * Always strips any sensitive fields from the response.
 */
export async function handleNeo4jHealthCheck(req, res) {
  const expectedToken = (process.env.HEALTH_CHECK_TOKEN || '').trim();
  if (expectedToken) {
    const providedToken = String(req.headers['x-health-token'] || '').trim();
    if (providedToken !== expectedToken) {
      return res.status(401).json({
        status: 'unauthorized',
        error: 'Valid x-health-token header is required.'
      });
    }
  }

  const health = await checkNeo4jHealth();

  // Strictly return non-sensitive connection metadata (never return URI, username, password, or raw DB id)
  const safeResponse = {
    connected: Boolean(health.connected),
    configured: Boolean(health.configured),
    status: health.status,
    protocol: health.protocol || null,
    instanceName: health.instanceName || null,
    timestamp: health.timestamp
  };

  if (health.missing && health.missing.length > 0) {
    safeResponse.missing = health.missing;
  }
  if (health.errors && health.errors.length > 0) {
    safeResponse.errors = health.errors;
  }
  if (health.error) {
    safeResponse.error = sanitizeErrorMessage(health.error);
  }

  const statusCode = health.connected ? 200 : health.configured ? 503 : 200;
  return res.status(statusCode).json(safeResponse);
}

memoryRouter.get('/health', handleNeo4jHealthCheck);

/**
 * GET /api/memory/overview?repo=owner/repo
 * Retrieves complete Project Memory overview, counts, stored records, provenance, and interactive graph subgraph.
 */
memoryRouter.get('/overview', async (req, res) => {
  try {
    const repo = String(req.query.repo || '').trim();
    const query = String(req.query.q || '').trim();

    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ error: 'Query parameter "repo" (owner/repo) is required.' });
    }

    const overview = await getRepositoryMemoryOverview(repo, { query });
    return res.json(overview);
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err.message) });
  }
});

/**
 * POST /api/memory/record
 * Records a Bug + Fix (+ Component/File/Commit) or TechnicalDecision in Neo4j Project Memory.
 */
memoryRouter.post('/record', async (req, res) => {
  try {
    const validation = validateNeo4jConfig();
    if (!validation.valid) {
      return res.status(503).json({
        error: 'Neo4j Project Memory is not configured. Please set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD.'
      });
    }

    const result = await recordProjectMemoryEntry(req.body);
    return res.status(201).json(result);
  } catch (err) {
    const safeMsg = sanitizeErrorMessage(err.message);
    const status = safeMsg.includes('required') || safeMsg.includes('valid') ? 400 : 500;
    return res.status(status).json({ error: safeMsg });
  }
});

/**
 * GET /api/memory/context?repo=owner/repo&q=debugging+question
 * Retrieves bugs, fixes, technical decisions, component dependencies, symbols, and commits from Neo4j.
 */
memoryRouter.get('/context', async (req, res) => {
  try {
    const repo = String(req.query.repo || '').trim();
    const question = String(req.query.q || '').trim();

    if (!repo || !repo.includes('/')) {
      return res.status(400).json({ error: 'Query parameter "repo" (owner/repo) is required.' });
    }

    const context = await retrieveGraphContextForQuestion(repo, question);
    return res.json(context);
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err.message) });
  }
});

/**
 * POST /api/memory/ingest
 * Explicitly ingests or re-ingests an analysis payload into Neo4j Project Memory.
 */
memoryRouter.post('/ingest', async (req, res) => {
  try {
    const { analysis, sourceContents, commits } = req.body || {};
    if (!analysis || !analysis.repository?.fullName) {
      return res.status(400).json({ error: 'Valid repository analysis object is required.' });
    }

    const validation = validateNeo4jConfig();
    if (!validation.valid) {
      return res.status(503).json({
        error: 'Neo4j Project Memory is not configured. Please set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD.'
      });
    }

    const result = await ingestRepositoryAnalysis(analysis, {
      sourceContents,
      commits
    });

    if (!result.ingested) {
      return res.status(503).json(result);
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: sanitizeErrorMessage(err.message) });
  }
});
