# Backend Architecture

> **Purpose:** Describe the verified server entrypoints, bootstrap phases, route families, persistence boundaries, realtime bridge, and error handling for the live backend.
> **Prerequisites:** [system-map.md](./system-map.md), [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md)
> **Last validated:** 2026-04-10

## Entrypoints

| Surface | Path | Role |
|---------|------|------|
| server entrypoint | `src/app/api/guiServer.js` | local Node HTTP bootstrap |
| runtime assembly | `src/app/api/guiServerRuntime.js` | runtime assembly, route mounting, and WebSocket integration |
| CLI entrypoint | `src/app/cli/spec.js` | CLI command dispatcher |

## Bootstrap Phases

`src/app/api/guiServerRuntime.js` orchestrates boot through `bootstrapServer()` in `src/app/api/serverBootstrap.js` and then builds route contexts plus HTTP assembly. The live sequence is:

1. Environment bootstrap via `src/app/api/bootstrap/createBootstrapEnvironment.js`
   - loads `.env`
   - loads config through `src/config.js`
   - resolves `PORT`, `HELPER_ROOT`, `OUTPUT_ROOT`, `INDEXLAB_ROOT`, and `LAUNCH_CWD`
   - builds the config gate and storage adapter
2. Session layer + AppDb via `src/app/api/bootstrap/createBootstrapSessionLayer.js`
   - creates the category alias resolver
   - creates the lazy SpecDb runtime
   - opens AppDb eagerly at `.workspace/db/app.sqlite`
   - seeds brand, color, and unit registry tables
   - reapplies persisted runtime settings from AppDb-backed user settings
3. Domain runtimes via `src/app/api/bootstrap/createBootstrapDomainRuntimes.js`
   - review, catalog, and related domain helpers
4. Route context construction in `src/app/api/guiServerRuntime.js`
   - builds 17 route contexts
5. Route registration in `src/app/api/guiServerRuntime.js`
   - defines the `routeDefinitions` array with 17 families
6. HTTP assembly + WebSocket in `src/app/api/guiServerRuntime.js`
   - `createGuiServerHttpAssembly()` registers family handlers
   - `http.createServer()` creates the server
   - `attachWebSocketUpgrade()` wires `/ws`

`src/app/api/serverBootstrap.js` exports `BOOTSTRAP_RETURN_GROUPS`, which is the grouped return contract consumed by `guiServerRuntime.js`.

## Request Pipeline

1. `src/app/api/guiServer.js` calls `createGuiServerRuntime()`.
2. `src/app/api/guiServerRuntime.js` calls `bootstrapServer()` and builds per-family route contexts.
3. The same file defines the live `routeDefinitions` array. This is the mounted route-order SSOT.
4. `src/app/api/guiServerHttpAssembly.js` registers family handlers through `createGuiApiRouteRegistry()` and `createRegisteredGuiApiRouteHandlers()`.
5. `src/app/api/guiApiPipeline.js` wraps all route handlers.
6. `src/app/api/requestDispatch.js` dispatches requests:
   - applies CORS headers
   - returns `204` for `OPTIONS`
   - routes only `/health` and `/api/v1/*` through the API dispatcher
   - normalizes category aliases for category-scoped path segments
   - returns `404 { error: 'not_found' }` when no handler claims the request
   - returns `500 { error: 'internal', message }` on uncaught handler errors
7. `src/app/api/httpPrimitives.js` provides `jsonRes` and `readJsonBody`.
8. Non-API requests fall through to `src/app/api/staticFileServer.js`, which serves `tools/gui-react/dist/` and falls back to `index.html` for SPA routes.

## Mounted Route Families

The live route-order array in `src/app/api/guiServerRuntime.js` is exactly 17 families:

1. `infra`
2. `config`
3. `indexlab`
4. `runtimeOps`
5. `catalog`
6. `brand`
7. `color`
8. `unitRegistry`
9. `colorEditionFinder`
10. `studio`
11. `dataAuthority`
12. `queueBillingLearning`
13. `review`
14. `publisher`
15. `sourceStrategy`
16. `specSeeds`
17. `testMode`

`src/app/api/routeRegistry.js` exports `GUI_API_ROUTE_ORDER`, but it is not the mounted SSOT. It currently lists 14 keys and omits the live `unitRegistry`, `specSeeds`, and `testMode` families.

