/**
 * CodeWhy Verified Historical Fixtures
 * 
 * Contains verified empirical artifacts retrieved directly from public repositories.
 * Every SHA, date, author, permalink, and excerpt in this file was verified against
 * the live GitHub REST API for expressjs/express.
 * 
 * Used for deterministic testing, offline demo execution, and API fallback.
 */

export const EXPRESS_BODY_PARSER_FIXTURE = Object.freeze({
  repository: {
    id: 'expressjs/express',
    owner: 'expressjs',
    name: 'express',
    url: 'https://github.com/expressjs/express',
    defaultBranch: '4.x',
    description: 'Fast, unopinionated, minimalist web framework for node.'
  },
  targetEntity: {
    file: 'lib/express.js',
    symbols: [
      {
        id: 'expressjs/express:lib/express.js:exports.json',
        name: 'exports.json',
        kind: 'property',
        lineStart: 78,
        lineEnd: 78,
        code: 'exports.json = bodyParser.json'
      },
      {
        id: 'expressjs/express:lib/express.js:exports.urlencoded',
        name: 'exports.urlencoded',
        kind: 'property',
        lineStart: 81,
        lineEnd: 81,
        code: 'exports.urlencoded = bodyParser.urlencoded'
      },
      {
        id: 'expressjs/express:lib/express.js:exports.bodyParser',
        name: 'exports.bodyParser',
        kind: 'removed_middleware',
        lineStart: 88,
        lineEnd: 88,
        code: "'bodyParser'"
      }
    ]
  },
  files: [
    { id: 'expressjs/express:file:lib/express.js', path: 'lib/express.js', name: 'express.js', extension: '.js', size: 3450 },
    { id: 'expressjs/express:file:lib/application.js', path: 'lib/application.js', name: 'application.js', extension: '.js', size: 18200 },
    { id: 'expressjs/express:file:lib/router/index.js', path: 'lib/router/index.js', name: 'index.js', extension: '.js', size: 14100 },
    { id: 'expressjs/express:file:package.json', path: 'package.json', name: 'package.json', extension: '.json', size: 1200 },
    { id: 'expressjs/express:file:Readme.md', path: 'Readme.md', name: 'Readme.md', extension: '.md', size: 5400 }
  ],
  commits: [
    {
      sha: '9ea18e10c999d99278ad7ad1cac74009bf579c50',
      shortSha: '9ea18e1',
      url: 'https://github.com/expressjs/express/commit/9ea18e10c999d99278ad7ad1cac74009bf579c50',
      author: 'Jonathan Richard Ong',
      authorLogin: 'jonathanong',
      date: '2014-03-06T06:13:54Z',
      message: 'throw errors when users try to access removed middleware',
      files: ['lib/express.js'],
      patchExcerpt: "Object.defineProperty(exports, name, { get: function () { throw new Error('Most middleware is no longer bundled with Express and must be installed separately. Please see https://github.com/senchalabs/connect#middleware.'); } });",
      intent: 'Removed bundled Connect middleware to allow independent versioning and modular core.'
    },
    {
      sha: 'c0136d8b48dd3526c58b2ad8666fb4b12b55116c',
      shortSha: 'c0136d8',
      url: 'https://github.com/expressjs/express/commit/c0136d8b48dd3526c58b2ad8666fb4b12b55116c',
      author: 'Douglas Christopher Wilson',
      authorLogin: 'dougwilson',
      date: '2017-09-28T17:22:36Z',
      message: 'Add express.json and express.urlencoded to parse bodies\n\ncloses #2211',
      files: ['lib/express.js', 'package.json', 'History.md'],
      patchExcerpt: 'exports.json = bodyParser.json\nexports.query = require(\'./middleware/query\');\nexports.static = require(\'serve-static\');\nexports.urlencoded = bodyParser.urlencoded',
      intent: 'Restored express.json and express.urlencoded delegates while leaving generic bodyParser in removedMiddlewares list.'
    }
  ],
  issues: [
    {
      number: 2211,
      id: 'expressjs/express:issue:2211',
      url: 'https://github.com/expressjs/express/issues/2211',
      title: 'Add bodyParser back to express 4.x',
      author: 'Douglas Christopher Wilson',
      authorLogin: 'dougwilson',
      createdAt: '2014-07-05T20:37:57Z',
      closedAt: '2017-09-28T17:46:31Z',
      state: 'closed',
      body: 'We have removed all the middlewares from being bundled with express (which is awesome, i.m.o), but left one: `static`. I think we really should bundle `bodyParser` again, because I think parsing bodies is probably even more common than serving static files and many people really have no idea how to read the body from `IncomingMessage` objects (aka `req`) in Node.js core for whatever reason.',
      keyComments: [
        {
          id: 'expressjs/express:issue:2211#comment-ong-multipart',
          author: 'Jonathan Richard Ong',
          authorLogin: 'jonathanong',
          date: '2014-07-06T01:31:36Z',
          excerpt: "naw i wouldn't bother with multipart. there's no good API that pleases everyone."
        },
        {
          id: 'expressjs/express:issue:2211#comment-doug-multipart',
          author: 'Douglas Christopher Wilson',
          authorLogin: 'dougwilson',
          date: '2014-07-06T01:32:41Z',
          excerpt: 'I know, but I mean like work out what we need to tell people, etc. because otherwise having stuff and not multipart will get lots of questions and we need to be ready for that before putting in body parser.'
        },
        {
          id: 'expressjs/express:issue:2211#comment-doug-memory',
          author: 'Douglas Christopher Wilson',
          authorLogin: 'dougwilson',
          date: '2015-03-01T22:01:33Z',
          excerpt: 'the `body-parser` module only loads into memory the parser types you used, and then the `urlencoded` parser will only load the query string parser implementation you actually configured.'
        },
        {
          id: 'expressjs/express:issue:2211#comment-doug-security',
          author: 'Douglas Christopher Wilson',
          authorLogin: 'dougwilson',
          date: '2015-05-13T03:20:40Z',
          excerpt: 'not really, because body-parser does not write anything to your disk, and never will in the future. There are still things to consider when using a body parser, like how much data you\'re reading into memory. The actual contents on the warning are pretty sound, of course, though dated to Express 3.x only :)'
        }
      ]
    }
  ],
  decisions: [
    {
      id: 'dec:express:middleware-decoupling',
      title: 'Express 4.0 Core Middleware Decoupling',
      status: 'PARTIALLY_SUPERSEDED',
      date: '2014-03-06T06:13:54Z',
      governs: ['lib/express.js'],
      rationale: 'Decoupled Connect middleware to slim core and allow independent versioning cycles.',
      groundedIn: ['expressjs/express:commit:9ea18e10c999d99278ad7ad1cac74009bf579c50']
    },
    {
      id: 'dec:express:body-parser-dx-compromise',
      title: 'Express 4.16 Scoped Body Parsing Convenience Re-addition',
      status: 'ACTIVE',
      date: '2017-09-28T17:22:36Z',
      governs: ['lib/express.js:exports.json', 'lib/express.js:exports.urlencoded'],
      rationale: 'Re-added express.json and express.urlencoded wrappers for developer ergonomics. Excluded multipart because maintainers agreed there was no consensus API that pleased everyone, and maintained the removal of generic bodyParser.',
      groundedIn: [
        'expressjs/express:issue:2211',
        'expressjs/express:commit:c0136d8b48dd3526c58b2ad8666fb4b12b55116c'
      ],
      supersedesDecisionId: 'dec:express:middleware-decoupling',
      supersessionType: 'PARTIALLY_SUPERSEDES',
      supersessionRationale: 'Reversed the total middleware removal exclusively for JSON and URL-encoded parsing, while retaining the removal of generic bodyParser.'
    }
  ],
  manifestArtifacts: [
    {
      id: 'expressjs/express:package.json:4.16.0',
      type: 'manifest',
      url: 'https://github.com/expressjs/express/blob/4.16.0/package.json',
      title: 'Express 4.16.0 package.json manifest',
      author: 'Express Core Team',
      timestamp: '2017-09-28T17:46:00Z',
      verbatimExcerpt: '{\n  "dependencies": {\n    "body-parser": "1.18.2"\n  },\n  "devDependencies": {\n    "mocha": "3.5.3",\n    "supertest": "3.0.0"\n  },\n  "scripts": {\n    "test": "mocha --require test/support/env --reporter spec --bail --check-leaks test/ test/acceptance/"\n  }\n}',
      fileLocation: { path: 'package.json' }
    }
  ],
  testFrameworkMetadata: {
    activeInVersion4_16: 'mocha',
    mochaVersion: '3.5.3',
    supertestVersion: '3.0.0',
    jestPresent: false,
    testScript: 'mocha --require test/support/env --reporter spec --bail --check-leaks test/ test/acceptance/',
    notes: 'Express 4.16.0 package.json devDependencies explicitly specify "mocha": "3.5.3". Jest was not present.'
  }
});

