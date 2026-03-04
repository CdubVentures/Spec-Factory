# 03-03 API Composition Root Thinning Plan

## Status

- Task ID: `03-03`
- State: `COMPLETED`
- Start date: `2026-02-26`
- Completion date: `2026-02-26`
- Owner: `Architecture Reorganization Track`

## Objective

Define an incremental extraction plan that thins `src/api/guiServer.js` into bootstrap + registry wiring only.

## Scope

- Separate server bootstrap, route registry wiring, and process/ws orchestration seams.
- Define extraction order for mixed helper logic currently embedded in `guiServer.js`.
- Preserve route behavior and response contracts during moves.
- Define characterization coverage for API entrypoint stability.

## API Split Target (Phase 03)

`src/api/guiServer.js` retains:

1. server bootstrap/start wiring
2. route registry assembly and request dispatch
3. delegation to app-layer/feature adapters

`src/api/guiServer.js` no longer owns:

1. mixed domain helper logic
2. process/runtime lifecycle policy logic
3. websocket/watcher business-event coupling logic

## Route/Helper Extraction Order (Scoped)

| Slice ID | Focus Area | Primary Surface | Delegation Target | Risk Level |
|---|---|---|---|---|
| `API-S1` | bootstrap/request-dispatch shell | `createServer`, `parsePath`, `handleApi` envelope | `src/app/api/server/*` (planned) | `HIGH` |
| `API-S2` | route registry normalization | 12 `register*Routes` bindings | app-layer route registry module | `HIGH` |
| `API-S3` | mixed route/business helpers | review/catalog/studio/test-mode helper routines | feature route adapters/contracts | `MEDIUM` |
| `API-S4` | process/runtime lifecycle orchestration | `startProcess`, `stopProcess`, `processStatus`, searxng/process helpers | app runtime adapter + infrastructure/process | `HIGH` |
| `API-S5` | websocket/watcher orchestration | `broadcastWs`, `setupWatchers` and event fanout hooks | app ws adapter + infrastructure/ws | `MEDIUM` |

## Adapter Mapping (API)

| Seam ID | Slice Coverage | Replacement Contract | Owner | Expiry Phase |
|---|---|---|---|---|
| `CR-API-01` | `API-S1`,`API-S2` | app-layer API bootstrap/registry modules | `app/api` | `phase-04-backend-wave-a` |
| `CR-API-02` | `API-S3` | feature contracts via route adapter modules | `app/api` | `phase-04-backend-wave-a` |
| `CR-API-03` | `API-S4`,`API-S5` | app runtime/ws adapters + infrastructure/process/ws | `app/api` | `phase-05-backend-wave-b` |

## Characterization Coverage (API)

Scoped characterization coverage for API thinning:

- route registry parity (all current route groups remain wired)
- request/response parity for critical route families
- process lifecycle parity (`start/stop/status`)
- websocket/watcher stability for event fanout

Planned test artifacts:

- `test/guiServerRouteRegistryWiring.test.js`
- `test/guiServerProcessLifecycleContract.test.js`

## Rollback Procedure (Per Slice)

1. extract one slice only (`API-Sn`) per change set
2. run slice-focused characterization + existing API regressions
3. on regression, revert current slice extraction only
4. log rollback in `06-RISK-REGISTER.md`
5. restart slice with narrower seam boundary

## Outputs Produced

1. API split blueprint updates:
   - `02-COMPOSITION-ROOT-INVENTORY.md`
   - `03-DELEGATION-SEAM-RULEBOOK.md`
2. Adapter mapping updates:
   - `04-ADAPTER-REGISTRY.md`
3. Coverage and execution updates:
   - `05-ENTRYPOINT-CHARACTERIZATION-TEST-PLAN.md`
   - `07-EXECUTION-CHECKLIST.md`
4. Phase status alignment:
   - `00-INDEX.md`
   - `SUMMARY.md`
   - `../00-INDEX.md`

