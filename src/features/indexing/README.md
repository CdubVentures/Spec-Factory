## Purpose
Own indexing discovery, extraction, validation, learning, search, and orchestration behavior behind the canonical `src/features/indexing/**` boundary.
This feature is the control plane for need-driven discovery and deterministic indexing execution.

## Public API (The Contract)
- `src/features/indexing/index.js`: re-exports the orchestration contract and `getIndexingFeatureInfo()`.
- `src/features/indexing/orchestration/index.js`: canonical cross-boundary orchestration exports for bootstrap, discovery seeding, execution phases, quality gates, and finalization lifecycles.
- `src/features/indexing/api/{indexlabRoutes,queueBillingLearningRoutes,runtimeOpsRoutes,sourceStrategyRoutes}.js`: HTTP route registrars for indexing-owned API surfaces.
- `GET /billing/global/model-costs`: returns the registry-owned model cost catalog; provider IDs are registry provider IDs, and `provider_kind` is the normalized display/logo kind.
- `GET /indexlab/runs`: returns category-scoped run summaries with persisted picker metadata (`picker_label`, `storage_origin`, `storage_state`) for GUI run selection.
- `src/features/indexing/{discovery,learning,search}/index.js`: feature-owned subcontracts used inside indexing and by approved callers that need those focused seams.

## Dependencies
- Allowed: internal indexing modules under `src/features/indexing/**`, `src/core/**`, `src/shared/**`, and existing runtime seams in `src/{adapters,api,categories,components,db,engine,evidence,field-rules,index,indexlab,intel,pipeline,research,s3,scoring,utils}` plus `src/features/catalog/index.js`.
- Forbidden: deep imports into other feature internals; new cross-boundary consumers should use `src/features/indexing/index.js` or another explicit indexing export.

## Domain Invariants
- `src/features/indexing/index.js` is the cross-boundary entrypoint for indexing capabilities.
- Need-driven discovery, deterministic artifact generation, and explicit quality gates remain mandatory across this boundary.
- Persisted run-list metadata is the SSOT for completed/archived picker rows; live run identity comes from the active process status contract until the run is materialized in `/indexlab/runs`.
- New indexing work belongs under this feature boundary, not retired top-level indexing roots.
