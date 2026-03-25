## Purpose

Product indexing pipeline orchestrator: coordinates the full fetch → parse → extract → validate → consensus → learning → export lifecycle for a single product run.

## Public API (The Contract)

- `runProduct.js` → `runProduct({ category, productId, config, storage, specDb, logger, ... })` — main pipeline entry point (async)
- `fetchParseWorker.js` → `normalizeHostToken`, `hostFromHttpUrl`, `compactQueryText`, `buildRepairSearchQuery`, `classifyFetchOutcome`, `FETCH_OUTCOME_KEYS`, `createFetchOutcomeCounters`, `createHostBudgetRow`, `ensureHostBudgetRow`, `bumpHostOutcome`, `applyHostBudgetBackoff`, `resolveHostBudgetState`
- `consensusPhase.js` → `executeConsensusPhase({ sourceResults, categoryConfig, ... })`
- `learningGatePhase.js` → `evaluateFieldLearningGates`, `emitLearningGateEvents`, `populateLearningStores`
- `learningExportPhase.js` → `runLearningExportPhase({ specDb, ... })`
- `identityGateExtraction.js` → `isIdentityGatedField`, `resolveIdentityLabel`, `applyIdentityGateToCandidates`
- `urlQualityGate.js` → `isLowValueHost`
- `dedupeOutcomeEvent.js` → `dedupeOutcomeToEventKey`, `buildDedupeOutcomeEvent`
- `componentReviewBatch.js` → `runComponentReviewBatch`

## Dependencies (Allowed Imports)

- `src/core/*` (config, LLM client)
- `src/shared/*` (settings defaults)
- `src/features/indexing/extraction/index.js` (LLM extraction)
- `src/features/indexing/validation/index.js` (identity + validation gates)
- `src/features/indexing/learning/index.js` (learning stores + gates)
- `src/features/indexing/discovery/index.js` (deep gates)
- `src/scoring/*` (consensus, quality scoring, list union)
- `src/concurrency/*` (fetch scheduler, throttler)
- `src/fetcher/*` (Playwright, HTTP, Crawlee fetchers)
- `src/planner/sourcePlanner.js` (source planning)
- `src/categories/loader.js`, `src/utils/common.js`, `src/billing/*`
- `src/normalizer/*`, `src/exporter/*`, `src/intel/*`
- `zod` (schema validation)

**Forbidden:** `src/pipeline/` must NOT import from `src/api/`, `src/db/` directly (DB access via injected `specDb`), or `src/cli/`.

## Mutation Boundaries

- SpecDb: candidate inserts/updates, review records, learning stores (via injected instance)
- Filesystem: run artifacts, learning profiles, event logs
- External HTTP: source URLs (fetch), LLM providers (extraction/validation)
- No direct database file access — all through injected `specDb`

## Domain Invariants

- `runProduct()` is the single entry point. All phase orchestration flows through it.
- Phases execute sequentially: fetch → parse → extract → validate → consensus → learn → export.
- Host budget tracking prevents excessive retries against a single domain.
- `classifyFetchOutcome()` is the canonical outcome classifier — all fetch results go through it.
- `runWithRetry()` is the only retry mechanism — no ad-hoc retry loops in phase code.
