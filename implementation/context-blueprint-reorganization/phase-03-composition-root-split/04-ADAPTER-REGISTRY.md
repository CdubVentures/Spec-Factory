# Phase 03 Adapter Registry

## Active Transitional Seams

| Seam ID | Legacy Surface | Adapter Intent | Planned Replacement Contract | Owner | Expiry Phase | Status |
|---|---|---|---|---|---|---|
| `CR-CLI-01` | `src/cli/spec.js` | move command dispatch and handler binding into app-layer CLI modules | `src/app/cli/*` delegates to feature `index.js` contracts | `app/cli` | `phase-05-backend-wave-b` | `IN_PROGRESS` |
| `CR-CLI-02` | `src/cli/spec.js` | move command domain logic out of composition root by command family slices (`CLI-S2`..`CLI-S5`) | feature contracts (`catalog-identity`, `studio-authoring`, `runtime-intelligence`, `review-curation`, `publishing-learning`, `settings-authority`) | `app/cli` | `phase-05-backend-wave-b` | `SCOPED` |
| `CR-CLI-03` | `src/cli/spec.js` | extract ops/meta and lifecycle command orchestration (`CLI-S6`) from root | app/infrastructure lifecycle adapters | `app/cli` | `phase-05-backend-wave-b` | `SCOPED` |
| `CR-API-01` | `src/api/guiServer.js` | isolate bootstrap/request-dispatch shell and route registry wiring (`API-S1`,`API-S2`) | `src/app/api/*` bootstrap + feature route adapters | `app/api` | `phase-04-backend-wave-a` | `IN_PROGRESS` |
| `CR-API-02` | `src/api/guiServer.js` | move mixed request/business helper routines (`API-S3`) behind feature contracts | feature contracts + route adapter modules | `app/api` | `phase-04-backend-wave-a` | `IN_PROGRESS` |
| `CR-API-03` | `src/api/guiServer.js` | extract process/ws orchestration seams (`API-S4`,`API-S5`) into app/infrastructure adapters | app runtime-ops adapter + infrastructure ws/process modules | `app/api` | `phase-05-backend-wave-b` | `IN_PROGRESS` |

## Relation to Phase 02 Seams

- Phase 02 seams `A-001` and `A-002` are expanded into the more specific Phase 03 composition-root seams above.
- Downstream phases should use `CR-*` IDs for composition-root split tracking.

## Metadata Requirements

Every seam entry and exception update must include:

1. `seam_id`
2. `owner`
3. `replacement_contract`
4. `expiry_phase`
5. `validation_tests`
6. `rollback_or_cleanup_task`
