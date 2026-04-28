## Purpose
Own indexing discovery, extraction, validation, learning, search, and orchestration behavior behind the canonical `src/features/indexing/**` boundary.
This feature is the control plane for need-driven discovery and deterministic indexing execution.

## Public API (The Contract)
- `src/features/indexing/index.js`: re-exports the orchestration contract and `getIndexingFeatureInfo()`.
- `src/features/indexing/orchestration/index.js`: canonical cross-boundary orchestration exports for bootstrap, discovery seeding, execution phases, quality gates, and finalization lifecycles.
- `src/features/indexing/api/{indexlabRoutes,queueBillingLearningRoutes,runtimeOpsRoutes,sourceStrategyRoutes,specSeedsRoutes}.js`: HTTP route registrars for indexing-owned API surfaces.
- `GET /billing/global/model-costs`: returns the registry-owned model cost catalog; provider IDs are registry provider IDs, and `provider_kind` is the normalized display/logo kind.
- `GET /billing/global/dashboard`: bundles current-month filtered + unfiltered rollups + prior-month filtered summary + daily breakdown into one payload (collapses 9 page-load queries into 1). Accepts `category`, `model`, `reason`, `access`, `month` (default current YYYY-MM), `prior_month` (default month-1), `months` (default 1).
- `GET /indexlab/runs`: returns category-scoped run summaries with persisted picker metadata (`picker_label`, `storage_origin`, `storage_state`) for GUI run selection.
- `GET /storage/runs/:runId`: returns SQL-projected storage run detail with bounded `sources` and `sources_page` metadata; `GET /storage/runs/:runId/sources/:contentHash/html` serves the SQL-indexed gzipped HTML artifact for a source.
- `GET /indexlab/run/:runId/runtime/extractions/crawl4ai/:filename`: serves a persisted Crawl4AI JSON extraction artifact for Runtime Ops.
- `src/features/indexing/{discovery,learning,search}/index.js`: feature-owned subcontracts used inside indexing and by approved callers that need those focused seams.
- `readSourcesDocument({ root, category, specDb? })` / `writeSourcesDocument({ root, category, data, specDb? })`: source strategy persistence helpers. SpecDb is runtime primary when supplied; `sources.json` is rebuild/fallback.

## Dependencies
- Allowed: internal indexing modules under `src/features/indexing/**`, `src/core/**`, `src/shared/**`, and existing runtime seams in `src/{adapters,api,categories,components,db,engine,evidence,field-rules,index,indexlab,intel,pipeline,research,s3,scoring,utils}` plus `src/features/catalog/index.js`.
- Forbidden: deep imports into other feature internals; new cross-boundary consumers should use `src/features/indexing/index.js` or another explicit indexing export.

## Domain Invariants
- `src/features/indexing/index.js` is the cross-boundary entrypoint for indexing capabilities.
- Need-driven discovery, deterministic artifact generation, and explicit quality gates remain mandatory across this boundary.
- Persisted run-list metadata is the SSOT for completed/archived picker rows; live run identity comes from the active process status contract until the run is materialized in `/indexlab/runs`.
- Source strategy and spec seed GUI/runtime reads use SpecDb when available. `sources.json` and `spec_seeds.json` are rebuild mirrors, not the live authority.
- New indexing work belongs under this feature boundary, not retired top-level indexing roots.
