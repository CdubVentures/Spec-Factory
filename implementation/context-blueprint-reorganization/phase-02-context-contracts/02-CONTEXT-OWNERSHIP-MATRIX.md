# Phase 02 Context Ownership Matrix

Snapshot date: 2026-02-26

## Primary Context Ownership

| Context | Backend Ownership | Frontend Ownership | Public Contract Entry |
|---|---|---|---|
| `catalog-identity` | catalog identity data, product/category lookup flows, catalog-facing routes | `Overview`, `Selected Product`, `Categories`, `Catalog` surfaces | `src/features/catalog-identity/index.js`, `tools/gui-react/src/features/catalog-identity/index.ts` |
| `studio-authoring` | authoring ingest flows, field-rules authoring and compile orchestration inputs | `Field Rules Studio`, `Field Test` drawer | `src/features/studio-authoring/index.js`, `tools/gui-react/src/features/studio-authoring/index.ts` |
| `runtime-intelligence` | runtime/indexing orchestration, runtime observability, shared runtime DTOs | `Indexing Lab`, `Runtime Ops` | `src/features/runtime-intelligence/index.js`, `tools/gui-react/src/features/runtime-intelligence/index.ts` |
| `review-curation` | review decisions, review mutation APIs, component review flows | `Review Grid`, `Review Components` | `src/features/review-curation/index.js`, `tools/gui-react/src/features/review-curation/index.ts` |
| `publishing-learning` | publish and learning rollups, publish-facing service composition | `Billing & Learning` | `src/features/publishing-learning/index.js`, `tools/gui-react/src/features/publishing-learning/index.ts` |
| `settings-authority` | settings contracts, persistence services, settings routes and authority policy | `Pipeline Settings`, `Review LLM`, `Storage` | `src/features/settings-authority/index.js`, `tools/gui-react/src/features/settings-authority/index.ts` |

## Runtime-Intelligence Internal Clustering

| Subcontext | Ownership |
|---|---|
| `runtime-intelligence/indexing-lab` | indexing runs, pipeline controls, indexing-specific panel flow |
| `runtime-intelligence/runtime-ops` | runtime operations, diagnostics, execution inspection surfaces |
| `runtime-intelligence/shared` | shared DTOs, mappers, state/selectors used by indexing + runtime-ops |

## Cross-Context Interaction Matrix (Contract-Only)

| Caller | Target | Allowed Contract Path |
|---|---|---|
| `app` composition roots | any feature context | feature `index` contract only |
| `studio-authoring` | `catalog-identity` | catalog read selectors through catalog contract |
| `runtime-intelligence` | `settings-authority` | settings snapshots/knobs through settings contract |
| `review-curation` | `catalog-identity` | product/category identity through catalog contract |
| `publishing-learning` | `review-curation` | review aggregate output through review contract |
| any feature | `shared-core` / frontend `shared` | shared primitives and shared contracts only |

## Ownership Notes

- Tab-order alignment is preserved: `catalog-identity` first, `settings-authority` after `publishing-learning`.
- Runtime surfaces stay clustered under one feature root to avoid duplicated logic between `Indexing Lab` and `Runtime Ops`.
- Runtime-intelligence subcontext contract layout (`indexing-lab`, `runtime-ops`, `shared`) is documented in `04-CONTRACT-ENTRYPOINT-INVENTORY.md`.
- Any unowned legacy module discovered during migration must be assigned before extraction proceeds.
