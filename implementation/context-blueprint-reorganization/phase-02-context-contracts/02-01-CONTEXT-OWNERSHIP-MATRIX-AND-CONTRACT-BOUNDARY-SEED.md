# 02-01 Context Ownership Matrix and Contract Boundary Seed

## Status

- Task ID: `02-01`
- State: `COMPLETED`
- Start date: `2026-02-26`
- Owner: `Architecture Reorganization Track`

## Objective

Produce the first explicit context ownership matrix and define contract entry boundaries for each feature context.

## Scope

- Backend feature ownership map.
- Frontend feature ownership map.
- Shared-core and infrastructure ownership rules.
- Cross-feature allowed interaction paths via public contracts only.

## Context Ownership Matrix (Seed)

| Context | Backend Ownership (Seed) | Frontend Ownership (Seed) | Notes |
|---|---|---|---|
| `catalog-identity` | `src/catalog/*`, catalog-facing API routes | `pages/overview`, `pages/product`, `pages/catalog`, category/product selectors | Includes tab group: `Overview`, `Selected Product`, `Categories`, `Catalog` |
| `studio-authoring` | `src/ingest/*` (studio-authoring surfaces), `src/field-rules/*` authoring-facing flows | `pages/studio/*`, studio workbench, map validation | Includes `Field Rules Studio` and Field Test drawer entry |
| `runtime-intelligence/indexing-lab` | `src/pipeline/*`, indexing orchestration, indexlab run flows | `pages/indexing/*` | Primary indexing loop, run controls, event/readiness surfaces |
| `runtime-intelligence/runtime-ops` | runtime ops APIs/builders and runtime observability projections | `pages/runtime-ops/*` | Operations and inspection surfaces |
| `runtime-intelligence/shared` | shared runtime-intelligence DTOs/mappers/contracts | shared runtime-intelligence stores/hooks/types used by indexing + runtime-ops | Prevents duplicate copies across indexing/runtime-ops |
| `review-curation` | `src/review/*`, review APIs/mutations, component/enum review workflows | `pages/review/*`, `pages/component-review/*` | Includes `Review Grid` + `Review Components` |
| `publishing-learning` | `src/publish/*`, `src/learning/*` (publishing-facing) | `pages/billing/*` and related rollup UX | Includes `Billing & Learning` |
| `settings-authority` | settings contract/services/routes ownership | `stores/*settings*`, `pages/pipeline-settings/*`, `pages/llm-settings/*`, `pages/storage/*` | Includes `Pipeline Settings`, `Review LLM`, `Storage` |

## Boundary Rules (Seed)

### Allowed

1. `app` may call feature public contracts only.
2. Feature internals may call:
   - same feature internals
   - `shared-core` / frontend `shared`
   - `infrastructure`
3. Cross-feature calls only through target feature `index` contract.

### Forbidden

1. Direct import of another feature's internal module path.
2. New generic helper placement that bypasses feature ownership.
3. App-layer orchestration logic embedded inside feature leaf modules.

### Requires Adapter

1. Any legacy path currently imported cross-domain that cannot be moved in one step.
2. Any API route still coupled to legacy mixed modules during transition.
3. Any frontend page/store dependency on legacy path outside owning feature boundary.

## Contract Entry Seed (Initial)

### Backend (planned)

- `src/features/catalog-identity/index.js`
- `src/features/studio-authoring/index.js`
- `src/features/runtime-intelligence/index.js`
- `src/features/review-curation/index.js`
- `src/features/publishing-learning/index.js`
- `src/features/settings-authority/index.js`

### Frontend (planned)

- `tools/gui-react/src/features/catalog-identity/index.ts`
- `tools/gui-react/src/features/studio-authoring/index.ts`
- `tools/gui-react/src/features/runtime-intelligence/index.ts`
- `tools/gui-react/src/features/review-curation/index.ts`
- `tools/gui-react/src/features/publishing-learning/index.ts`
- `tools/gui-react/src/features/settings-authority/index.ts`

## First-Pass Boundary Test Seed (Warn Mode)

1. Backend import guard:
   - detect `src/features/<A>/**` importing `src/features/<B>/**` where `A != B` and not via `index.js`.
2. Frontend import guard:
   - detect `tools/gui-react/src/features/<A>/**` importing `.../features/<B>/**` where `A != B` and not via `index.ts`.
3. Legacy hotpath watchlist:
   - `src/cli/spec.js`
   - `src/api/guiServer.js`
   - `src/pipeline/runProduct.js`
   - `tools/gui-react/src/pages/studio/StudioPage.tsx`
   - `tools/gui-react/src/pages/indexing/IndexingPage.tsx`

## Planned Outputs

1. Context ownership matrix draft (backend + frontend).
2. Boundary rules list (`allowed`, `forbidden`, `requires-adapter`).
3. First-pass contract entrypoint inventory (`index.js` / `index.ts`).
4. Candidate architecture boundary test seed list (warn mode).
5. Promotion targets for canonical Phase 02 artifacts.

## Completion Criteria

- [x] Every target feature context has declared ownership scope.
- [x] Cross-feature interaction table is drafted.
- [x] Contract entrypoint skeleton list is drafted.
- [x] Phase 02 summary and index are aligned with outputs.
- [x] Boundary test specification draft promoted into Phase 02 work-item sequence.

## Next Task

- `02-02`: Boundary rule codification draft and test harness scoping.
