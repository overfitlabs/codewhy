/**
 * Server-Side Neo4j Connection & Session Manager
 * - Maintains a single driver instance per application process (serverless-safe).
 * - Enforces parameterized Cypher queries, explicit database selection, and session cleanup.
 * - Never logs or returns credentials or sensitive connection details.
 */

import neo4j from 'neo4j-driver';

const VALID_PROTOCOLS = [
  'neo4j://',
  'neo4j+s://',
  'neo4j+ssc://',
  'bolt://',
  'bolt+s://',
  'bolt+ssc://'
];

let driverInstance = null;
let driverConfigSignature = null;

/**
 * Redacts any accidental credentials or sensitive tokens from error messages.
 */
export function sanitizeErrorMessage(message = '') {
  if (!message || typeof message !== 'string') return 'Unknown database error';
  let sanitized = message;

  const password = process.env.NEO4J_PASSWORD;
  if (password && password.trim().length > 0) {
    sanitized = sanitized.split(password).join('[REDACTED]');
  }

  // Redact user:pass@host patterns in URIs
  sanitized = sanitized.replace(/([a-zA-Z0-9+.-]+:\/\/)([^:@/\s]+):([^@/\s]+)@/g, '$1[REDACTED]:[REDACTED]@');
  return sanitized;
}

/**
 * Validates Neo4j environment configuration without exposing secrets.
 */
export function validateNeo4jConfig(env = process.env) {
  const uri = (env.NEO4J_URI || '').trim();
  const username = (env.NEO4J_USERNAME || '').trim();
  const password = (env.NEO4J_PASSWORD || '').trim();
  const database = (env.NEO4J_DATABASE || '').trim() || 'neo4j';
  const instanceName = (env.AURA_INSTANCENAME || '').trim() || null;

  const missing = [];
  const errors = [];

  if (!uri) missing.push('NEO4J_URI');
  if (!username) missing.push('NEO4J_USERNAME');
  if (!password) missing.push('NEO4J_PASSWORD');

  const configured = missing.length < 3;

  let protocol = null;
  if (uri) {
    const matchedProtocol = VALID_PROTOCOLS.find(p => uri.toLowerCase().startsWith(p));
    if (!matchedProtocol) {
      errors.push(
        `NEO4J_URI must start with a valid Neo4j protocol (${VALID_PROTOCOLS.join(', ')})`
      );
    } else {
      protocol = matchedProtocol.replace('://', '');
    }
  }

  if (missing.length > 0 && configured) {
    errors.push(`Missing required Neo4j environment variables: ${missing.join(', ')}`);
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    configured: missing.length === 0,
    partiallyConfigured: configured && missing.length > 0,
    missing,
    errors,
    database,
    protocol,
    instanceName
  };
}

/**
 * Returns the process-wide singleton Neo4j driver instance, or null if not configured.
 * Throws a descriptive error if partially/invalidly configured when `throwOnInvalid` is true.
 */
export function getDriver({ env = process.env, throwOnInvalid = false } = {}) {
  if (driverInstance && driverConfigSignature === 'test-override') {
    return driverInstance;
  }

  const validation = validateNeo4jConfig(env);
  if (!validation.valid) {
    if (throwOnInvalid) {
      const reason = validation.errors[0] || `Missing required variables: ${validation.missing.join(', ')}`;
      throw new Error(`Neo4j configuration invalid: ${reason}`);
    }
    return null;
  }

  const uri = env.NEO4J_URI.trim();
  const username = env.NEO4J_USERNAME.trim();
  const password = env.NEO4J_PASSWORD.trim();
  const signature = `${uri}|${username}|${validation.database}`;

  if (!driverInstance || driverConfigSignature !== signature) {
    driverInstance = neo4j.driver(
      uri,
      neo4j.auth.basic(username, password),
      {
        maxConnectionPoolSize: 25,
        connectionAcquisitionTimeout: 10000,
        connectionTimeout: 10000,
        maxConnectionLifetime: 30 * 60 * 1000, // 30 minutes for serverless friendliness
        disableLosslessIntegers: false
      }
    );
    driverConfigSignature = signature;
  }

  return driverInstance;
}

/**
 * Recursively converts Neo4j Integer instances and Node/Relationship structures into plain JS values.
 */
