# 02-03 Public Contract Entrypoint Spec and Adapter Plan

## Status

- Task ID: `02-03`
- State: `COMPLETED`
- Start date: `2026-02-26`
- Completion date: `2026-02-26`
- Owner: `Architecture Reorganization Track`

## Objective

Define backend/frontend contract entrypoints for every context and document transitional adapter seams for legacy mixed modules.

## Scope

- Finalize backend feature contract inventory.
- Finalize frontend feature contract inventory.
- Document transitional adapter seams and expiry phase targets.
- Ensure runtime-intelligence clustering is reflected in contract layout.

## Entrypoint Contract Spec (Final for Phase 02)

### Backend Public Entrypoints

| Context | Planned Entrypoint | Capability Scope | Consumer Layer |
|---|---|---|---|
| `catalog-identity` | `src/features/catalog-identity/index.js` | catalog/product identity queries and category lookup capabilities | `app` composition roots, `review-curation`, `studio-authoring` |
| `studio-authoring` | `src/features/studio-authoring/index.js` | field-rules authoring orchestration and studio-facing compile inputs | `app` composition roots |
| `runtime-intelligence` | `src/features/runtime-intelligence/index.js` | runtime/indexing orchestration facade and runtime shared-contract exports | `app` composition roots |
| `review-curation` | `src/features/review-curation/index.js` | review query/mutation workflow capabilities | `app` composition roots, `publishing-learning` |
| `publishing-learning` | `src/features/publishing-learning/index.js` | publish and learning rollup services | `app` composition roots |
| `settings-authority` | `src/features/settings-authority/index.js` | canonical settings read/write/defaults/authority capabilities | all contexts via contract-only access |

### Frontend Public Entrypoints

| Context | Planned Entrypoint | Capability Scope | Consumer Layer |
|---|---|---|---|
| `catalog-identity` | `tools/gui-react/src/features/catalog-identity/index.ts` | selectors/hooks for overview/product/catalog tabs | `app` shell/router and other features via contracts |
| `studio-authoring` | `tools/gui-react/src/features/studio-authoring/index.ts` | studio pages/components/store facades | `app` shell/router |
| `runtime-intelligence` | `tools/gui-react/src/features/runtime-intelligence/index.ts` | indexing/runtime shared selectors/hooks/panel contracts | `app` shell/router |
| `review-curation` | `tools/gui-react/src/features/review-curation/index.ts` | review grid/components page contracts | `app` shell/router, publishing consumers |
| `publishing-learning` | `tools/gui-react/src/features/publishing-learning/index.ts` | billing/learning page contracts | `app` shell/router |
| `settings-authority` | `tools/gui-react/src/features/settings-authority/index.ts` | settings hooks/stores/mutation capability facade | all settings consumers via contract-only access |

## Runtime-Intelligence Contract Clustering (Validated)

`runtime-intelligence` remains one public feature contract with three internal namespaces:

1. `indexing-lab`: run controls, indexing process surfaces, event/readiness projections.
2. `runtime-ops`: diagnostics, worker/runtime operations, execution inspection.
3. `shared`: cross-subcontext DTOs, mappers, selectors, and shared hook/store contracts.

Contract consumers must target `runtime-intelligence/index` only; subcontext internals are non-public.

## Adapter Plan (Final)

| Seam ID | Legacy Surface | Adapter Owner | Replacement Contract | Expiry Phase | Validation Anchor |
|---|---|---|---|---|---|
| `A-001` | `src/cli/spec.js` | `app/cli` | command handlers call feature `index.js` only | `phase-05-backend-wave-b` | architecture boundary warn-mode checks + CLI route/flow suites |
| `A-002` | `src/api/guiServer.js` | `app/api` | route registries call feature `index.js` only | `phase-05-backend-wave-b` | architecture boundary warn-mode checks + route wiring suites |
| `A-003` | `src/pipeline/runProduct.js` | `runtime-intelligence` | runtime orchestrator contract + settings contract seam | `phase-04-backend-wave-a` | runtime payload/wiring suites |
| `A-004` | `tools/gui-react/src/pages/studio/StudioPage.tsx` | `studio-authoring` | studio contract facade for page/store dependencies | `phase-06-frontend-feature-slicing` | studio GUI persistence/authority suites |
| `A-005` | `tools/gui-react/src/pages/indexing/IndexingPage.tsx` | `runtime-intelligence` | runtime-intelligence contract + settings-authority contract | `phase-06-frontend-feature-slicing` | runtime GUI propagation/wiring suites |

## Outputs Produced

1. Contract entrypoint inventory:
   - `04-CONTRACT-ENTRYPOINT-INVENTORY.md`
2. Runtime-intelligence contract clustering validation:
   - `02-CONTEXT-OWNERSHIP-MATRIX.md`
3. Checklist progress update:
   - `07-EXECUTION-CHECKLIST.md`
4. Phase status alignment updates:
   - `00-INDEX.md`
   - `SUMMARY.md`

## Completion Criteria

- [x] All feature contexts have planned backend contract entrypoints.
- [x] All feature contexts have planned frontend contract entrypoints.
- [x] Adapter seams include owner, replacement contract, and expiry phase.
- [x] Contract rules align with boundary rulebook.

## Next Task

- `02-04`: Architecture guardrail spec and Phase 03 handoff packet.
