## Purpose

Product indexing pipeline orchestrator: coordinates the full crawl → learn → export lifecycle for a single product run. Delegates phase execution to `src/features/indexing/pipeline/` and crawl processing to `src/features/crawl/`.

## Public API (The Contract)

- `runProduct.js` → `runProduct({ storage, config, s3Key, ... })` — main pipeline entry point (async)
- `runCrawlProcessingLifecycle.js` → crawl session orchestration
- `seams/bootstrapRunProductExecutionState.js` → prepare execution state (planner, LLM runtime, learning stores)
- `urlQualityGate.js` → `isLowValueHost`
- `dedupeOutcomeEvent.js` → `dedupeOutcomeToEventKey`, `buildDedupeOutcomeEvent`
- `componentReviewBatch.js` → `runComponentReviewBatch`

## Dependencies (Allowed Imports)

- `src/core/*` (config, LLM client)
- `src/shared/*` (settings defaults, primitives)
- `src/features/indexing/pipeline/` (phase modules: needSet, brandResolver, searchProfile, etc.)
- `src/features/indexing/orchestration/` (bootstrap, learning)
- `src/features/crawl/` (adapters, plugins, crawl session)
- `src/planner/sourcePlanner.js` (source planning)
- `src/categories/loader.js`, `src/billing/*`, `src/intel/*`
- `zod` (schema validation)

**Forbidden:** `src/pipeline/` must NOT import from `src/api/`, `src/db/` directly (DB access via injected `specDb`), or `src/cli/`.

## Domain Invariants

- `runProduct()` is the single entry point. All phase orchestration flows through it.
- Crawl session lifecycle: instantiate → run → teardown (via `src/features/crawl/`).
- Phase execution delegated to `src/features/indexing/pipeline/` vertical modules.
- Host budget tracking prevents excessive retries against a single domain.
- No direct database file access — all through injected `specDb`.