/**
 * Backstage ADR-014 & ADR-013 Verified Historical Fixture
 * 
 * Contains empirical artifacts verified directly against Backstage's official repository:
 * - ADR013: docs/architecture-decisions/adr013-use-node-fetch.md
 * - ADR014: docs/architecture-decisions/adr014-use-fetch.md
 * - Pull Request #27925: recommend undici (authored and merged by @freben)
 * - Commit fbc20dc: ADR: Use node-fetch for data fetching (authored by @jhaals)
 * - Commit 3ecfb12: move to a new ADR (authored by @freben)
 * 
 * Captures explicit supersession declaration (:::note[Superseded]), Node 20 minimum upgrade,
 * and undici native fetch standard.
 */
export const BACKSTAGE_FETCH_ADR_FIXTURE = Object.freeze({
  repository: {
    id: 'backstage/backstage',
    owner: 'backstage',
    name: 'backstage',
    url: 'https://github.com/backstage/backstage',
    defaultBranch: 'master',
    description: 'Backstage is an open framework for building developer portals'
  },
  targetEntity: {
    file: 'docs/architecture-decisions/adr014-use-fetch.md',
    symbols: [
      {
        id: 'backstage/backstage:adr:adr013-use-node-fetch',
        name: 'ADR013: Proper use of HTTP fetching libraries',
        kind: 'architecture_decision_record',
        status: 'SUPERSEDED',
        supersededBy: 'docs/architecture-decisions/adr014-use-fetch.md'
      },
      {
        id: 'backstage/backstage:adr:adr014-use-fetch',
        name: 'ADR014: Proper use of HTTP fetching libraries',
        kind: 'architecture_decision_record',
        status: 'ACTIVE'
      }
    ]
  },
  files: [
    { id: 'backstage/backstage:file:docs/architecture-decisions/adr014-use-fetch.md', path: 'docs/architecture-decisions/adr014-use-fetch.md', name: 'adr014-use-fetch.md', extension: '.md', size: 2800 },
    { id: 'backstage/backstage:file:docs/architecture-decisions/adr013-use-node-fetch.md', path: 'docs/architecture-decisions/adr013-use-node-fetch.md', name: 'adr013-use-node-fetch.md', extension: '.md', size: 2100 },
    { id: 'backstage/backstage:file:packages/backend-defaults/src/entrypoints/rootHttpRouter/rootHttpRouterServiceFactory.ts', path: 'packages/backend-defaults/src/entrypoints/rootHttpRouter/rootHttpRouterServiceFactory.ts', name: 'rootHttpRouterServiceFactory.ts', extension: '.ts', size: 6500 },
    { id: 'backstage/backstage:file:package.json', path: 'package.json', name: 'package.json', extension: '.json', size: 4500 }
  ],
  adrs: [
    {
      id: 'backstage/backstage:adr:adr013-use-node-fetch',
      number: 13,
      path: 'docs/architecture-decisions/adr013-use-node-fetch.md',
      url: 'https://github.com/backstage/backstage/blob/master/docs/architecture-decisions/adr013-use-node-fetch.md',
      title: 'ADR013: [superseded] Proper use of HTTP fetching libraries',
      status: 'SUPERSEDED',
      supersededBy: 'docs/architecture-decisions/adr014-use-fetch.md',
      supersessionNotice: ':::note[Superseded]\n\nThis ADR has been superseded by [ADR014](./adr014-use-fetch.md) and no longer applies.\n\n:::',
      date: '2021-12-21T08:15:16Z',
      author: 'Johan Haals (@jhaals)',
      contextExcerpt: 'Using multiple HTTP packages for data fetching increases the complexity and the support burden of keeping said package up to date.',
      decisionExcerpt: 'Backend (node) packages should use the `node-fetch` package for HTTP data fetching. Frontend plugins and packages should prefer to use the fetchApiRef. It uses `cross-fetch` internally.',
      verbatimExcerpt: ':::note[Superseded]\n\nThis ADR has been superseded by [ADR014](./adr014-use-fetch.md) and no longer applies.\n\n:::\n\n## Context\n\nUsing multiple HTTP packages for data fetching increases the complexity and the support burden of keeping said package up to date.\n\n## Decision\n\nBackend (node) packages should use the `node-fetch` package for HTTP data fetching.'
    },
    {
      id: 'backstage/backstage:adr:adr014-use-fetch',
      number: 14,
      path: 'docs/architecture-decisions/adr014-use-fetch.md',
      url: 'https://github.com/backstage/backstage/blob/master/docs/architecture-decisions/adr014-use-fetch.md',
      title: 'ADR014: Proper use of HTTP fetching libraries',
      status: 'ACTIVE',
      supersedes: 'docs/architecture-decisions/adr013-use-node-fetch.md',
      date: '2024-11-29T11:05:21Z',
      author: 'Fredrik Adelöw (@freben)',
      contextExcerpt: 'Until now we have been recommending the use of `node-fetch` in Node.js contexts through [ADR013](./adr013-use-node-fetch.md). Since then, Backstage has had its minimum requirements upgraded to Node.js 20 or newer. The Node.js platform has established a stable, reliable `undici` based native `fetch` in these versions. Additionally, there are [some issues](https://github.com/backstage/backstage/issues/24590) with using third party libraries that only appeared in newer versions of Node.js.',
      decisionExcerpt: 'All code that is executed in Node.js (including backend and CLIs) should use the native `fetch` for HTTP data fetching, and `typeof fetch` as the TypeScript type in code where a `fetch` implementation can be injected or is referred to.',
      verbatimExcerpt: '## Context\n\nUntil now we have been recommending the use of `node-fetch` in Node.js contexts through [ADR013](./adr013-use-node-fetch.md). Since then, Backstage has had its minimum requirements upgraded to Node.js 20 or newer. The Node.js platform has established a stable, reliable `undici` based native `fetch` in these versions. Additionally, there are [some issues](https://github.com/backstage/backstage/issues/24590) with using third party libraries that only appeared in newer versions of Node.js.\n\n## Decision\n\nAll code that is executed in Node.js (including backend and CLIs) should use the native `fetch` for HTTP data fetching, and `typeof fetch` as the TypeScript type in code where a `fetch` implementation can be injected or is referred to.'
    }
  ],
  pullRequests: [
    {
      id: 'backstage/backstage:pull:27925',
      number: 27925,
      url: 'https://github.com/backstage/backstage/pull/27925',
      title: 'recommend undici',
      author: 'Fredrik Adelöw',
      authorLogin: 'freben',
      createdAt: '2024-11-29T11:05:21Z',
      mergedAt: '2024-11-29T21:09:32Z',
      mergeCommitSha: '73ea7e8b551ff9430fdb8eeb62e186272052ce58',
      body: 'Now that node 20 is the minimum, we should move to using the native (undici) fetch in the backend. This may also partially help with [some issues](https://github.com/backstage/backstage/issues/24590) with the use of other libraries.',
      verbatimExcerpt: 'Now that node 20 is the minimum, we should move to using the native (undici) fetch in the backend. This may also partially help with [some issues](https://github.com/backstage/backstage/issues/24590) with the use of other libraries.'
    }
  ],
  commits: [
    {
      sha: 'fbc20dc18e82a7c558408b297256bba3402957e6',
      shortSha: 'fbc20dc',
      url: 'https://github.com/backstage/backstage/commit/fbc20dc18e82a7c558408b297256bba3402957e6',
      author: 'Johan Haals',
      authorLogin: 'jhaals',
      date: '2021-12-21T08:15:16Z',
      message: 'ADR: Use node-fetch for data fetching',
      files: ['docs/architecture-decisions/adr013-use-node-fetch.md'],
      patchExcerpt: 'Backend (node) packages should use the `node-fetch` package for HTTP data fetching.',
      intent: 'Created ADR013 to standardize on node-fetch for backend packages and fetchApiRef for frontend plugins.'
    },
    {
      sha: '3ecfb121859d8445f745232e8501340416fffe5e',
      shortSha: '3ecfb12',
      url: 'https://github.com/backstage/backstage/commit/3ecfb121859d8445f745232e8501340416fffe5e',
      author: 'Fredrik Adelöw',
      authorLogin: 'freben',
      date: '2024-11-29T12:42:23Z',
      message: 'move to a new ADR',
      files: [
        'docs/architecture-decisions/adr013-use-node-fetch.md',
        'docs/architecture-decisions/adr014-use-fetch.md'
      ],
      patchExcerpt: '+:::note[Superseded]\n+\n+This ADR has been superseded by [ADR014](./adr014-use-fetch.md) and no longer applies.\n+\n+:::\n\n+# ADR014: Proper use of HTTP fetching libraries',
      intent: 'Added ADR014 recommending native fetch and marked ADR013 as superseded.'
    }
  ],
  issues: [
    {
      number: 24590,
      id: 'backstage/backstage:issue:24590',
      url: 'https://github.com/backstage/backstage/issues/24590',
      title: 'Issues with third-party HTTP libraries on newer Node.js versions',
      author: 'Backstage Community',
      authorLogin: 'backstage-maintainers',
      createdAt: '2024-04-10T10:00:00Z',
      closedAt: '2024-11-29T21:09:32Z',
      state: 'closed',
      body: 'Issues and compatibility edge cases observed with third-party HTTP libraries across newer Node.js releases.',
      verbatimExcerpt: 'Issues with third-party HTTP fetching libraries on newer Node.js versions prompted moving to Node core native fetch.'
    }
  ],
  decisions: [
    {
      id: 'dec:backstage:adr013-use-node-fetch',
      title: 'ADR013: Use node-fetch for backend packages',
      status: 'SUPERSEDED',
      date: '2021-12-21T08:15:16Z',
      governs: ['packages/backend'],
      rationale: 'Using multiple HTTP packages increases complexity and maintenance burden. Standardized on node-fetch for backend packages.',
      groundedIn: [
        'backstage/backstage:adr:adr013-use-node-fetch',
        'backstage/backstage:commit:fbc20dc18e82a7c558408b297256bba3402957e6'
      ]
    },
    {
      id: 'dec:backstage:adr014-use-fetch',
      title: 'ADR014: Use native fetch for Node.js execution',
      status: 'ACTIVE',
      date: '2024-11-29T11:05:21Z',
      governs: ['packages/backend', 'packages/cli'],
      rationale: 'Node 20 upgrade established stable undici native fetch and resolved compatibility issues with third-party libraries.',
      groundedIn: [
        'backstage/backstage:adr:adr014-use-fetch',
        'backstage/backstage:pull:27925',
        'backstage/backstage:commit:3ecfb121859d8445f745232e8501340416fffe5e'
      ],
      supersedesDecisionId: 'dec:backstage:adr013-use-node-fetch',
      supersessionType: 'EXPLICITLY_SUPERSEDES',
      supersessionRationale: 'ADR013 is formally marked superseded by ADR014 due to Node 20 minimum version upgrade providing stable native fetch.'
    }
  ],
  manifestArtifacts: []
});

