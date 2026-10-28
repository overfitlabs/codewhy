# CodeWhy: Hackathon Demonstration Runbook

> **Theme T1**: AI and Developer Tools  
> **Problem Statement T1.1**: “Why The Code Is Like This”  
> **Evidence-First Architectural & Historical Provenance Engine**

---

## 1. Prerequisites & Environment Setup

### System Requirements
* Node.js: `v20.x` or newer (tested on `v24.21.0`)
* npm: `v10.x` or newer
* Memory: 4GB+ available RAM
* Ports: `5000` (Backend API / Production UI), `3000` (Vite React frontend dev server)

### Environment Configuration (`.env`)
Copy `.env.example` or create `.env` in the repository root. **Never paste raw production secrets into public files.**

```bash
# --- Server Port Configuration ---
PORT=5000

# --- Mandatory: Google Gemini API (for AI Architecture and Why Q&A) ---
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_API_KEY_2=your_optional_secondary_key_here
GEMINI_API_KEY_3=your_optional_tertiary_key_here

# --- Mandatory for Live Graph Persistence: Neo4j AuraDB ---
NEO4J_URI=neo4j+s://4bf85484.databases.neo4j.io
NEO4J_USERNAME=4bf85484
NEO4J_PASSWORD=your_password_here
NEO4J_DATABASE=neo4j

# --- Optional Sponsor Track: Sarvam AI Voice Integration ---
# Enables Speech-to-Text (Saaras v4) and Text-to-Speech (Bulbul v4-flash) across 11 Indic languages.
# If omitted, CodeWhy operates in standard text mode with browser native speech fallback.
# SARVAM_API_KEY=your_sarvam_api_key_here
```

---

## 2. Clean-Start Instructions

### Step 1: Start the Backend Server
```bash
# From the CodeWhy directory (or run both servers with: npm run dev):
node server/index.js
```
*Expected log output:*
```text
◇ injected env from .env
[CodeWhy] Server running on http://localhost:5000
```

### Step 2: Start the Frontend Client
```bash
# In a separate terminal tab:
npm run dev:client
```
*Expected log output:*
```text
  VITE v8.3.2  ready in 250 ms
  ➜  Local:   http://localhost:3000/
```

### Step 3: Verify Storage & Pipeline Health
Open your browser to `http://localhost:5000/api/v1/evidence/status` or inspect the CodeWhy UI header badge:
* Storage Mode: `neo4j_active`
* Storage Label: `Storage: Neo4j Persistent Graph` (with green status indicator)
* Persistence: `isPersistent: true`
* Active Repositories: `expressjs/express`, `backstage/backstage`
*(Note: If Neo4j Aura is paused or unreachable, CodeWhy automatically activates its tested in-memory fallback: `Storage: In-Memory Fallback (Neo4j Offline)` with zero downtime).*

---

## 3. The Primary Demonstration Scenarios

Navigate to **`http://localhost:3000`** (or **`http://localhost:5000`**).
**CodeWhy is the default, primary application landing experience.**

### Scenario 1: Historical Reconstruction (Express Scoped Compromise)
* **Repository**: Select `expressjs/express (Node.js)`
* **Click Preset**: `Express: Why was body-parser removed and re-added?`
* **Target Question**:
  ```text
  Why does lib/express.js export express.json directly while express.bodyParser throws an error?
  ```
