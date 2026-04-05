# Backend Architecture

> **Purpose:** Describe the verified server entrypoints, bootstrap phases, route families, persistence boundaries, realtime bridge, and error handling for the live backend.
> **Prerequisites:** [system-map.md](./system-map.md), [../02-dependencies/environment-and-config.md](../02-dependencies/environment-and-config.md)
> **Last validated:** 2026-04-04

## Entrypoints And Composition Roots

| Surface | Path | Role |
|---------|------|------|
| server entrypoint | `src/app/api/guiServer.js` | boots `createGuiServerRuntime()` and starts the HTTP server |
| runtime assembly SSOT | `src/app/api/guiServerRuntime.js` | builds route contexts, mounts route families, attaches `/ws`, exposes metadata |
| bootstrap composition root | `src/app/api/serverBootstrap.js` | assembles env, storage, DB, realtime, process, and domain services |
| HTTP pipeline assembly | `src/app/api/guiServerHttpAssembly.js` | turns route definitions plus helpers into executable handlers |
| dispatch layer | `src/app/api/requestDispatch.js` | CORS, OPTIONS, API detection, handler iteration, 404/500 envelopes |
| static asset server | `src/app/api/staticFileServer.js` | serves `tools/gui-react/dist/` for non-API requests |
| CLI entrypoint | `src/app/cli/spec.js` | operator CLI used by child-process runs |
| optional GraphQL helper | `src/app/api/intelGraphApi.js` | separate local helper API, not part of the main route tree |

## Bootstrap Phases

`src/app/api/serverBootstrap.js` is the actual boot-order SSOT. The live sequence is:

1. Environment and config in `src/app/api/bootstrap/createBootstrapEnvironment.js`
   - loads `.env`
   - loads config via `src/config.js`
   - applies persisted runtime settings
   - resolves `PORT`, `HELPER_ROOT`, `OUTPUT_ROOT`, `INDEXLAB_ROOT`, and `LAUNCH_CWD`
   - creates the config mutation gate and storage adapter
2. Native module guard in `src/core/nativeModuleGuard.js`
   - fails fast before DB setup if native dependencies are broken
3. Session and DB layer in `src/app/api/bootstrap/createBootstrapSessionLayer.js`
   - creates the category alias resolver
   - creates the lazy SpecDb runtime
   - opens AppDb eagerly at `.workspace/db/app.sqlite`
   - seeds brand and color registry tables
   - reapplies persisted runtime settings from AppDb-backed user settings
4. Realtime bridge in `src/app/api/realtimeBridge.js`
   - exposes `broadcastWs()`, `attachWebSocketUpgrade()`, and screencast frame caching
5. Process runtime in `src/app/api/processRuntime.js`
   - owns child-process lifecycle and optional SearXNG control
6. IndexLab initialization in `src/features/indexing/api/index.js`
   - initializes run-data builders against live runtime roots
7. Domain runtime assembly in `src/app/api/bootstrap/createBootstrapDomainRuntimes.js`
   - review, catalog, and related domain helpers
8. Fire-and-forget cleanup imports
   - crawl-video cleanup in `src/features/crawl/videoCleanup.js`
   - snapshot pruning in `src/core/config/snapshotCleanup.js`

`src/app/api/serverBootstrap.js` exports `BOOTSTRAP_RETURN_GROUPS`, which documents the grouped return contract used by `src/app/api/guiServerRuntime.js`.

## Request Pipeline

1. `src/app/api/guiServer.js` calls `createGuiServerRuntime()`.
2. `src/app/api/guiServerRuntime.js` calls `bootstrapServer()` and builds per-family route contexts.
3. The same file defines the live `routeDefinitions` array. This is the mounted route-order SSOT.
4. `src/app/api/guiServerHttpAssembly.js` registers family handlers through `createGuiApiRouteRegistry()` and `createRegisteredGuiApiRouteHandlers()`.
5. `src/app/api/requestDispatch.js`:
   - applies CORS headers
   - returns `204` for `OPTIONS`
   - routes only `/health` and `/api/v1/*` through the API dispatcher
   - normalizes category aliases for category-scoped path segments
   - returns `404 { error: 'not_found' }` when no handler claims the request
   - returns `500 { error: 'internal', message }` on uncaught handler errors
