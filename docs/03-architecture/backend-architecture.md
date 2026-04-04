# Backend Architecture

> **Purpose:** Describe the verified server entrypoints, request pipeline, route families, settings boundaries, process runtime, and error behavior with exact file paths.
> **Prerequisites:** [system-map.md](./system-map.md)
> **Last validated:** 2026-03-31

## Server Entrypoints

| Entrypoint | Path | Role |
|------------|------|------|
| GUI/API server | `src/api/guiServer.js` | thin process entrypoint that boots the assembled runtime and serves the GUI |
| runtime assembly | `src/api/guiServerRuntime.js` | config/bootstrap SSOT, route context assembly, and mounted route order |
| CLI entrypoint | `src/cli/spec.js` | operator CLI for indexing, review, queue, reports, migrations, and helper flows |
| local GraphQL helper | `src/api/intelGraphApi.js` | separate helper API on port `8787` |

## HTTP Request Pipeline

1. `src/api/guiServer.js` delegates runtime creation to `src/api/guiServerRuntime.js`.
2. `src/api/guiServerRuntime.js` bootstraps config, storage, AppDb, lazy SpecDb access, realtime bridges, process runtime, and the route context object.
3. `src/api/guiServerHttpAssembly.js` builds the actual request handler from that route context.
4. Mounted route order is the `routeDefinitions` array in `src/api/guiServerRuntime.js`, in this live order:
   - `infra`
   - `config`
   - `indexlab`
   - `runtimeOps`
   - `catalog`
   - `brand`
   - `studio`
   - `dataAuthority`
   - `queueBillingLearning`
   - `review`
   - `testMode`
   - `sourceStrategy`
   - `specSeeds`
5. `src/app/api/requestDispatch.js` parses `/api/v1/*`, normalizes category aliases, and dispatches the first handler that claims the request.
6. `src/app/api/staticFileServer.js` serves `tools/gui-react/dist` for non-API requests.

`src/app/api/routeRegistry.js` still exports `GUI_API_ROUTE_ORDER`, but it is not the mounted route-order SSOT and it omits the live `specSeeds` family.

## Route Families

| Route family | Primary path roots | File |
|--------------|-------------------|------|
| infra | `/health`, `/categories`, `/searxng/*`, `/process/*`, `/graphql` | `src/app/api/routes/infraRoutes.js` and `src/app/api/routes/infra/*.js` |
| config | `/ui-settings`, `/runtime-settings`, `/llm-policy`, `/llm-settings/*`, `/indexing/llm-config`, `/indexing/llm-metrics`, `/indexing/domain-checklist/*`, `/indexing/review-metrics/*` | `src/features/settings/api/configRoutes.js` |
| IndexLab | `/indexlab/runs`, `/indexlab/run/*`, `/indexlab/indexes/*`, `/indexlab/analytics/*`, `/indexlab/live-crawl/*` | `src/features/indexing/api/indexlabRoutes.js` |
| storage manager | `/storage/overview`, `/storage/runs*`, `/storage/prune`, `/storage/purge`, `/storage/export` | `src/features/indexing/api/indexlabRoutes.js` delegating to `src/features/indexing/api/storageManagerRoutes.js` |
| runtime ops | `/indexlab/run/:runId/runtime/*` | `src/features/indexing/api/runtimeOpsRoutes.js` |
| catalog + brands | `/catalog/*`, `/product/*`, `/events/*`, `/brands/*` | `src/features/catalog/api/catalogRoutes.js`, `src/features/catalog/api/brandRoutes.js` |
| studio | `/field-labels/*`, `/studio/:category/*` | `src/features/studio/api/studioRoutes.js` |
| authority snapshot | `/data-authority/:category/snapshot` | `src/features/category-authority/api/dataAuthorityRoutes.js` |
| queue, billing, learning | `/queue/*`, `/billing/*`, `/learning/*` | `src/features/indexing/api/queueBillingLearningRoutes.js` |
| review | `/review/*`, `/review-components/*` | `src/features/review/api/reviewRoutes.js` |
| test mode | `/test-mode/*` | `src/app/api/routes/testModeRoutes.js` |
| source strategy | `/source-strategy/*` | `src/features/indexing/api/sourceStrategyRoutes.js` |
| deterministic spec seeds | `/spec-seeds` | `src/features/indexing/api/specSeedsRoutes.js` |

## Settings and Policy Split

