/**
 * CodeWhy General-Purpose GitHub Repository Indexer
 * 
 * Implements bounded, rate-limit-safe historical evidence indexing for arbitrary public GitHub repositories:
 * - Commits & diff intent
 * - Pull requests with maintainer rationale
 * - Issues with problem context and consensus
 * - Architecture Decision Records (ADRs) and package manifests
 * 
 * Enforces:
 * 1. Truthful provenance: never fabricates commits, PRs, issues, or links.
 * 2. Safe bounds: pagination limits to prevent rate-limit exhaustion.
 * 3. Idempotent ingestion: incremental re-indexing without duplicate graph nodes.
 * 4. Transparent durability: accurately labels Neo4j vs non-durable in-memory fallback.
 */

import { ingestSliceToGraph, inMemoryGraph } from '../graph/adapter.js';
import { checkNeo4jHealth } from '../../db/neo4j.js';

// Global in-memory index state registry: repoId -> state
const indexingRegistry = new Map();

/**
 * Normalizes repository identity from various formats:
 * - 'owner/repo'
 * - 'https://github.com/owner/repo'
 * - 'https://github.com/owner/repo.git'
 * - 'https://github.com/owner/repo/tree/branch'
 * - 'git@github.com:owner/repo.git'
 */
export function normalizeGitHubRepo(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Repository parameter must be a non-empty string.');
  }

  let clean = input.trim();
  clean = clean.replace(/\.git$/i, '');
  clean = clean.replace(/\/+$/, '');

  let owner = '';
  let name = '';
  let branch = null;

  // Handle git@github.com:owner/repo
  const sshMatch = clean.match(/^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/i);
  if (sshMatch) {
    owner = sshMatch[1];
    name = sshMatch[2];
  } else {
    // Strip protocol and domain if present
    const urlMatch = clean.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/tree\/([a-zA-Z0-9_.-]+))?/i);
    if (urlMatch) {
      owner = urlMatch[1];
      name = urlMatch[2];
      branch = urlMatch[3] || null;
    } else {
      // Direct owner/repo format
      const shortMatch = clean.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
      if (shortMatch) {
        owner = shortMatch[1];
        name = shortMatch[2];
      } else {
        throw new Error(`Invalid repository format "${input}". Expected "owner/repo" or "https://github.com/owner/repo".`);
      }
    }
  }

  const fullName = `${owner}/${name}`;
  return {
    owner,
    name,
    fullName,
    id: fullName,
    branch,
    url: `https://github.com/${fullName}`
  };
}

/**
 * Retrieves the current indexing state for a repository.
 */