export function normalizeNeo4jValue(value) {
  if (value === null || value === undefined) return value;
  if (neo4j.isInt(value)) {
    return value.inSafeRange() ? value.toNumber() : value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeNeo4jValue);
  }
  if (typeof value === 'object') {
    // Neo4j Node or Relationship object
    if (value.properties && (value.labels || value.type)) {
      return normalizeNeo4jValue(value.properties);
    }
    const normalized = {};
    for (const [k, v] of Object.entries(value)) {
      normalized[k] = normalizeNeo4jValue(v);
    }
    return normalized;
  }
  return value;
}

/**
 * Executes a parameterized Cypher query against the configured Neo4j database.
 * Automatically opens and closes a session in a finally block.
 */
export async function runQuery(cypher, params = {}, options = {}) {
  if (!cypher || typeof cypher !== 'string') {
    throw new Error('A valid Cypher query string is required.');
  }
  if (params === null || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('Cypher parameters must be a plain object.');
  }

  const env = options.env || process.env;
  const validation = validateNeo4jConfig(env);
  const activeDriver = getDriver({ env, throwOnInvalid: true });

  const database = options.database || validation.database || 'neo4j';
  const accessMode = options.accessMode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE;

  const session = activeDriver.session({
    database,
    defaultAccessMode: accessMode
  });

  try {
    const result = await session.run(cypher, params);
    const records = (result.records || []).map(record => {
      const obj = record.toObject ? record.toObject() : {};
      return normalizeNeo4jValue(obj);
    });
    return {
      records,
      summary: result.summary || null
    };
  } catch (err) {
    const safeMsg = sanitizeErrorMessage(err.message);
    const wrapped = new Error(`Neo4j query failed: ${safeMsg}`);
    wrapped.code = err.code || 'NEO4J_QUERY_ERROR';
    throw wrapped;
  } finally {
    await session.close();
  }
}

/**
 * Checks Neo4j connectivity without exposing credentials or sensitive host data.
 */
export async function checkNeo4jHealth(env = process.env) {
  const validation = validateNeo4jConfig(env);

  if (driverInstance && driverConfigSignature === 'test-override') {
    let session;
    try {
      session = driverInstance.session({
        database: validation.database || 'neo4j',
        defaultAccessMode: neo4j.session.READ
      });
      await session.run('RETURN 1 AS ok', {});
      return {
        connected: true,
        configured: true,
        status: 'connected',
        database: validation.database || 'neo4j',
        protocol: validation.protocol || 'bolt',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        connected: false,
        configured: true,
        status: 'error',
        database: validation.database || 'neo4j',
        error: sanitizeErrorMessage(err.message),
        timestamp: new Date().toISOString()
      };
    } finally {
      if (session) await session.close();
    }
  }

  if (!validation.valid) {
    return {
      connected: false,
      configured: validation.configured,
      status: validation.partiallyConfigured ? 'invalid_config' : 'unconfigured',
      database: validation.database,
      missing: validation.missing,
      errors: validation.errors,
      timestamp: new Date().toISOString()
    };
  }

  let session = null;
  try {
    const activeDriver = getDriver({ env, throwOnInvalid: true });
    session = activeDriver.session({
      database: validation.database,
      defaultAccessMode: neo4j.session.READ
    });
    await session.run('RETURN 1 AS ok', {});

    return {
      connected: true,
      configured: true,
      status: 'connected',
      database: validation.database,
      protocol: validation.protocol,
      instanceName: validation.instanceName,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      connected: false,
      configured: true,
      status: 'unreachable',
      database: validation.database,
      protocol: validation.protocol,
      error: sanitizeErrorMessage(err.message),
      timestamp: new Date().toISOString()
    };
  } finally {
    if (session) {
      await session.close();
    }
  }
}

/**
 * Closes the singleton driver cleanly (for process shutdown or test teardown).
 */
export async function closeDriver() {
  if (driverInstance) {
    const current = driverInstance;
    driverInstance = null;
    driverConfigSignature = null;
    await current.close();
  }
}

/**
 * Test helper: inject a mock driver for unit tests.
 */
export function setDriverForTesting(mockDriver) {
  driverInstance = mockDriver;
  driverConfigSignature = mockDriver ? 'test-override' : null;
}

export { neo4j };