6. Non-API requests fall through to `src/app/api/staticFileServer.js`, which serves `tools/gui-react/dist/` and falls back to `index.html` for SPA routes.

## Mounted Route Families

The live route-order array in `src/app/api/guiServerRuntime.js` is:

1. `infra`
2. `config`
3. `indexlab`
4. `runtimeOps`
5. `catalog`
6. `brand`
7. `color`
8. `colorEditionFinder`
9. `studio`
10. `dataAuthority`
11. `queueBillingLearning`
12. `review`
13. `testMode`
14. `sourceStrategy`
15. `specSeeds`

`src/app/api/routeRegistry.js` exports `GUI_API_ROUTE_ORDER`, but it is not the mounted SSOT because it omits the live `specSeeds` family.

| Family key | Primary paths | Files |
|------------|---------------|-------|
| `infra` | `/health`, `/categories`, `/serper/*`, `/searxng/*`, `/process/*`, `/graphql` | `src/app/api/routes/infraRoutes.js`, `src/app/api/routes/infra/*.js` |
| `config` | `/ui-settings`, `/runtime-settings`, `/llm-policy`, `/llm-settings/*`, `/indexing/llm-config`, `/indexing/llm-metrics`, `/indexing/domain-checklist/*`, `/indexing/review-metrics/*` | `src/features/settings/api/configRoutes.js` |
| `indexlab` | `/indexlab/runs`, `/indexlab/run/*`, `/indexlab/indexes/*`, `/indexlab/analytics/*`, `/indexlab/live-crawl/*`, `/storage/*` | `src/features/indexing/api/indexlabRoutes.js`, `src/features/indexing/api/storageManagerRoutes.js` |
| `runtimeOps` | `/indexlab/run/:runId/runtime/*` | `src/features/indexing/api/runtimeOpsRoutes.js` |
| `catalog` | `/catalog/*`, `/product/*`, `/events/*` | `src/features/catalog/api/catalogRoutes.js` |
| `brand` | `/brands/*` | `src/features/catalog/api/brandRoutes.js` |
| `color` | `/colors/*` | `src/features/color-registry/api/colorRoutes.js` |
| `colorEditionFinder` | `/color-edition-finder/*` | `src/features/color-edition/api/colorEditionFinderRoutes.js` |
| `studio` | `/field-labels/*`, `/studio/:category/*` | `src/features/studio/api/studioRoutes.js` |
| `dataAuthority` | `/data-authority/:category/*` | `src/features/category-authority/api/dataAuthorityRoutes.js` |
| `queueBillingLearning` | `/queue/*`, `/billing/*`, `/learning/*` | `src/features/indexing/api/queueBillingLearningRoutes.js` |
| `review` | `/review/*`, `/review-components/*` | `src/features/review/api/reviewRoutes.js` |
| `testMode` | `/test-mode/*` | `src/app/api/routes/testModeRoutes.js` |
| `sourceStrategy` | `/source-strategy/*` | `src/features/indexing/api/sourceStrategyRoutes.js` |
| `specSeeds` | `/spec-seeds` | `src/features/indexing/api/specSeedsRoutes.js` |

## Persistence Boundaries

| Boundary | Files | Behavior |
|----------|-------|----------|
| global AppDb | `src/db/appDb.js`, `src/app/api/bootstrap/createBootstrapSessionLayer.js` | eager global SQLite store for brands, settings, studio maps, and color registry |
| per-category SpecDb | `src/app/api/specDbRuntime.js`, `src/db/specDb.js` | lazy open and auto-seed per category |
| user settings persistence | `src/features/settings/api/configPersistenceContext.js`, `src/features/settings-authority/userSettingsService.js` | AppDb-backed primary store with JSON fallback only when AppDb is unavailable |
| category authority files | `category_authority/`, `src/categories/loader.js` | file-backed control plane and generated artifacts used during seeding and runtime lookups |
| runtime roots | `src/core/config/runtimeArtifactRoots.js` | defaults to `.workspace/output` and `.workspace/runs` |
| storage adapter | `src/core/storage/storage.js` | currently local backend only |

