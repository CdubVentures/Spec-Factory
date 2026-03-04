# Phase 02 Contract Entrypoint Inventory

Snapshot date: 2026-02-26

## Backend Feature Contracts

| Context | Entrypoint | Contract Scope (Planned) | Primary Legacy Sources (Current) | Migration State |
|---|---|---|---|---|
| `catalog-identity` | `src/features/catalog-identity/index.js` | product/category lookup, identity selectors, catalog route facades | `src/catalog/*`, `src/categories/*` | `PLANNED` |
| `studio-authoring` | `src/features/studio-authoring/index.js` | studio authoring orchestration, map/rule authoring interfaces | `src/studio/*`, `src/ingest/*`, `src/field-rules/*` | `PLANNED` |
| `runtime-intelligence` | `src/features/runtime-intelligence/index.js` | indexing/runtime orchestration facades and shared runtime contract exports | `src/pipeline/*`, `src/indexlab/*`, `src/runtime/*` | `PLANNED` |
| `review-curation` | `src/features/review-curation/index.js` | review queries/mutations and curation workflows | `src/review/*` | `PLANNED` |
| `publishing-learning` | `src/features/publishing-learning/index.js` | publishing/learning rollup services and outputs | `src/publish/*`, `src/learning/*`, `src/billing/*` | `PLANNED` |
| `settings-authority` | `src/features/settings-authority/index.js` | settings reads/writes, defaults, authority policy accessors | `src/api/services/settingsContract.js`, `src/api/services/userSettingsService.js`, `src/api/routes/configRoutes.js`, `src/api/routes/sourceStrategyRoutes.js`, `src/shared/settingsDefaults.js` | `PLANNED` |

## Frontend Feature Contracts

| Context | Entrypoint | Contract Scope (Planned) | Primary Legacy Sources (Current) | Migration State |
|---|---|---|---|---|
| `catalog-identity` | `tools/gui-react/src/features/catalog-identity/index.ts` | selectors, hooks, shared UI slices for overview/product/catalog tabs | `tools/gui-react/src/pages/overview/*`, `product/*`, `catalog/*` | `PLANNED` |
| `studio-authoring` | `tools/gui-react/src/features/studio-authoring/index.ts` | studio components/hooks/store facades and field-test interactions | `tools/gui-react/src/pages/studio/*` | `PLANNED` |
| `runtime-intelligence` | `tools/gui-react/src/features/runtime-intelligence/index.ts` | indexing/runtime shared selectors, hooks, and panel contracts | `tools/gui-react/src/pages/indexing/*`, `runtime/*`, `runtime-ops/*` | `PLANNED` |
| `review-curation` | `tools/gui-react/src/features/review-curation/index.ts` | review-grid/review-components interaction contracts | `tools/gui-react/src/pages/review/*`, `component-review/*` | `PLANNED` |
| `publishing-learning` | `tools/gui-react/src/features/publishing-learning/index.ts` | billing/learning page-level data contracts | `tools/gui-react/src/pages/billing/*` | `PLANNED` |
| `settings-authority` | `tools/gui-react/src/features/settings-authority/index.ts` | settings surface hooks, stores, and mutation contracts | `tools/gui-react/src/pages/pipeline-settings/*`, `llm-settings/*`, `storage/*`, `tools/gui-react/src/stores/*settings*` | `PLANNED` |

## Runtime-Intelligence Internal Contract Layout (Planned)

| Scope | Planned Internal Path | Contract Note |
|---|---|---|
| `indexing-lab` | `src/features/runtime-intelligence/indexing-lab/*` and `tools/gui-react/src/features/runtime-intelligence/indexing-lab/*` | non-public internals, re-exported only through runtime-intelligence root contract |
| `runtime-ops` | `src/features/runtime-intelligence/runtime-ops/*` and `tools/gui-react/src/features/runtime-intelligence/runtime-ops/*` | non-public internals, re-exported only through runtime-intelligence root contract |
| `shared` | `src/features/runtime-intelligence/shared/*` and `tools/gui-react/src/features/runtime-intelligence/shared/*` | shared subcontext internals for indexing/runtime-ops, still non-public outside feature root contract |

## Contract Rules

1. Entrypoints export stable feature APIs only; no deep internal paths.
2. New cross-feature dependencies must target these contract entrypoints.
3. Contract changes require boundary-test update and downstream usage audit.
4. Contract functions should be capability-based and avoid exposing raw internals.
5. Settings access capabilities are exported from `settings-authority` only.

## Transitional Adapter Seams

| Seam ID | Legacy Surface | Adapter Need | Target Contract | Owner | Expiry Phase |
|---|---|---|---|---|---|
| `A-001` | `src/cli/spec.js` | command-level wiring still reaches mixed modules | feature contract adapters in app/cli composition layer | `app/cli` | `phase-05-backend-wave-b` |
| `A-002` | `src/api/guiServer.js` | route wiring touches mixed helpers | route registries call feature entrypoints only | `app/api` | `phase-05-backend-wave-b` |
| `A-003` | `src/pipeline/runProduct.js` | orchestration mixes runtime/studio/settings concerns | runtime-intelligence + settings-authority contracts | `runtime-intelligence` | `phase-04-backend-wave-a` |
| `A-004` | `tools/gui-react/src/pages/studio/StudioPage.tsx` | large page with mixed concerns | studio-authoring contract slice with explicit imports | `studio-authoring` | `phase-06-frontend-feature-slicing` |
| `A-005` | `tools/gui-react/src/pages/indexing/IndexingPage.tsx` | runtime/indexing mixed logic | runtime-intelligence feature contract layer + settings-authority contract | `runtime-intelligence` | `phase-06-frontend-feature-slicing` |
