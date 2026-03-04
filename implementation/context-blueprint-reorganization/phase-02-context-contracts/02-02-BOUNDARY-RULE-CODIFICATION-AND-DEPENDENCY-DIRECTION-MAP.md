# 02-02 Boundary Rule Codification and Dependency Direction Map

## Status

- Task ID: `02-02`
- State: `COMPLETED`
- Start date: `2026-02-26`
- Completion date: `2026-02-26`
- Owner: `Architecture Reorganization Track`

## Objective

Promote seed boundary rules into a canonical, enforceable rulebook with explicit dependency direction and exception handling.

## Scope

- Finalize dependency direction model.
- Finalize allowed/forbidden/requires-adapter rules.
- Define exception metadata requirements.
- Link rulebook to ownership matrix and contract inventory.

## Dependency Direction Map (Codified)

```text
app/composition roots -> feature public contracts -> shared-core/shared -> infrastructure
```

| Layer | May Depend On | Must Not Depend On | Legacy Anchors |
|---|---|---|---|
| app/composition roots | feature contracts only | deep feature internals and cross-domain ad hoc imports | `src/cli/spec.js`, `src/api/guiServer.js`, GUI bootstrap/router surfaces |
| feature internals | same-feature internals, `shared-core`/`shared`, `infrastructure` | other-feature internals | backend and frontend context-owned modules listed in `02-CONTEXT-OWNERSHIP-MATRIX.md` |
| shared-core/shared | shared primitives/contracts only | app wiring and feature orchestration | `src/shared/*`, `tools/gui-react/src/shared/*` (target) |
| infrastructure | infra adapters/external boundaries | feature business policy decisions | `src/infrastructure/*` (target), current infra-like roots under `src/api/services/*`, storage/ws/process adapters |

## Legacy-to-Target Direction Mapping (Transition Overlay)

The repository is currently pre-slice (`src/features` and `tools/gui-react/src/features` are not yet present). Until Phase 03+ extraction lands, rule enforcement is applied as a path-group overlay:

| Target Context | Backend Legacy Roots (Current) | Frontend Legacy Roots (Current) | Target Contract Path |
|---|---|---|---|
| `catalog-identity` | `src/catalog/*`, `src/categories/*` | `tools/gui-react/src/pages/overview/*`, `product/*`, `catalog/*` | `src/features/catalog-identity/index.js`, `tools/gui-react/src/features/catalog-identity/index.ts` |
| `studio-authoring` | `src/studio/*`, `src/ingest/*`, `src/field-rules/*` | `tools/gui-react/src/pages/studio/*` | `src/features/studio-authoring/index.js`, `tools/gui-react/src/features/studio-authoring/index.ts` |
| `runtime-intelligence` | `src/pipeline/*`, `src/indexlab/*`, `src/runtime/*` | `tools/gui-react/src/pages/indexing/*`, `runtime/*`, `runtime-ops/*` | `src/features/runtime-intelligence/index.js`, `tools/gui-react/src/features/runtime-intelligence/index.ts` |
| `review-curation` | `src/review/*` | `tools/gui-react/src/pages/review/*`, `component-review/*` | `src/features/review-curation/index.js`, `tools/gui-react/src/features/review-curation/index.ts` |
| `publishing-learning` | `src/publish/*`, `src/learning/*`, `src/billing/*` | `tools/gui-react/src/pages/billing/*` | `src/features/publishing-learning/index.js`, `tools/gui-react/src/features/publishing-learning/index.ts` |
| `settings-authority` | `src/api/routes/configRoutes.js`, `src/api/routes/sourceStrategyRoutes.js`, `src/api/services/settingsContract.js`, `src/api/services/userSettingsService.js`, `src/shared/settingsDefaults.js` | `tools/gui-react/src/pages/pipeline-settings/*`, `llm-settings/*`, `storage/*`, settings authority stores under `tools/gui-react/src/stores/*Settings*` and `*settings*` | `src/features/settings-authority/index.js`, `tools/gui-react/src/features/settings-authority/index.ts` |

## Rule Codification (Final for Phase 02)

### Allowed

1. App/composition roots may orchestrate multiple contexts, but only through contract facades.
2. Feature internals may import only same-context internals, shared primitives/contracts, and infrastructure adapters.
3. Cross-context reads/writes are allowed only via target context entrypoint contracts.
4. Transitional adapters are allowed only when tracked in the exception registry with owner and expiry phase.

### Forbidden

1. Direct cross-context internal imports (legacy path to legacy path or future feature-internal to feature-internal).
2. New mixed-responsibility helpers placed outside an owning context.
3. Composition-root logic added inside feature leaf modules.
4. Bypassing `settings-authority` for settings reads/writes in runtime, studio, review, or publishing surfaces.

### Requires Adapter (Initial Registry)

| Seam ID | Legacy Caller | Current Coupling Signal | Replacement Contract Path | Owner | Expiry Phase |
|---|---|---|---|---|---|
| `A-001` | `src/cli/spec.js` | imports across many roots (`pipeline`, `ingest`, `review`, `publish`, `llm`, `indexlab`) | app CLI command layer -> feature `index.js` contracts | `app/cli` | `phase-05-backend-wave-b` |
| `A-002` | `src/api/guiServer.js` | direct mixed domain imports (`review`, `publish`, `learning`, `catalog`, settings services) | route registries -> feature `index.js` contracts | `app/api` | `phase-05-backend-wave-b` |
| `A-003` | `src/pipeline/runProduct.js` | runtime orchestration mixed with settings, ingest, review, and learning dependencies | `runtime-intelligence` contract + `settings-authority` contract seam | `runtime-intelligence` | `phase-04-backend-wave-a` |
| `A-004` | `tools/gui-react/src/pages/studio/StudioPage.tsx` | cross-page/store and global settings authority coupling | `studio-authoring` frontend contract | `studio-authoring` | `phase-06-frontend-feature-slicing` |
| `A-005` | `tools/gui-react/src/pages/indexing/IndexingPage.tsx` | mixed `indexing` + `runtime-ops` + settings store imports | `runtime-intelligence` frontend contract + `settings-authority` contract | `runtime-intelligence` | `phase-06-frontend-feature-slicing` |

## Exception Metadata Requirements (Final)

Every adapter exception and rule bypass must capture:

1. `date`
2. `rule_exception`
3. `context_owner`
4. `legacy_path`
5. `replacement_contract`
6. `expiry_phase`
7. `validation_tests`
8. `rollback_or_cleanup_task`

## Outputs Produced

1. Boundary rulebook codification update:
   - `03-BOUNDARY-RULEBOOK.md`
2. Risk/exception schema alignment update:
   - `06-RISK-REGISTER.md`
3. Execution checklist progress update:
   - `07-EXECUTION-CHECKLIST.md`
4. Phase status alignment updates:
   - `00-INDEX.md`
   - `SUMMARY.md`

## Completion Criteria

- [x] Dependency direction rule is finalized.
- [x] Allowed/forbidden/requires-adapter sections are finalized.
- [x] Exception metadata format is documented.
- [x] Cross-links to ownership matrix and contract inventory are complete.

## Next Task

- `02-03`: Public contract entrypoint spec and adapter plan.