| Family key | Primary paths | Files |
|------------|---------------|-------|
| `infra` | `/health`, `/categories`, `/serper/*`, `/searxng/*`, `/process/*`, `/graphql` | `src/app/api/routes/infraRoutes.js`, `src/app/api/routes/infra/*.js` |
| `config` | `/ui-settings`, `/runtime-settings`, `/llm-policy`, `/indexing/llm-config`, `/indexing/llm-metrics`, `/indexing/domain-checklist/*`, `/indexing/review-metrics/*` | `src/features/settings/api/configRoutes.js` |
| `indexlab` | `/indexlab/runs`, `/indexlab/run/*`, `/indexlab/indexes/*`, `/indexlab/analytics/*`, `/indexlab/live-crawl/*`, `/storage/*` | `src/features/indexing/api/indexlabRoutes.js`, `src/features/indexing/api/storageManagerRoutes.js` |
| `runtimeOps` | `/indexlab/run/:runId/runtime/*` | `src/features/indexing/api/runtimeOpsRoutes.js` |
| `catalog` | `/catalog/*`, `/product/*` | `src/features/catalog/api/catalogRoutes.js` |
| `brand` | `/brands/*` | `src/features/catalog/api/brandRoutes.js` |
| `color` | `/colors/*` | `src/features/color-registry/api/colorRoutes.js` |
| `unitRegistry` | `/unit-registry`, `/unit-registry/canonicals`, `/unit-registry/:canonical`, `/unit-registry/sync` | `src/features/unit-registry/api/unitRegistryRoutes.js` |
| `colorEditionFinder` | `/color-edition-finder/*` | `src/features/color-edition/api/colorEditionFinderRoutes.js` |
| `studio` | `/field-labels/*`, `/studio/:category/*` | `src/features/studio/api/studioRoutes.js` |
| `dataAuthority` | `/data-authority/:category/*` | `src/features/category-authority/api/dataAuthorityRoutes.js` |
| `queueBillingLearning` | `/queue/*`, `/billing/*`, `/learning/*` | `src/features/indexing/api/queueBillingLearningRoutes.js` |
| `review` | `/review/*`, `/review-components/*` | `src/features/review/api/reviewRoutes.js` |
| `publisher` | `/publisher/:category/candidates`, `/publisher/:category/stats` | `src/features/publisher/api/publisherRoutes.js` |
| `sourceStrategy` | `/source-strategy/*` | `src/features/indexing/api/sourceStrategyRoutes.js` |
| `specSeeds` | `/spec-seeds` | `src/features/indexing/api/specSeedsRoutes.js` |
| `testMode` | `/test-mode/audit`, `/test-mode/validate` | `src/app/api/routes/testModeRoutes.js`, `src/app/api/routes/testModeRouteContext.js` |

## Route Context Files

Each route family receives a context object. Fifteen contexts come from dedicated factory files; two are built inline in `guiServerRuntime.js` (`specSeedsRouteContext`, `unitRegistryRouteContext`).

| Route context | Source |
|---------------|--------|
| `infraRouteContext` | `src/app/api/infraRouteContext.js` |
| `configRouteContext` | `src/features/settings/api/configRouteContext.js` |
| `indexlabRouteContext` | `src/features/indexing/api/indexlabRouteContext.js` |
| `runtimeOpsRouteContext` | `src/features/indexing/api/runtimeOpsRouteContext.js` |
| `catalogRouteContext` | `src/features/catalog/api/catalogRouteContext.js` |
| `brandRouteContext` | `src/features/catalog/api/brandRouteContext.js` |
| `colorRouteContext` | `src/features/color-registry/api/colorRouteContext.js` |
| `unitRegistryRouteContext` | inline in `src/app/api/guiServerRuntime.js` |
| `colorEditionFinderRouteContext` | `src/features/color-edition/api/colorEditionFinderRouteContext.js` |
| `studioRouteContext` | `src/features/studio/api/studioRouteContext.js` |
| `dataAuthorityRouteContext` | `src/features/category-authority/api/dataAuthorityRouteContext.js` |
| `queueBillingLearningRouteContext` | `src/features/indexing/api/queueBillingLearningRouteContext.js` |
| `reviewRouteContext` | `src/features/review/api/reviewRouteContext.js` |
| `publisherRouteContext` | `src/features/publisher/api/publisherRouteContext.js` |
| `sourceStrategyRouteContext` | `src/features/indexing/api/sourceStrategyRouteContext.js` |
| `specSeedsRouteContext` | inline in `src/app/api/guiServerRuntime.js` |
| `testModeRouteContext` | `src/app/api/routes/testModeRouteContext.js` |

## Persistence Boundaries

