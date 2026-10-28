import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { analyzeRouter } from './routes/analyze.js';
import { aiRouter } from './routes/ai.js';
import { memoryRouter, handleNeo4jHealthCheck } from './routes/memory.js';
import { codewhyRouter } from './codewhy/routes/codewhy.js';
import { voiceRouter } from './codewhy/routes/voice.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

const defaultBodyLimit = () => process.env.JSON_BODY_LIMIT || '256kb';
const aiBodyLimit = () => process.env.AI_BODY_LIMIT || '1mb';

// Apply a configurable larger limit specifically to AI, voice, and ingestion routes
app.use('/api/ai', (req, res, next) => express.json({ limit: aiBodyLimit() })(req, res, next));
app.use('/api/memory/ingest', (req, res, next) => express.json({ limit: aiBodyLimit() })(req, res, next));
app.use('/api/v1/evidence/ingest-slice', (req, res, next) => express.json({ limit: aiBodyLimit() })(req, res, next));
app.use('/api/v1/voice', (req, res, next) => express.json({ limit: '10mb' })(req, res, next));
app.use((req, res, next) => express.json({ limit: defaultBodyLimit() })(req, res, next));

// API Routes
app.use('/api', analyzeRouter);
app.use('/api/ai', aiRouter);
app.use('/api/memory', memoryRouter);
app.use('/api/v1', codewhyRouter);
app.use('/api/v1/voice', voiceRouter);
app.use('/api/codewhy', codewhyRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CodeWhy Rationale Engine',
    version: '1.0.0-mvp',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health/neo4j', handleNeo4jHealthCheck);

// Structured JSON error handler for PayloadTooLargeError (413) and malformed JSON (400)
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
    return res.status(413).json({
      available: false,
      code: 'PAYLOAD_TOO_LARGE',
      error:
        'Request payload exceeds the maximum allowed size. Send a compact analysis payload without the full file tree.',
      limit: err.limit || null,
      length: err.length || null
    });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      available: false,
      code: 'INVALID_JSON',
      error: 'Malformed JSON request body.'
    });
  }
  return next(err);
});

// Serve static frontend files in production if dist exists
const distPath = path.join(__dirname, '../dist');
const indexPath = path.join(distPath, 'index.html');
app.use(express.static(distPath));

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  }

  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  return res.status(503).type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>CodeWhy - Production Build Required</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { max-width: 580px; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 32px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
    h1 { color: #58a6ff; font-size: 20px; margin-top: 0; }
    p { font-size: 14px; line-height: 1.6; color: #8b949e; }
    code { background: #21262d; color: #f0f6fc; padding: 3px 8px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
    pre { background: #21262d; color: #7ee787; padding: 12px 16px; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="card">
    <h1>CodeWhy: Production Frontend Build Required</h1>
    <p>The backend API is running on port ${PORT}, but the client production bundle has not been generated (<code>dist/index.html</code> was not found).</p>
    <p><strong>To run in production mode:</strong></p>
    <pre>npm run build\nnode server/index.js</pre>
    <p><strong>To run in development mode (with hot reloading):</strong></p>
    <pre>npm run dev</pre>
    <p><em>API health check is active at <a href="/api/health" style="color: #58a6ff;">/api/health</a>.</em></p>
  </div>
</body>
</html>`);
});

const isMainModule =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === __filename;

if (process.env.VERCEL !== '1' && isMainModule) {
  app.listen(PORT, () => {
    console.log(`[CodeWhy] Server running on http://localhost:${PORT}`);
  });
}

export default app;