- `src/features/settings/api/configRoutes.js` mounts five live families:
  - UI settings via `src/features/settings/api/configUiSettingsHandler.js`
  - indexing metrics plus LLM metadata via `src/features/settings/api/configIndexingMetricsHandler.js`
  - category LLM route matrices via `src/features/settings/api/configLlmSettingsHandler.js`
  - runtime settings via `src/features/settings/api/configRuntimeSettingsHandler.js`
  - composite LLM policy via `src/features/settings-authority/llmPolicyHandler.js`
- No live storage-settings handler is mounted in the current source tree.
- No live convergence-settings handler is mounted in the current source tree.
- `src/features/settings/api/configPersistenceContext.js` persists runtime and UI sections into AppDb when available and falls back to `.workspace/global/user-settings.json` only when AppDb is unavailable.
- Category LLM route matrices are a separate persistence boundary and go to per-category SpecDb tables, not the user-settings document.

## Storage and Runtime Roots

- `src/api/bootstrap/createBootstrapEnvironment.js` resolves:
  - `OUTPUT_ROOT` from `src/core/config/runtimeArtifactRoots.js` default `.workspace/output`
  - `INDEXLAB_ROOT` from `src/core/config/runtimeArtifactRoots.js` default `.workspace/runs`
- `src/features/indexing/api/storageManagerRoutes.js` currently reports `storage_backend: "local"` and `backend_detail.root_path = indexLabRoot` for the `/storage/*` inventory surface.
- `src/core/storage/storage.js` provides local filesystem storage. The S3 backend has been retired.

## Process Runtime and Long-Running Work

- `src/app/api/processRuntime.js` owns child-process lifecycle for compile and indexing work.
- It spawns the local Node CLI surface rather than embedding pipeline logic directly in the HTTP server.
- It also probes and starts the optional local SearXNG stack and broadcasts process status plus child stdout/stderr over WebSocket.

## Realtime and Watchers

- `src/app/api/realtimeBridge.js` attaches the `/ws` upgrade handler.
- It watches runtime event files and per-run `run_events.ndjson` files using `chokidar`.
- Broadcast channels include `events`, `indexlab-event`, `data-change`, `process-status`, `process`, `test-import-progress`, and `screencast` channels.

## Persistence Boundaries

| Boundary | Owner | Notes |
|----------|-------|-------|
| global runtime/UI settings | `src/db/appDb.js` plus `src/features/settings-authority/userSettingsService.js` | AppDb primary, JSON fallback |
| per-category review/indexing data | `src/db/specDb.js` | lazy-loaded through `src/app/api/specDbRuntime.js` |
| authored category control plane | `category_authority/` loaded via `src/categories/loader.js` | rules, sources, spec seeds, generated artifacts |
| storage adapter | `src/core/storage/storage.js` | local filesystem storage |

## Error Handling

- `src/app/api/requestDispatch.js` wraps API dispatch in a top-level `try/catch`.
- Unknown API routes return `404 { error: 'not_found' }`.
- Unhandled route errors return `500 { error: 'internal', message }`.
- Many route handlers return route-specific `400`, `404`, `409`, `422`, or `500` payloads instead of throwing.
- `src/features/settings-authority/llmPolicyHandler.js` returns `422 { ok: false, error: 'invalid_model', rejected }` for model IDs missing from the provider registry.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | thin process entrypoint role |
| source | `src/api/guiServerRuntime.js` | mounted route order, route context assembly, and runtime bootstrap SSOT |
| source | `src/api/guiServerHttpAssembly.js` | HTTP assembly handoff |
| source | `src/app/api/requestDispatch.js` | parse/dispatch/error/static-serving pipeline |
| source | `src/app/api/routeRegistry.js` | stale `GUI_API_ROUTE_ORDER` export is not mounted SSOT |
| source | `src/features/settings/api/configRoutes.js` | live mounted settings families |
| source | `src/features/indexing/api/storageManagerRoutes.js` | actual `/storage/*` endpoint family |
| source | `src/api/bootstrap/createBootstrapEnvironment.js` | runtime roots and live storage adapter bootstrap |
| source | `src/features/settings/api/configPersistenceContext.js` | AppDb-first persistence boundary |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy read/write behavior |
| source | `src/app/api/processRuntime.js` | child-process lifecycle and SearXNG control |
| source | `src/app/api/realtimeBridge.js` | `/ws` handling and watcher-backed broadcasts |

## Related Documents

- [API Surface](../06-references/api-surface.md) - Endpoint-by-endpoint reference built from these route families.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - `/llm-policy` and `/indexing/llm-config` flow in detail.
- [Background Jobs](../06-references/background-jobs.md) - Long-running process and batch entrypoints.
- [Data Model](./data-model.md) - SQLite layer details.