* **Expected Grounded Finding**:
  - **Status**: `ANSWERED (HIGH CONFIDENCE)`
  - **Core Explanation**: Express 4.16.0 adopted a scoped compromise: it restored built-in convenience wrappers for `express.json` and `express.urlencoded` to eliminate developer ergonomics friction, while intentionally maintaining the removal of generic `bodyParser`.
  - **Timeline Traversal**:
    1. *2014-03-06*: Express 4.0 Decoupling (Commit `9ea18e1`, marked `PARTIALLY_SUPERSEDED`).
    2. *2014-07-05*: Community DX Rationale (Issue `#2211`, marked `ACTIVE_DISCUSSION`).
    3. *2017-09-28*: Express 4.16.0 Scoped Re-addition (Commit `c0136d8`, marked `ACTIVE`).
  - **Epistemic Discipline Callout**: Distinguishes implementation facts from maintainer quotes and refutes the security misconception that `bodyParser` was decoupled due to temporary disk file upload vulnerabilities (citing Doug Wilson's explicit clarification that `body-parser` buffers strictly in memory).

---

### Scenario 2: Explicit ADR Supersession (Backstage CNCF)
* **Repository**: Select `backstage/backstage (CNCF)`
* **Click Preset**: `Supported: ADR014 Native Fetch (Supersedes ADR013)`
* **Target Question**:
  ```text
  Why was the node-fetch decision superseded by the native fetch decision in Backstage?
  ```
* **Expected Grounded Finding**:
  - **Status**: `ANSWERED (HIGH CONFIDENCE)`
  - **Core Explanation**: Backstage explicitly superseded ADR013 with ADR014 because upgrading Backstage’s minimum requirement to Node.js 20 made Node’s native, Undici-based fetch globally available and stable, eliminating third-party dependency maintenance burden and resolving compatibility issues (Issue #24590).
  - **Timeline Traversal**:
    1. *2021-12-21*: ADR013 Adopt `node-fetch` (marked `SUPERSEDED`).
    2. *2024-11-29*: PR #27925 & ADR014 Standardize on Native fetch (marked `ACTIVE`).
  - **Verified Primary Citations**:
    - **ADR013 Record**: Verbatim banner `:::note[Superseded] This ADR has been superseded by ADR014 and no longer applies. :::`
    - **ADR014 Record**: Standardizing on native `fetch` and `typeof fetch`.
    - **Pull Request #27925**: Direct maintainer quote from Fredrik Adelöw (`@freben`).

---

### Scenario 3: Evidence Boundary & Principled Abstention
* **Repository**: Keep `backstage/backstage (CNCF)` selected.
* **Click Preset**: `Insufficient Evidence: Benchmarks Query`
* **Target Question**:
  ```text
  What throughput or memory consumption benchmarks motivated Backstage to replace node-fetch with native fetch in ADR014?
  ```
* **Expected Grounded Finding**:
  - **Status**: `ABSTAIN (INSUFFICIENT EVIDENCE)`
  - **Principled Abstention**: System declines to fabricate latency numbers, throughput curves, or memory benchmarks.
  - **Documented Evidence Gaps**:
    - `[M1]`: No benchmarks comparing `node-fetch` and native `undici` fetch throughput or memory exist in the Backstage ADR or PR records.
    - `[M2]`: No comparative evaluation of Axios or external HTTP clients is documented in ADR014.
  - **Contrast**: Demonstrates that while naive AI chatbots hallucinate fake 30% latency reductions, CodeWhy tells the engineer the exact boundary of what is historically verifiable.

---

## 4. Fallback Plan & Failure Modes

| Potential Issue | Impact | System Fallback Behavior | Visible UI Indicator |
| :--- | :--- | :--- | :--- |
| **Neo4j Offline / Unreachable** | Cannot persist Cypher graphs across restart | Automatic fallback to high-fidelity in-process in-memory graph store | Top header displays `Storage: In-Memory Fallback (Neo4j Offline)` |
| **GitHub API Rate Limit (403/429)** | Live network calls to GitHub blocked | Automatic fallback to verified empirical repository fixtures | Answer badge displays `Origin: Verified Empirical Fixture` |
| **Network Completely Disconnected** | Cannot reach api.github.com | Uses pre-loaded local fixtures with 100% verified primary sources | Answer badge displays `Origin: Verified Empirical Fixture` |
| **Counterfactual Premise Asked** | User asks why Express switched to Jest | System verifies `package.json:4.16.0` retains `mocha@3.5.3` and refutes premise | Status: `PREMISE_CONTRADICTED` |

---

## 5. 3-Minute Live Presenter Script

### Act 1: The Problem (30 Seconds)
> *"Judges, every engineer who inherits a codebase asks: 'Why is the code written like this?' Why does Express export `express.json` while `express.bodyParser` throws an error? Why did Backstage replace `node-fetch` with native `fetch`? When developers ask generic LLMs, the models invent plausible-sounding answers with fake benchmarks and false security rationales. CodeWhy is an evidence-first reasoning tool that answers 'Why' questions by traversing actual historical decisions and strictly enforcing claim-level citation verification."*

### Act 2: Historical Compromise in Express (60 Seconds)
> *(Presenter clicks Express Body-Parser Compromise preset)*  
> *"Look at this response. CodeWhy reveals that in 2014, Express 4.0 decoupled all middleware to prevent bloat. But by 2017, community feedback in Issue #2211 showed that parsing bodies was more common than serving static files. Maintainer Doug Wilson negotiated a scoped compromise in commit `c0136d8`: restoring convenience for JSON and URL-encoded bodies, while permanently upholding the ban on monolithic bodyParser. Notice our Epistemic Discipline card: CodeWhy explicitly refutes the myth that bodyParser was decoupled due to disk temporary file vulnerabilities, citing Doug Wilson's clarification."*

### Act 3: Explicit Supersession in Backstage (60 Seconds)
> *(Presenter clicks Backstage tab, then clicks ADR014 Native Fetch preset)*  
> *"CodeWhy is not hard-coded for Express. Here we query CNCF Backstage. ADR013 originally mandated `node-fetch`. But in November 2024, PR #27925 merged ADR014. CodeWhy's temporal engine doesn't guess supersession from commit dates alone—it verifies documentary intent. It detects the formal `:::note[Superseded]` banner in ADR013, links maintainer Fredrik Adelöw's rationale on Node 20 runtime standards, and marks ADR013 as `SUPERSEDED` and ADR014 as `ACTIVE`."*

### Act 4: The 'How Do I Know It's True?' Test & Abstention (30 Seconds)
> *(Presenter clicks Insufficient Evidence preset)*  
> *"Finally, what happens when a judge or developer asks: 'What latency benchmarks motivated Backstage to switch?' A generic chatbot hallucinates '30% lower latency'. CodeWhy returns `ABSTAIN`. It inspects the ADRs, confirms that Node 20 runtime standard and package compatibility were the true reasons, and explicitly documents that no performance benchmarks were recorded in the repository. That is why CodeWhy can be trusted in production."*

---

## 6. Evaluation Methodology & Limitations

### Methodology
* Executed via `node server/codewhy/eval/run_eval.js`.
* Evaluates **20 curated multi-repository benchmark cases** across 5 mathematical dimensions (0.0 to 1.0 each, max 5.0 per case, total 100.00):
  1. **Claim-Level Citation Support (D1)**
  2. **Citation Relevance (D2)**
  3. **Historical Rationale Attribution (D3)**
  4. **Explicit Supersession Detection (D4)**
  5. **Epistemic Abstention (D5)**
* Evaluates 3 distinct systems:
  - **CodeWhy Graph Pipeline**: Mean **4.38 / 5.00** (Total: **87.57 / 100.00**)
  - **BM25 Keyword Baseline**: Mean **2.98 / 5.00** (Total: **59.62 / 100.00**)
  - **Naive Synthesis Baseline (Model-Only)**: Mean **1.13 / 5.00** (Total: **22.60 / 100.00**)

### Known Limitations
1. **Curated Historical Slices**: The current graph slice is targeted to high-impact architectural inflection points (Express 4.0–4.16 body-parser line and Backstage ADR013–ADR014 line). Broad recursive repository crawling is out of scope for this hackathon phase.
2. **Neo4j Aura & Fallback Mode**: When connected to Neo4j Aura (`neo4j+s://4bf85484.databases.neo4j.io`), all slices, decisions, ADRs, PRs, and manifests persist in the cloud database and re-hydrate after server restarts. If the database is offline or unconfigured, CodeWhy operates in verified in-memory graph mode.
3. **Small Benchmark Size**: While 20 cases rigorously test supersession, partial evidence, and abstention across two repositories, it is a curated benchmark rather than a large statistical dataset. Results demonstrate pipeline capability, not global generalization across all GitHub projects.

---

## 7. Problem Statement Compliance Matrix (hackFront India Theme T1, Problem T1.1)

| Exact Requirement & Source | Mandatory or Optional | Current Implementation | Evidence That It Works | Gap | Next Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Multi-Source Ingestion**<br>*(T1.1 Spec, T11_GAP_ANALYSIS.md Req 1)* | **Mandatory** | Ingests commits (`9ea18e1`, `c0136d8`), issue discussion (`#2211`), ADRs (`ADR013`, `ADR014`), PRs (`#27925`), and release manifests (`package.json:4.16.0`) with both live GitHub API and deterministic fixtures. | `tests/codewhy.test.js:1,11` passing; `/api/v1/why-code` returns verified facts with authentic citations. | Slice-based ingestion rather than full-repo recursive crawling. | Preserved and demo-ready. |
| **Entity Resolution Across Symbols, Files, People & Time**<br>*(T1.1 Spec, T11_GAP_ANALYSIS.md Req 2)* | **Mandatory** | Generates deterministic repository-scoped IDs (`repo::file::symbol`), maintainer attribution (`@dougwilson`, `@freben`, `@jhaals`), ISO timestamps, and AST symbol mapping (`exports.json`, `exports.bodyParser`, `exports.urlencoded`, `ADR014`). | `tests/codewhy.test.js:1,4,11` passing. | File renames tracked within commit patch diffs; no dedicated `:FileRename` node label. | Maintained within current slice. |
| **Graph Representation of Decisions & Evidence**<br>*(T1.1 Spec, T11_GAP_ANALYSIS.md Req 3)* | **Mandatory** | Primary Neo4j graph model: `Repository`, `File`, `Symbol`, `Commit`, `Issue`, `Decision`, `ADR`, `PullRequest`, `Manifest`. Connected via `CONTAINS_FILE`, `DEFINED_IN`, `TOUCHES`, `RESOLVES`, `CONTAINS_ADR`, `CONTAINS_PR`, `SUPERSEDES`, `SUPERSEDED_BY`, `GROUNDED_IN`. | `scratch_verify_neo4j_persistence.mjs` verifies live Cypher writes/reads in Neo4j Aura; `tests/codewhy.test.js:19` verifies cold rehydration. | None for target scope. | Fully verified live. |
| **Historical Rationale Reconstruction ("Why The Code Is Like This")**<br>*(T1.1 Problem Statement, T11_GAP_ANALYSIS.md Req 4)* | **Mandatory** | Dynamic evidence-driven synthesizer derives explanation directly from retrieved graph nodes, explaining historical trade-offs (e.g. Express body-parser DX friction vs multipart DoS risk; Backstage node-fetch vs Node 20 undici fetch). | Verified in Preset 1 (`express-body-parser-compromise`) and Preset 2 (`backstage-adr-fetch-supersession`). | None. | Live demo ready. |
| **Temporal Reasoning & Explicit Supersession**<br>*(T1.1 Problem Statement, T11_GAP_ANALYSIS.md Req 5)* | **Mandatory** | `temporal.js` distinguishes active from superseded decisions; rejects chronological succession alone as `HISTORICAL_UNKNOWN`; requires explicit supersession banner (`:::note[Superseded]`) or PR rationale. | `tests/codewhy.test.js:9,14,15` passing; Eval Case 19. | None. | Fully verified. |
| **Traceable Evidence Citations & Epistemic Rigor**<br>*(CODEWHY_PRODUCT_SPEC.md Sec 3, T11_GAP_ANALYSIS.md Req 6 & 7)* | **Mandatory** | Zod schema validation (`schemas.js`); 100% citations resolve to authentic graph nodes; claim-level support verification (`validateClaimSupport`); separate sections for Facts, Hypotheses, Contradictions, and Missing Info. | `tests/codewhy.test.js:4,5,6,17` passing. | None. | Fully verified. |
| **Calibrated Confidence & Honest Abstention**<br>*(CODEWHY_PRODUCT_SPEC.md Req 8, T11_GAP_ANALYSIS.md Req 8)* | **Mandatory** | Algorithmic confidence (`HIGH`, `MEDIUM`, `LOW`, `ABSTAIN`); refutes contradicted premises (e.g. Mocha vs Jest, CVE panic) and honestly abstains on unrecorded benchmarks. | `tests/codewhy.test.js:7,8,13` passing; 100% abstention pass rate across 7 negative benchmark cases. | None. | Fully verified. |
| **Graph Database Persistence (Neo4j Aura)**<br>*(Hackathon Spec, CAPABILITY_MATRIX.md)* | **Mandatory** | Connected to live Neo4j Aura cloud (`neo4j+s://4bf85484.databases.neo4j.io`); writes Repository, File, Symbol, Commit, Issue, Decision, ADR, PR, Manifest nodes; rehydrates cold state after restart; falls back to in-memory store if offline. | `tests/codewhy.test.js:19,20` passing; live status endpoint `/api/v1/evidence/status` returns `storageMode: 'neo4j_active'`, `isPersistent: true`. | None. | Fully verified live. |
| **Quantitative & Comparative Evaluation Benchmark**<br>*(T1.1 Spec, T11_GAP_ANALYSIS.md Req 10)* | **Mandatory** | 20-case frozen multi-repository benchmark scored across 5 dimensions against BM25 Keyword and Naive Synthesis baselines. | CodeWhy: 4.38/5.00 (87.57/100) vs BM25: 2.98/5.00 (59.62/100) vs Naive: 1.13/5.00 (22.60/100). | Curated 20 cases rather than automated multi-repo harness. | Frozen in `evaluation_results.json`. |
| **Multilingual Voice Integration (Sarvam AI)**<br>*(Sponsor Track / GAP-8, T11_GAP_ANALYSIS.md)* | **Optional (Sponsor Track)** | Official Sarvam AI STT (`saaras:v4`) and TTS (`bulbul:v4-flash`) via `services/sarvam.js` and `/api/v1/voice/` routes; 11 Indic languages; frontend microphone query dictation and audio briefing narration; non-blocking fallback when unconfigured. | `tests/codewhy.test.js:21,22,23,24` passing; endpoints tested live; Vite frontend build passes. | Requires `SARVAM_API_KEY` for live Sarvam API calls; falls back gracefully to text input and Web Speech API. | Complete and verified with transparent unconfigured fallback. |

---

## 8. Sarvam AI Voice Integration & Sponsor Track Audit

### Implementation Summary
* **Service Module**: `server/codewhy/services/sarvam.js`
* **API Router**: `server/codewhy/routes/voice.js` mounted at `/api/v1/voice`
* **Speech-to-Text (STT)**:
  - Official Endpoint: `POST https://api.sarvam.ai/speech-to-text`
  - Model: `saaras:v4` (supporting English and 22+ Indian languages)
  - Auth Header: `api-subscription-key: <SARVAM_API_KEY>`
* **Text-to-Speech (TTS)**:
  - Official Endpoint: `POST https://api.sarvam.ai/text-to-speech`
  - Model: `bulbul:v4-flash` (speaker: `shubh`)
  - Request Body: JSON payload with `text`, `language_code`, and `speech_sample_rate` (22050Hz)
* **Supported Indic Languages**: 11 languages (`en-IN`, `hi-IN`, `bn-IN`, `ta-IN`, `te-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `gu-IN`, `pa-IN`, `od-IN`).
* **Frontend Capabilities (`CodeWhyExplorer.jsx`)**:
  - Microphone Dictation Button: Dictates natural language question via Sarvam Saaras v4 STT.
  - Listen Briefing Button: Narrates executive finding via Sarvam Bulbul v4-flash TTS.
  - Transparent Resilient Fallback: If `SARVAM_API_KEY` is not present, displays a non-blocking informative banner (`"Sarvam Voice: SARVAM_API_KEY is not configured in .env. Voice input disabled; please type your question."`), and the primary text-based workflow continues with zero degradation.
* **Credentials & Security**: `SARVAM_API_KEY` is stored strictly in environment variables, never bundled into client bundles or printed in error logs.

