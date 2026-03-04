# Phase 03 Composition Root Inventory

Snapshot date: 2026-02-26

## CLI Composition Root Baseline

| Metric | Value |
|---|---:|
| Path | `src/cli/spec.js` |
| LOC | `2688` |
| Imports | `45` |
| Command functions (`command*`) | `54` |

### Dependency Root Distribution (Current)

| Root | Import Count |
|---|---:|
| `src/review` | `5` |
| `src/llm` | `4` |
| `src/ingest` | `3` |
| `src/pipeline` | `2` |
| `src/learning` | `2` |
| `src/indexlab` | `2` |
| `src/publish` | `2` |

### Command-Family Segmentation (03-02 Scope)

| Command Family | Approx Command Count | Notes |
|---|---:|---|
| runtime/indexing operations | `15` | highest extraction priority after dispatch split |
| rules/studio compile + ingest | `11` | studio-authoring heavy paths |
| review/quality | `6` | review-curation and scoring flows |
| publishing/learning/reporting | `8` | publishing-learning capability seams |
| ops/meta/lifecycle | `14` | includes queue, cortex, drift, lifecycle operations |

### Composition-Root Responsibilities (Mixed)

- CLI bootstrap and config/env loading.
- Command argument parsing and dispatch.
- Direct command business logic and domain operations.
- Runtime process and daemon command orchestration.

## API Composition Root Baseline

| Metric | Value |
|---|---:|
| Path | `src/api/guiServer.js` |
| LOC | `2603` |
| Imports | `63` |
| Route registry adapters | `12` |

### Route Registry Wiring (Current)

- `registerInfraRoutes`
- `registerConfigRoutes`
- `registerIndexlabRoutes`
- `registerCatalogRoutes`
- `registerBrandRoutes`
- `registerStudioRoutes`
- `registerDataAuthorityRoutes`
- `registerReviewRoutes`
- `registerTestModeRoutes`
- `registerQueueBillingLearningRoutes`
- `registerSourceStrategyRoutes`
- `registerRuntimeOpsRoutes`

### API Slice Segmentation (03-03 Scope)

| Slice | Scope | Primary Functions/Surfaces |
|---|---|---|
| `API-S1` | bootstrap + request-dispatch shell | `http.createServer`, `parsePath`, `handleApi` envelope |
| `API-S2` | route registry consolidation | `const handle*Routes = register*Routes(...)` |
| `API-S3` | mixed route helper extraction | embedded review/catalog/studio/test-mode helper routines |
| `API-S4` | process/runtime lifecycle extraction | `startProcess`, `stopProcess`, `processStatus`, process helpers |
| `API-S5` | websocket/watcher extraction | `broadcastWs`, `setupWatchers` |

### Composition-Root Responsibilities (Mixed)

- HTTP bootstrap, static serving, and API request routing.
- Route registry context construction and handler wiring.
- Process lifecycle/start-stop and runtime run-state orchestration.
- WebSocket fanout/watchers and mixed helper business logic.

## Split Priority Signals

1. `src/cli/spec.js` command orchestration should be split before backend wave extraction to lower fan-out risk.
2. `src/api/guiServer.js` should retain only bootstrap and registry wiring after Phase 03.
3. Mixed helper/domain routines embedded in composition roots must move behind feature contracts or app-layer adapters.

## Baseline Lock

This inventory is the reference baseline for Phase 03 thinning progress and for validating that composition roots shrink in responsibility and fan-out.

## Implementation Delta (2026-02-26)

CLI split slice `CLI-S1` is now partially implemented:

- `src/cli/spec.js` no longer uses the large inline `if/else` command dispatch chain in `main()`.
- command dispatch is delegated through app-layer dispatcher module:
  - `src/app/cli/commandDispatch.js`
- dispatcher behavior is covered by:
  - `test/cliCommandDispatch.test.js` (`2/2` passing)

API split slices `API-S1` through `API-S5` are now partially implemented:

- `src/api/guiServer.js` no longer owns inline path parsing, direct sequential route-dispatch loop, inline route-registry binding lines, selected catalog/patch helper routines, process/searxng lifecycle orchestration routines, or websocket/watcher orchestration.
- request dispatch, route-registry binding, and selected helper routines are delegated through app-layer modules:
  - `src/app/api/requestDispatch.js`
  - `src/app/api/routeRegistry.js`
  - `src/app/api/catalogHelpers.js`
  - `src/app/api/categoryAlias.js`
  - `src/app/api/specDbRuntime.js`
  - `src/app/api/processRuntime.js`
  - `src/app/api/realtimeBridge.js`
- API-S1/API-S2/API-S3/API-S4/API-S5 characterization behavior is covered by:
  - `test/guiServerRouteRegistryWiring.test.js` (`4/4` passing)
  - `test/apiCatalogHelpersWiring.test.js` (`2/2` passing)
  - `test/apiCategoryAliasWiring.test.js` (`2/2` passing)
  - `test/apiSpecDbRuntimeWiring.test.js` (`2/2` passing)
  - `test/apiProcessRuntimeWiring.test.js` (`3/3` passing)
  - `test/apiRealtimeBridgeWiring.test.js` (`3/3` passing)