## Validation Evidence

Command:

```bash
node --test test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js test/runtimeSettingsApi.test.js test/reviewRoutesDataChangeContract.test.js
```

Result: `22/22` passing.

## Implementation Follow-Through (API-S1 + API-S2 Landed, API-S3 Continued + API-S4 + API-S5 Extraction)

Implemented extraction:

- app-layer API dispatch module:
  - `src/app/api/requestDispatch.js`
- app-layer API route-registry module:
  - `src/app/api/routeRegistry.js`
- app-layer API mixed-helper module (initial API-S3 slice):
  - `src/app/api/catalogHelpers.js`
- app-layer API category-alias module (API-S3 continuation slice):
  - `src/app/api/categoryAlias.js`
- app-layer API spec-db runtime module (API-S3 continuation slice):
  - `src/app/api/specDbRuntime.js`
- app-layer API process/runtime lifecycle module (API-S4 slice):
  - `src/app/api/processRuntime.js`
- app-layer API realtime websocket/watcher module (API-S5 slice):
  - `src/app/api/realtimeBridge.js`
- `src/api/guiServer.js` request path parsing, sequential route dispatch, and HTTP API envelope now delegate via:
  - `createApiPathParser`
  - `createApiRouteDispatcher`
  - `createApiHttpRequestHandler`
- `src/api/guiServer.js` route handler registrations now delegate through app-layer route registry:
  - `createGuiApiRouteRegistry`
- `src/api/guiServer.js` catalog/patch helper routines now delegate through app-layer helper factories:
  - `createCatalogBuilder`
  - `createCompiledComponentDbPatcher`
- `src/api/guiServer.js` category alias resolution now delegates through app-layer alias factory:
  - `createCategoryAliasResolver`
- `src/api/guiServer.js` spec-db runtime ownership now delegates through app-layer runtime factory:
  - `createSpecDbRuntime`
- `src/api/guiServer.js` process + searxng lifecycle orchestration now delegates through app-layer runtime factory:
  - `createProcessRuntime`
- `src/api/guiServer.js` websocket upgrade wiring, fanout filtering, and watcher orchestration now delegate through app-layer realtime factory:
  - `createRealtimeBridge`
- characterization coverage for API-S1/API-S2/API-S3/API-S4/API-S5 extraction behavior:
  - `test/guiServerRouteRegistryWiring.test.js`
  - `test/apiCatalogHelpersWiring.test.js`
  - `test/apiCategoryAliasWiring.test.js`
  - `test/apiSpecDbRuntimeWiring.test.js`
  - `test/apiProcessRuntimeWiring.test.js`
  - `test/apiRealtimeBridgeWiring.test.js`

Validation commands:

```bash
node --check src/app/api/routeRegistry.js
node --check src/app/api/catalogHelpers.js
node --check src/app/api/categoryAlias.js
node --check src/app/api/specDbRuntime.js
node --check src/app/api/processRuntime.js
node --check src/app/api/realtimeBridge.js
node --check src/api/guiServer.js
node --test test/apiRealtimeBridgeWiring.test.js test/apiProcessRuntimeWiring.test.js test/apiSpecDbRuntimeWiring.test.js test/apiCategoryAliasWiring.test.js test/apiCatalogHelpersWiring.test.js test/guiServerRouteRegistryWiring.test.js test/guiServerRootPathResolution.test.js test/dataAuthorityRoutes.test.js test/runtimeSettingsApi.test.js test/reviewRoutesDataChangeContract.test.js
```

Results:

- syntax check passing
- `38/38` passing

## Completion Criteria

- [x] Route registry extraction order is documented.
- [x] API adapter seams have owner and expiry phase.
- [x] Characterization coverage for API root behavior is defined.
- [x] Process/ws split strategy keeps startup and run-state behavior stable.

## Next Task

- `03-04`: characterization guardrail and Phase 04 handoff packet.