export function getIndexingStatus(repoFullName) {
  const norm = (repoFullName || '').toLowerCase();
  
  // Return recorded status if exists
  for (const [key, state] of indexingRegistry.entries()) {
    if (key.toLowerCase() === norm) {
      return state;
    }
  }

  // Check if repository already has nodes in inMemoryGraph
  const repoNode = inMemoryGraph.getNode(repoFullName);
  const commits = inMemoryGraph.findNodesByLabel('Commit').filter(c => c.repository === repoFullName);
  const pullRequests = inMemoryGraph.findNodesByLabel('PullRequest').filter(p => p.repository === repoFullName);
  const issues = inMemoryGraph.findNodesByLabel('Issue').filter(i => i.repository === repoFullName);
  const adrs = inMemoryGraph.findNodesByLabel('ADR').filter(a => a.repository === repoFullName || a.id.startsWith(repoFullName));
  const fileNodes = inMemoryGraph.findNodesByLabel('File').filter(f => f.repository === repoFullName || f.id.startsWith(`${repoFullName}:`));

  if (repoNode && repoNode.sourceMode !== 'unindexed_repository' && (commits.length > 0 || adrs.length > 0 || pullRequests.length > 0)) {
    return {
      repository: repoFullName,
      status: 'READY',
      progress: 100,
      stage: 'Indexing complete',
      counts: {
        commits: commits.length,
        pullRequests: pullRequests.length,
        issues: issues.length,
        adrs: adrs.length,
        manifests: inMemoryGraph.findNodesByLabel('Manifest').filter(m => m.id.startsWith(repoFullName)).length,
        files: fileNodes.length
      },
      categories: {
        commits: { indexed: commits.length > 0, count: commits.length, status: commits.length > 0 ? 'complete' : 'empty' },
        pullRequests: { indexed: pullRequests.length > 0, count: pullRequests.length, status: pullRequests.length > 0 ? 'complete' : 'empty' },
        issues: { indexed: issues.length > 0, count: issues.length, status: issues.length > 0 ? 'complete' : 'empty' },
        adrs: { indexed: adrs.length > 0, count: adrs.length, status: adrs.length > 0 ? 'complete' : 'none_found' },
        manifests: { indexed: true, count: 1, status: 'complete' },
        files: { indexed: fileNodes.length > 0, count: fileNodes.length, status: fileNodes.length > 0 ? 'complete' : 'none_found' }
      },
      storageMode: repoNode.storageMode || (repoNode.isDurable ? 'neo4j_active' : (repoNode.sourceMode === 'verified_fixture' ? 'verified_fixture' : 'in_memory_verified_fallback')),
      storageLabel: repoNode.storageLabel || (repoNode.isDurable || repoNode.storageMode === 'neo4j_active' ? 'Neo4j Persistent Graph' : 'In-Memory Store (Non-durable, in-process)'),
      isDurable: Boolean(repoNode.isDurable || repoNode.storageMode === 'neo4j_active'),
      error: null,
      lastIndexedAt: new Date().toISOString()
    };
  }

  return {
    repository: repoFullName,
    status: 'IDLE',
    progress: 0,
    stage: 'Not yet indexed',
    counts: { commits: 0, pullRequests: 0, issues: 0, adrs: 0, manifests: 0, files: 0 },
    categories: {
      commits: { indexed: false, count: 0, status: 'pending' },
      pullRequests: { indexed: false, count: 0, status: 'pending' },
      issues: { indexed: false, count: 0, status: 'pending' },
      adrs: { indexed: false, count: 0, status: 'pending' },
      manifests: { indexed: false, count: 0, status: 'pending' },
      files: { indexed: false, count: 0, status: 'pending' }
    },
    storageMode: 'unindexed_repository',
    storageLabel: 'Unindexed',
    isDurable: false,
    error: null,
    lastIndexedAt: null
  };
}

/**
 * Updates in-memory indexing registry.
 */
function updateRegistry(repoFullName, updates) {
  const current = indexingRegistry.get(repoFullName) || {
    repository: repoFullName,
    status: 'IDLE',
    progress: 0,
    counts: { commits: 0, pullRequests: 0, issues: 0, adrs: 0, manifests: 0, files: 0 },
    categories: {
      commits: { indexed: false, count: 0, status: 'pending' },
      pullRequests: { indexed: false, count: 0, status: 'pending' },
      issues: { indexed: false, count: 0, status: 'pending' },
      adrs: { indexed: false, count: 0, status: 'pending' },
      manifests: { indexed: false, count: 0, status: 'pending' },
      files: { indexed: false, count: 0, status: 'pending' }
    },
    error: null
  };

  const updated = {
    ...current,
    ...updates,
    counts: {
      ...(current.counts || {}),
      ...(updates.counts || {})
    },
    categories: {
      ...(current.categories || {}),
      ...(updates.categories || {})
    }
  };

  indexingRegistry.set(repoFullName, updated);
  return updated;
}

/**
 * Performs bounded, safe fetching of historical engineering evidence from GitHub.
 * Allows custom fetchFn for deterministic offline testing.
 */