| Boundary | Files | Behavior |
|----------|-------|----------|
| global AppDb | `src/db/appDb.js`, `src/app/api/bootstrap/createBootstrapSessionLayer.js` | eager global SQLite store for brands, settings, studio maps, color registry, and unit registry |
| per-category SpecDb | `src/app/api/specDbRuntime.js`, `src/db/specDb.js` | lazy open and auto-seed per category |
| file-backed | `category_authority/`, `.workspace/products/`, `.workspace/runs/` | category authority control plane, product rebuild JSON, and IndexLab run output |
| user settings persistence | `src/features/settings/api/configPersistenceContext.js`, `src/features/settings-authority/userSettingsService.js` | AppDb-backed primary store with JSON fallback only when AppDb is unavailable |
| runtime roots | `src/core/config/runtimeArtifactRoots.js` | defaults to `.workspace/output` and `.workspace/runs` |
| storage adapter | `src/core/storage/storage.js` | currently local backend only |

## Settings And Policy Split

- `src/features/settings/api/configRoutes.js` mounts four live handler families:
  - UI settings via `src/features/settings/api/configUiSettingsHandler.js`
  - indexing metadata and metrics via `src/features/settings/api/configIndexingMetricsHandler.js`
  - runtime settings via `src/features/settings/api/configRuntimeSettingsHandler.js`
  - composite global LLM policy via `src/features/settings-authority/llmPolicyHandler.js`
- There is no live `/api/v1/storage-settings` route.
- There is no live `/api/v1/convergence-settings` route.
- `src/features/indexing/api/storageManagerRoutes.js` is the live `/storage/*` surface and reports `storage_backend: "local"`.

## Error Handling

- `src/app/api/guiApiPipeline.js` wraps all route handlers.
- `src/app/api/requestDispatch.js` dispatches requests.
- `src/app/api/httpPrimitives.js` provides `jsonRes` and `readJsonBody`.
- Unknown API routes return `404 { error: 'not_found' }`.
- Uncaught handler errors return `500 { error: 'internal', message }`.
- Family handlers typically return their own `400`, `404`, `409`, `422`, or `503` envelopes for contract-level failures.

## Worker/Job Layer

| Worker | Mechanism | Notes |
|--------|-----------|-------|
| IndexLab child process | spawned by `src/app/api/processRuntime.js` | `node src/app/cli/spec.js ...`, streams stdout/stderr over WS |
| SearXNG sidecar | Docker, optional | `src/app/api/searxngRuntime.js`, `tools/searxng/docker-compose.yml` |
| Compile process | spawned by `src/app/api/processRuntime.js` | category compilation |
| Test-mode audit | inline, not spawned | runs within the request handler |

## Realtime

| Surface | Files | Notes |
|---------|-------|-------|
| WebSocket bridge | `src/app/api/realtimeBridge.js` | handles `/ws`, channel subscriptions, category/product filtering, screencast frame cache |
| WS client channels | `events`, `indexlab-event`, `data-change`, `process-status`, `process`, `test-import-progress`, `screencast-*` | emitted by runtime and feature handlers |

`setupWatchers()` in `src/app/api/realtimeBridge.js` currently returns `null`; the old watcher-based event tailing path is not active.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServer.js` | server entrypoint behavior |
| source | `src/app/api/guiServerRuntime.js` | live route order, route contexts, metadata, and `/ws` attachment |
| source | `src/app/api/serverBootstrap.js` | bootstrap phases and grouped runtime contract |
| source | `src/app/api/guiServerHttpAssembly.js` | route-handler registration pipeline |
| source | `src/app/api/guiApiPipeline.js` | route handler wrapping |
| source | `src/app/api/httpPrimitives.js` | `jsonRes` and `readJsonBody` primitives |
| source | `src/app/api/requestDispatch.js` | API detection, alias normalization, and error envelopes |
| source | `src/app/api/staticFileServer.js` | SPA static serving behavior |
| source | `src/app/api/specDbRuntime.js` | lazy SpecDb open, seed, and reconcile path |
| source | `src/app/api/realtimeBridge.js` | WebSocket behavior and inactive watcher path |
| source | `src/app/api/processRuntime.js` | child-process lifecycle and SearXNG orchestration |
| source | `src/app/api/routeRegistry.js` | exported route-order drift from mounted runtime SSOT |
| source | `src/features/settings/api/configRoutes.js` | live settings route families |
| source | `src/features/indexing/api/indexlabRoutes.js` | live IndexLab and delegated `/storage/*` routes |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage backend reporting and maintenance routes |
| source | `src/features/unit-registry/api/unitRegistryRoutes.js` | unit registry route family |
| source | `src/features/publisher/api/publisherRoutes.js` | publisher route family |

## Related Documents

- [System Map](./system-map.md) - runtime topology that this backend implements.
- [Routing and GUI](./routing-and-gui.md) - browser routes that call these backend surfaces.
- [API Surface](../06-references/api-surface.md) - endpoint-by-endpoint reference for the mounted handlers.
- [Background Jobs](../06-references/background-jobs.md) - child-process and batch work started from this backend.