## Settings And Policy Split

- `src/features/settings/api/configRoutes.js` mounts five live handler families:
  - UI settings via `src/features/settings/api/configUiSettingsHandler.js`
  - indexing metadata and metrics via `src/features/settings/api/configIndexingMetricsHandler.js`
  - category-scoped LLM route matrices via `src/features/settings/api/configLlmSettingsHandler.js`
  - runtime settings via `src/features/settings/api/configRuntimeSettingsHandler.js`
  - composite global LLM policy via `src/features/settings-authority/llmPolicyHandler.js`
- There is no live `/api/v1/storage-settings` route.
- There is no live `/api/v1/convergence-settings` route.
- `src/features/indexing/api/storageManagerRoutes.js` is the live `/storage/*` surface and reports `storage_backend: "local"`.

## Realtime And Long-Running Work

| Surface | Files | Notes |
|---------|-------|-------|
| WebSocket bridge | `src/app/api/realtimeBridge.js` | handles `/ws`, channel subscriptions, category/product filtering, screencast frame cache |
| WS client channels | `events`, `indexlab-event`, `data-change`, `process-status`, `process`, `test-import-progress`, `screencast-*` | emitted by runtime and feature handlers |
| process runtime | `src/app/api/processRuntime.js` | spawns `node src/app/cli/spec.js ...`, streams stdout/stderr over WS, updates process status |
| SearXNG control | `src/app/api/searxngRuntime.js`, `tools/searxng/docker-compose.yml` | optional local search sidecar |

`setupWatchers()` in `src/app/api/realtimeBridge.js` currently returns `null`; the old watcher-based event tailing path is not active.

## Error Handling

- Top-level API error handling lives in `src/app/api/requestDispatch.js`.
- Unknown API routes return `404 { error: 'not_found' }`.
- Uncaught handler errors return `500 { error: 'internal', message }`.
- Family handlers typically return their own `400`, `404`, `409`, `422`, or `503` envelopes for contract-level failures.
- Example handler-specific validation:
  - `src/features/color-registry/api/colorRoutes.js` returns `400` for invalid color names or hex values
  - `src/features/color-edition/api/colorEditionFinderRoutes.js` returns `503` when SpecDb is not ready
  - `src/features/settings-authority/llmPolicyHandler.js` returns `422` for invalid model selections

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServer.js` | server entrypoint behavior |
| source | `src/app/api/guiServerRuntime.js` | live route order, route contexts, metadata, and `/ws` attachment |
| source | `src/app/api/serverBootstrap.js` | bootstrap phases and grouped runtime contract |
| source | `src/app/api/guiServerHttpAssembly.js` | route-handler registration pipeline |
| source | `src/app/api/requestDispatch.js` | API detection, alias normalization, and error envelopes |
| source | `src/app/api/staticFileServer.js` | SPA static serving behavior |
| source | `src/app/api/specDbRuntime.js` | lazy SpecDb open, seed, and reconcile path |
| source | `src/app/api/realtimeBridge.js` | WebSocket behavior and inactive watcher path |
| source | `src/app/api/processRuntime.js` | child-process lifecycle and SearXNG orchestration |
| source | `src/app/api/routeRegistry.js` | exported route-order drift from mounted runtime SSOT |
| source | `src/features/settings/api/configRoutes.js` | live settings route families |
| source | `src/features/indexing/api/indexlabRoutes.js` | live IndexLab and delegated `/storage/*` routes |
| source | `src/features/indexing/api/storageManagerRoutes.js` | storage backend reporting and maintenance routes |
| source | `src/features/color-registry/api/colorRoutes.js` | color route family |
| source | `src/features/color-edition/api/colorEditionFinderRoutes.js` | color-edition route family |

## Related Documents

- [System Map](./system-map.md) - Runtime topology that this backend implements.
- [Routing and GUI](./routing-and-gui.md) - Browser routes that call these backend surfaces.
- [API Surface](../06-references/api-surface.md) - Endpoint-by-endpoint reference for the mounted handlers.
- [Background Jobs](../06-references/background-jobs.md) - Child-process and batch work started from this backend.
