# Phase 02 Boundary Rulebook

## Dependency Direction

```text
app/composition roots -> feature public contracts -> shared-core/shared -> infrastructure
```

The target rule above is enforced immediately as a contract policy and applied in transition through legacy path-group ownership defined in `02-CONTEXT-OWNERSHIP-MATRIX.md`.

## Direction Map (Codified)

| Layer | Allowed Dependencies | Disallowed Dependencies |
|---|---|---|
| app/composition roots | feature public contracts | deep feature internals and ad hoc cross-domain imports |
| feature internals | same-feature internals, shared-core/shared, infrastructure | other-feature internals |
| shared-core/shared | shared primitives/contracts only | app wiring and feature orchestration |
| infrastructure | external systems/adapters only | feature business policy logic |

## Allowed Rules

1. `app` layer may depend on feature public contracts only.
2. Feature internals may depend on:
   - same-feature internals
   - `shared-core` (backend) or `shared` (frontend)
   - `infrastructure`
3. Cross-feature communication is allowed only via target feature `index` contract.
4. Temporary adapters are allowed when required for incremental migration, with explicit tracking.

## Forbidden Rules

1. Direct imports from another feature's internal paths.
2. New generic helper dumping in non-owned global buckets.
3. Feature internals importing composition-root wiring code.
4. Contract bypass imports from legacy paths when a feature contract exists.
5. Settings reads/writes that bypass `settings-authority` contract surfaces.

## Transitional Legacy Overlay

Until `src/features/*` and `tools/gui-react/src/features/*` are physically extracted, boundary checks and migration reviews use these owning legacy groups:

| Context | Backend Legacy Groups | Frontend Legacy Groups |
|---|---|---|
| `catalog-identity` | `src/catalog/*`, `src/categories/*` | `tools/gui-react/src/pages/overview/*`, `product/*`, `catalog/*` |
| `studio-authoring` | `src/studio/*`, `src/ingest/*`, `src/field-rules/*` | `tools/gui-react/src/pages/studio/*` |
| `runtime-intelligence` | `src/pipeline/*`, `src/indexlab/*`, `src/runtime/*` | `tools/gui-react/src/pages/indexing/*`, `runtime/*`, `runtime-ops/*` |
| `review-curation` | `src/review/*` | `tools/gui-react/src/pages/review/*`, `component-review/*` |
| `publishing-learning` | `src/publish/*`, `src/learning/*`, `src/billing/*` | `tools/gui-react/src/pages/billing/*` |
| `settings-authority` | `src/api/routes/configRoutes.js`, `src/api/routes/sourceStrategyRoutes.js`, `src/api/services/settingsContract.js`, `src/api/services/userSettingsService.js`, `src/shared/settingsDefaults.js` | `tools/gui-react/src/pages/pipeline-settings/*`, `llm-settings/*`, `storage/*`, settings authority stores |

## Requires Adapter (Transitional Rules)

1. Legacy mixed modules not yet extracted but still required by active flows.
2. API handlers that currently depend on mixed legacy helpers.
3. Frontend pages that still consume pre-feature stores during transition.

Every adapter exception must include all metadata fields below and be logged in `06-RISK-REGISTER.md`:

- context owner
- expiry target phase
- replacement contract path
- test evidence
- rollback or cleanup task reference

## Active Adapter Seams (Phase 02 Baseline)

| Seam ID | Legacy Caller | Replacement Contract | Owner | Expiry Phase |
|---|---|---|---|---|
| `A-001` | `src/cli/spec.js` | feature `index.js` contracts through app CLI command layer | `app/cli` | `phase-05-backend-wave-b` |
| `A-002` | `src/api/guiServer.js` | feature `index.js` contracts through route registries | `app/api` | `phase-05-backend-wave-b` |
| `A-003` | `src/pipeline/runProduct.js` | `runtime-intelligence` contract + `settings-authority` contract | `runtime-intelligence` | `phase-04-backend-wave-a` |
| `A-004` | `tools/gui-react/src/pages/studio/StudioPage.tsx` | `studio-authoring` frontend contract | `studio-authoring` | `phase-06-frontend-feature-slicing` |
| `A-005` | `tools/gui-react/src/pages/indexing/IndexingPage.tsx` | `runtime-intelligence` frontend contract + settings contract | `runtime-intelligence` | `phase-06-frontend-feature-slicing` |

## Boundary Enforcement Stages

1. Phase 02: warn mode architecture checks.
2. Phase 03-06: keep warn mode, reduce warning count to zero per migrated area.
3. Phase 07: promote checks to blocking mode in CI.

## Rulebook Governance

- Rule changes require updates to:
  - `02-CONTEXT-OWNERSHIP-MATRIX.md`
  - `04-CONTRACT-ENTRYPOINT-INVENTORY.md`
  - `05-ARCHITECTURE-TEST-PLAN.md`
- Rule exceptions must be logged in:
  - `06-RISK-REGISTER.md`
