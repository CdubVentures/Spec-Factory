## Purpose

Product indexing pipeline orchestrator: coordinates the full crawl → learn → export lifecycle for a single product run. Delegates phase execution to `src/features/indexing/pipeline/` and crawl processing to `src/features/crawl/`.

## Public API (The Contract)

- `runProduct.js` → `runProduct({ storage, config, s3Key, ... })` — main pipeline entry point. Returns `{ crawlResults, runId, category, productId, fetchPlanStats, startMs, job }`
- `checkpoint/buildCrawlCheckpoint.js` → `buildCrawlCheckpoint(opts)` — pure builder for run.json (schema v2/3: sources + needset + search_profile + run_summary + identity + runtime_ops_panels)
- `checkpoint/writeCrawlCheckpoint.js` → `writeCrawlCheckpoint(opts)` — writes `{runId}/run.json` + optional SQL run_artifacts
- `checkpoint/buildProductCheckpoint.js` → `buildProductCheckpoint(opts)` — pure builder for product.json (identity + sources + query_cooldowns)
- `checkpoint/mergeProductSources.js` → `mergeProductSources(opts)` — content-addressed source dedup across runs
- `checkpoint/seedFromCheckpoint.js` → `seedFromCheckpoint({ specDb, checkpoint })` — rebuild SQL state from run.json or product.json
- `checkpoint/scanAndSeedCheckpoints.js` → `scanAndSeedCheckpoints({ specDb, indexLabRoot })` — walk disk and seed all checkpoints (includes media index rebuild)
- `checkpoint/rebuildMediaIndexes.js` → `rebuildMediaIndexesFromDisk({ specDb, runDir, checkpoint })` — rebuild source_screenshots/source_videos SQL indexes from files on disk
- `checkpoint/writeProductCheckpoint.js` → `writeProductCheckpoint(opts)` — read-merge-write `{outRoot}/product.json`
- `seams/bootstrapRunProductExecutionState.js` → `bootstrapRunConfig()` — prepare config state (category config, LLM runtime, initial needset)
- `urlQualityGate.js` → `isLowValueHost`
## Dependencies (Allowed Imports)

- `src/core/*` (config, LLM client)
- `src/shared/*` (settings defaults, primitives)
- `src/features/indexing/pipeline/` (phase modules: needSet, brandResolver, searchProfile, etc.)
- `src/features/indexing/orchestration/` (bootstrap, learning)
- `src/features/crawl/` (adapters, plugins, crawl session)
- `src/planner/sourcePlanner.js` (source planning)
- `src/categories/loader.js`, `src/billing/*`, `src/intel/*`
- `zod` (schema validation)

**Forbidden:** `src/pipeline/` must NOT import from `src/app/api/`, `src/db/` directly (DB access via injected `specDb`), or `src/app/cli/`.

## Domain Invariants

- `runProduct()` is the single entry point. All phase orchestration flows through it.
- Crawl session lifecycle: instantiate → run → teardown (via `src/features/crawl/`).
- Phase execution delegated to `src/features/indexing/pipeline/` vertical modules.
- Host budget tracking prevents excessive retries against a single domain.
- No direct database file access — all through injected `specDb`.