export async function fetchLiveRepositoryEvidence(repoMeta, options = {}) {
  const {
    githubToken = process.env.GITHUB_TOKEN,
    fetchFn = globalThis.fetch,
    commitLimit = 25,
    prLimit = 15,
    issueLimit = 15
  } = options;

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'CodeWhy-Evidence-Indexer/1.0'
  };
  if (githubToken && githubToken.trim()) {
    headers['Authorization'] = `token ${githubToken.trim()}`;
  }

  const { owner, name, fullName, branch } = repoMeta;
  const categories = {
    commits: { indexed: false, count: 0, status: 'pending' },
    pullRequests: { indexed: false, count: 0, status: 'pending' },
    issues: { indexed: false, count: 0, status: 'pending' },
    adrs: { indexed: false, count: 0, status: 'pending' },
    manifests: { indexed: false, count: 0, status: 'pending' },
    files: { indexed: false, count: 0, status: 'pending' }
  };

  let rateLimitInfo = { remaining: null, limit: null, resetAt: null };

  const extractRateLimits = (res) => {
    if (!res || !res.headers) return;
    const remaining = res.headers.get ? res.headers.get('x-ratelimit-remaining') : res.headers['x-ratelimit-remaining'];
    const limit = res.headers.get ? res.headers.get('x-ratelimit-limit') : res.headers['x-ratelimit-limit'];
    const reset = res.headers.get ? res.headers.get('x-ratelimit-reset') : res.headers['x-ratelimit-reset'];
    if (remaining !== null && remaining !== undefined) {
      rateLimitInfo = {
        remaining: parseInt(remaining, 10),
        limit: parseInt(limit, 10),
        resetAt: reset ? new Date(parseInt(reset, 10) * 1000).toISOString() : null
      };
    }
  };

  // 1. Fetch Repository Metadata & Verify Accessibility
  const repoRes = await fetchFn(`https://api.github.com/repos/${owner}/${name}`, { headers });
  extractRateLimits(repoRes);

  if (!repoRes.ok) {
    if (repoRes.status === 404) {
      throw new Error(`Repository "${fullName}" was not found or is private.`);
    }
    if (repoRes.status === 403 || repoRes.status === 429) {
      throw new Error(`GitHub API rate limit exceeded (${repoRes.status}). Please configure GITHUB_TOKEN or wait for reset.`);
    }
    throw new Error(`GitHub API error (${repoRes.status}): ${repoRes.statusText || 'Inaccessible repository'}`);
  }

  const repoInfo = await repoRes.json();
  const defaultBranch = branch || repoInfo.default_branch || 'main';

  // 2. Fetch Recent Commits (Bounded pagination)
  let commits = [];
  try {
    const commitsRes = await fetchFn(
      `https://api.github.com/repos/${owner}/${name}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=${commitLimit}`,
      { headers }
    );
    extractRateLimits(commitsRes);

    if (commitsRes.ok) {
      const rawCommits = await commitsRes.json();
      if (Array.isArray(rawCommits)) {
        commits = rawCommits.map(c => {
          const sha = c.sha;
          const msg = c.commit?.message || '';
          const firstLine = msg.split('\n')[0];
          return {
            id: `${fullName}:commit:${sha}`,
            sha,
            shortSha: sha.slice(0, 7),
            url: c.html_url || `https://github.com/${fullName}/commit/${sha}`,
            author: c.commit?.author?.name || c.author?.login || 'Unknown',
            authorLogin: c.author?.login || null,
            date: c.commit?.author?.date || c.commit?.committer?.date || new Date().toISOString(),
            message: msg,
            intent: firstLine,
            files: (c.files || []).map(f => f.filename),
            patchExcerpt: c.files?.[0]?.patch?.slice(0, 500) || firstLine
          };
        });
        categories.commits = { indexed: true, count: commits.length, status: commits.length > 0 ? 'complete' : 'empty' };
      }
    } else {
      categories.commits = { indexed: false, count: 0, status: `failed_status_${commitsRes.status}` };
    }
  } catch (err) {
    categories.commits = { indexed: false, count: 0, status: `error: ${err.message}` };
  }

  // 3. Fetch Pull Requests with Rationale (Bounded pagination)
  let pullRequests = [];
  try {
    const prRes = await fetchFn(
      `https://api.github.com/repos/${owner}/${name}/pulls?state=all&sort=updated&direction=desc&per_page=${prLimit}`,
      { headers }
    );
    extractRateLimits(prRes);

    if (prRes.ok) {
      const rawPRs = await prRes.json();
      if (Array.isArray(rawPRs)) {
        pullRequests = rawPRs.map(pr => ({
          id: `${fullName}:pull:${pr.number}`,
          number: pr.number,
          url: pr.html_url || `https://github.com/${fullName}/pull/${pr.number}`,
          title: pr.title || `PR #${pr.number}`,
          author: pr.user?.login || 'Unknown',
          createdAt: pr.created_at,
          closedAt: pr.closed_at,
          mergedAt: pr.merged_at,
          mergeCommitSha: pr.merge_commit_sha,
          body: pr.body || '',
          verbatimExcerpt: (pr.body || pr.title || '').slice(0, 400)
        }));
        categories.pullRequests = { indexed: true, count: pullRequests.length, status: pullRequests.length > 0 ? 'complete' : 'empty' };
      }
    } else {
      categories.pullRequests = { indexed: false, count: 0, status: `failed_status_${prRes.status}` };
    }
  } catch (err) {
    categories.pullRequests = { indexed: false, count: 0, status: `error: ${err.message}` };
  }

  // 4. Fetch Issues (Bounded pagination, excluding PRs)
  let issues = [];
  try {
    const issuesRes = await fetchFn(
      `https://api.github.com/repos/${owner}/${name}/issues?state=all&sort=updated&direction=desc&per_page=${issueLimit}`,
      { headers }
    );
    extractRateLimits(issuesRes);

    if (issuesRes.ok) {
      const rawIssues = await issuesRes.json();
      if (Array.isArray(rawIssues)) {
        // Filter out pull requests which GitHub includes in issues endpoint
        const pureIssues = rawIssues.filter(item => !item.pull_request);
        issues = pureIssues.map(iss => ({
          id: `${fullName}:issue:${iss.number}`,
          number: iss.number,
          url: iss.html_url || `https://github.com/${fullName}/issues/${iss.number}`,
          title: iss.title || `Issue #${iss.number}`,
          author: iss.user?.login || 'Unknown',
          createdAt: iss.created_at,
          closedAt: iss.closed_at,
          state: iss.state,
          body: iss.body || '',
          verbatimExcerpt: (iss.body || iss.title || '').slice(0, 400)
        }));
        categories.issues = { indexed: true, count: issues.length, status: issues.length > 0 ? 'complete' : 'empty' };
      }
    } else {
      categories.issues = { indexed: false, count: 0, status: `failed_status_${issuesRes.status}` };
    }
  } catch (err) {
    categories.issues = { indexed: false, count: 0, status: `error: ${err.message}` };
  }

  // 5. Scan for Architecture Decision Records (ADRs) or Technical Decisions
  let adrs = [];
  const candidateAdrPaths = [
    'docs/adr',
    'docs/architecture-decisions',
    'docs/decisions',
    'doc/adr',
    'doc/architecture-decisions',
    'adr'
  ];

  for (const adrPath of candidateAdrPaths) {
    try {
      const adrRes = await fetchFn(
        `https://api.github.com/repos/${owner}/${name}/contents/${adrPath}?ref=${encodeURIComponent(defaultBranch)}`,
        { headers }
      );
      if (adrRes.ok) {
        const adrList = await adrRes.json();
        if (Array.isArray(adrList)) {
          const mdFiles = adrList.filter(f => f.name.endsWith('.md') && f.type === 'file').slice(0, 10);
          for (const adrFile of mdFiles) {
            let excerpt = '';
            // Fetch content directly from raw URL
            try {
              const rawRes = await fetchFn(
                `https://raw.githubusercontent.com/${owner}/${name}/${defaultBranch}/${adrFile.path}`
              );
              if (rawRes.ok) {
                const text = await rawRes.text();
                excerpt = text.slice(0, 500);
              }
            } catch {
              excerpt = `Architecture decision document at ${adrFile.path}`;
            }

            const slug = adrFile.name.replace(/\.md$/, '');
            adrs.push({
              id: `${fullName}:adr:${slug}`,
              slug,
              title: slug.replace(/[-_]/g, ' '),
              path: adrFile.path,
              url: `https://github.com/${fullName}/blob/${defaultBranch}/${adrFile.path}`,
              author: 'Maintainers',
              date: new Date().toISOString(),
              verbatimExcerpt: excerpt,
              contextExcerpt: excerpt
            });
          }
          if (adrs.length > 0) break; // Found ADR directory
        }
      }
    } catch {
      // Soft-fail on ADR probe
    }
  }

  categories.adrs = {
    indexed: true,
    count: adrs.length,
    status: adrs.length > 0 ? 'complete' : 'none_found'
  };

  // 6. Fetch Package Manifest & README
  const manifestArtifacts = [];
  const candidateManifests = ['package.json', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'requirements.txt', 'README.md'];
  for (const mPath of candidateManifests) {
    try {
      const rawRes = await fetchFn(
        `https://raw.githubusercontent.com/${owner}/${name}/${defaultBranch}/${mPath}`
      );
      if (rawRes.ok) {
        const content = await rawRes.text();
        manifestArtifacts.push({
          id: `${fullName}:manifest:${mPath}`,
          path: mPath,
          type: 'manifest',
          title: `${name} ${mPath}`,
          url: `https://github.com/${fullName}/blob/${defaultBranch}/${mPath}`,
          author: 'Maintainers',
          timestamp: new Date().toISOString(),
          verbatimExcerpt: content.slice(0, 600),
          fileLocation: { path: mPath }
        });
      }
    } catch {
      // Soft-fail
    }
  }

  categories.manifests = {
    indexed: manifestArtifacts.length > 0,
    count: manifestArtifacts.length,
    status: manifestArtifacts.length > 0 ? 'complete' : 'empty'
  };

  // 7. Fetch Repository Source Files (Bounded Git Trees API)
  let files = [];
  try {
    const treeRes = await fetchFn(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
      { headers }
    );
    extractRateLimits(treeRes);

    if (treeRes.ok) {
      const treeData = await treeRes.json();
      if (Array.isArray(treeData?.tree)) {
        const ignoredExtensions = new Set([
          '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot',
          '.zip', '.tar', '.gz', '.pdf', '.exe', '.dll', '.so', '.dylib', '.map', '.wasm',
          '.mp4', '.mp3', '.lock'
        ]);
        const ignoredNames = new Set([
          'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'go.sum', 'composer.lock'
        ]);
        const ignoredDirs = [
          'node_modules/', '.git/', 'dist/', 'build/', '.next/', 'vendor/', 'coverage/', '.github/', '.cache/'
        ];

        const eligible = treeData.tree.filter(item => {
          if (item.type !== 'blob') return false;
          const p = item.path || '';
          if (ignoredDirs.some(d => p.startsWith(d) || p.includes('/' + d))) return false;
          const fname = p.split('/').pop();
          if (ignoredNames.has(fname)) return false;
          // Skip oversized files (> 500KB)
          if (item.size && item.size > 500000) return false;
          const dotIdx = fname.lastIndexOf('.');
          if (dotIdx !== -1) {
            const ext = fname.slice(dotIdx).toLowerCase();
            if (ignoredExtensions.has(ext)) return false;
          }
          return true;
        });

        // Bounded to top 120 eligible source files
        files = eligible.slice(0, 120).map(item => {
          const fileName = item.path.split('/').pop();
          const dotIdx = fileName.lastIndexOf('.');
          const ext = dotIdx !== -1 ? fileName.slice(dotIdx).toLowerCase() : '';
          return {
            id: `${fullName}:file:${item.path}`,
            path: item.path,
            name: fileName,
            extension: ext,
            size: item.size || 0,
            sha: item.sha,
            url: `https://github.com/${fullName}/blob/${defaultBranch}/${item.path}`,
            repository: fullName
          };
        });

        categories.files = {
          indexed: files.length > 0,
          count: files.length,
          status: files.length > 0 ? 'complete' : 'none_found'
        };
      } else {
        categories.files = { indexed: false, count: 0, status: 'empty_tree' };
      }
    } else {
      categories.files = {
        indexed: false,
        count: 0,
        status: treeRes.status === 404 ? 'none_found' : (treeRes.status === 403 || treeRes.status === 429 ? 'rate_limited' : `failed_status_${treeRes.status}`)
      };
    }
  } catch (err) {
    categories.files = { indexed: false, count: 0, status: `error: ${err.message}` };
  }

  return {
    sourceMode: 'live_github',
    repository: {
      id: fullName,
      owner,
      name,
      fullName,
      url: repoInfo.html_url || `https://github.com/${fullName}`,
      defaultBranch,
      description: repoInfo.description || '',
      stars: repoInfo.stargazers_count || 0,
      openIssues: repoInfo.open_issues_count || 0
    },
    targetEntity: {
      file: manifestArtifacts[0]?.path || files[0]?.path || 'package.json',
      symbols: []
    },
    commits,
    pullRequests,
    issues,
    adrs,
    files,
    decisions: [],
    manifestArtifacts,
    categories,
    rateLimitInfo
  };
}

/**
 * Builds authentic, evidence-backed cross-entity links without fabrication.
 */
export function linkEvidenceGraph(sliceData) {
  const { repository, commits = [], pullRequests = [], issues = [], adrs = [] } = sliceData;
  const repoId = repository.id || `${repository.owner}/${repository.name}`;
  const createdLinks = [];

  const issueByNum = new Map(issues.map(i => [i.number, i.id]));
  const prByNum = new Map(pullRequests.map(p => [p.number, p.id]));

  // 1. Link Commits to Issues & PRs based on authentic commit message syntax
  for (const c of commits) {
    const msg = c.message || '';
    
    // Check for "fixes #123", "closes #123", "resolves #123"
    const issueMatches = msg.matchAll(/(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi);
    for (const match of issueMatches) {
      const num = parseInt(match[1], 10);
      const targetIssueId = issueByNum.get(num) || `${repoId}:issue:${num}`;
      inMemoryGraph.addEdge(c.id, targetIssueId, 'RESOLVES', { evidence: match[0] });
      createdLinks.push({ source: c.id, target: targetIssueId, type: 'RESOLVES', evidence: match[0] });
    }

    // Check for PR merges: "Merge pull request #123" or "(#123)"
    const prMatches = msg.matchAll(/(?:merge pull request #|pull\/|\(#)(\d+)\)?/gi);
    for (const match of prMatches) {
      const num = parseInt(match[1], 10);
      const targetPrId = prByNum.get(num) || `${repoId}:pull:${num}`;
      inMemoryGraph.addEdge(c.id, targetPrId, 'MERGES_PR', { evidence: match[0] });
      createdLinks.push({ source: c.id, target: targetPrId, type: 'MERGES_PR', evidence: match[0] });
    }
  }

  // 2. Link Pull Requests to Issues mentioned in PR body
  for (const pr of pullRequests) {
    const body = pr.body || '';
    const issueMatches = body.matchAll(/(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)\s+#(\d+)/gi);
    for (const match of issueMatches) {
      const num = parseInt(match[1], 10);
      const targetIssueId = issueByNum.get(num) || `${repoId}:issue:${num}`;
      inMemoryGraph.addEdge(pr.id, targetIssueId, 'CLOSES_ISSUE', { evidence: match[0] });
      createdLinks.push({ source: pr.id, target: targetIssueId, type: 'CLOSES_ISSUE', evidence: match[0] });
    }
  }

  // 3. Link ADR supersession if mentioned in ADR text
  for (const adr of adrs) {
    const text = (adr.verbatimExcerpt || '').toLowerCase();
    const supersedesMatch = text.match(/supersedes\s+\[?(adr[-_0-9a-z]+)\]?/i);
    if (supersedesMatch) {
      const targetSlug = supersedesMatch[1].toLowerCase().replace(/[-_]/g, '-');
      const targetAdr = adrs.find(a => (a.slug || a.id?.split(':').pop() || a.title || '').toLowerCase().replace(/[-_]/g, '-') === targetSlug);
      if (targetAdr) {
        inMemoryGraph.addEdge(adr.id, targetAdr.id, 'SUPERSEDES', { notice: supersedesMatch[0] });
        inMemoryGraph.addEdge(targetAdr.id, adr.id, 'SUPERSEDED_BY', { notice: supersedesMatch[0] });
        createdLinks.push({ source: adr.id, target: targetAdr.id, type: 'SUPERSEDES', notice: supersedesMatch[0] });
      }
    }
  }

  // 4. Link Commits to Files based on commit diff files
  for (const c of commits) {
    for (const filePath of (c.files || [])) {
      const fileId = `${repoId}:file:${filePath}`;
      if (inMemoryGraph.getNode(fileId)) {
        inMemoryGraph.addEdge(c.id, fileId, 'COMMIT_CHANGED_FILE', { evidence: 'Commit diff' });
        createdLinks.push({ source: c.id, target: fileId, type: 'COMMIT_CHANGED_FILE' });
      }
    }
  }

  return createdLinks;
}

/**
 * End-to-end indexing orchestrator for arbitrary GitHub repositories.
 */
export async function indexRepository(repoInput, options = {}) {
  const repoMeta = normalizeGitHubRepo(repoInput);
  const fullName = repoMeta.fullName;

  // Initialize status in registry
  updateRegistry(fullName, {
    status: 'INDEXING',
    progress: 10,
    stage: 'Validating repository and connecting to GitHub API',
    error: null,
    startedAt: new Date().toISOString()
  });

  try {
    updateRegistry(fullName, {
      progress: 30,
      stage: 'Fetching recent commits, PRs, issues, and ADR documents'
    });

    // Fetch live evidence
    const sliceData = await fetchLiveRepositoryEvidence(repoMeta, options);

    updateRegistry(fullName, {
      progress: 70,
      stage: 'Building grounded evidence graph and cross-entity links',
      counts: {
        commits: sliceData.commits.length,
        pullRequests: sliceData.pullRequests.length,
        issues: sliceData.issues.length,
        adrs: sliceData.adrs.length,
        manifests: sliceData.manifestArtifacts.length,
        files: (sliceData.files || []).length
      },
      categories: sliceData.categories
    });

    // Ingest into graph (Neo4j if active + in-memory store)
    const ingestResult = await ingestSliceToGraph(sliceData, options);

    // Build authentic cross-entity links
    linkEvidenceGraph(sliceData);

    const health = await checkNeo4jHealth().catch(() => ({ connected: false }));
    const isDurable = Boolean(health.connected);
    const storageMode = isDurable ? 'neo4j_active' : 'in_memory_verified_fallback';
    const storageLabel = isDurable 
      ? 'Neo4j Persistent Graph' 
      : 'In-Memory Store (Non-durable, in-process)';

    // Determine final status
    const totalEvidence = (sliceData.commits.length + sliceData.pullRequests.length + sliceData.issues.length + sliceData.adrs.length + sliceData.manifestArtifacts.length + (sliceData.files?.length || 0));
    const finalStatus = totalEvidence > 0 ? 'READY' : 'PARTIAL';

    const finalState = updateRegistry(fullName, {
      status: finalStatus,
      progress: 100,
      stage: 'Indexing complete',
      isDurable,
      storageMode,
      storageLabel,
      completedAt: new Date().toISOString(),
      lastIndexedAt: new Date().toISOString()
    });

    return {
      success: true,
      repository: fullName,
      status: finalStatus,
      isDurable,
      storageMode,
      storageLabel,
      counts: finalState.counts,
      categories: finalState.categories,
      rateLimitInfo: sliceData.rateLimitInfo,
      message: `Successfully indexed ${totalEvidence} historical engineering artifacts for ${fullName}.`
    };
  } catch (err) {
    console.error(`[CodeWhy] Indexing error for ${fullName}:`, err.message);
    const failedState = updateRegistry(fullName, {
      status: 'FAILED',
      progress: 0,
      stage: `Failed: ${err.message}`,
      error: err.message
    });

    return {
      success: false,
      repository: fullName,
      status: 'FAILED',
      error: err.message
    };
  }
}
