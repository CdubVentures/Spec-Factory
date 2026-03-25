# Backend Architecture

> **Purpose:** Describe the verified server entrypoints, request pipeline, route families, settings boundaries, process runtime, and error behavior with exact file paths.
> **Prerequisites:** [system-map.md](./system-map.md)
> **Last validated:** 2026-03-24

## Server Entrypoints

| Entrypoint | Path | Role |
|------------|------|------|
| GUI/API server | `src/api/guiServer.js` | boots config, storage, SpecDb runtime, route context, static serving, and `/ws` |
| CLI entrypoint | `src/cli/spec.js` | operator CLI for indexing, review, queue, reports, migrations, and helper flows |
| Local GraphQL API | `src/api/intelGraphApi.js` | separate CLI-started graph API surface on port `8787` |

## HTTP Request Pipeline

1. `src/api/guiServer.js` assembles runtime dependencies.
2. `src/api/guiServer.js` builds the large `routeCtx` object inline and hands it to `src/api/guiServerHttpAssembly.js`.
3. `src/app/api/guiRouteRegistration.js` delegates route registration to `src/app/api/routeRegistry.js`.
4. `src/app/api/routeRegistry.js` instantiates handlers in this fixed order:
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
5. `src/app/api/requestDispatch.js` parses `/api/v1/*`, normalizes category segments, and dispatches the first handler that returns non-`false`.
6. `src/app/api/staticFileServer.js` serves `tools/gui-react/dist` for non-API requests.

## Route Families

| Route family | Primary path roots | File |
|--------------|-------------------|------|
| infra | `/health`, `/categories`, `/searxng/*`, `/process/*`, `/graphql` | `src/app/api/routes/infraRoutes.js` and `src/app/api/routes/infra/*.js` |
| config | `/ui-settings`, `/storage-settings`, `/runtime-settings`, `/llm-policy`, `/llm-settings/*`, `/indexing/llm-config` | `src/features/settings/api/configRoutes.js` |
| IndexLab | `/indexlab/runs`, `/indexlab/run/*`, `/indexlab/indexes/*`, `/indexlab/analytics/*`, `/indexlab/live-crawl/*` | `src/features/indexing/api/indexlabRoutes.js` |
| runtime ops | `/indexlab/run/:runId/runtime/*` | `src/features/indexing/api/runtimeOpsRoutes.js` |
| catalog + brands | `/catalog/*`, `/product/*`, `/events/*`, `/brands/*` | `src/features/catalog/api/catalogRoutes.js`, `src/features/catalog/api/brandRoutes.js` |
| studio | `/field-labels/*`, `/studio/:category/*` | `src/features/studio/api/studioRoutes.js` |
| authority snapshot | `/data-authority/:category/snapshot` | `src/features/category-authority/api/dataAuthorityRoutes.js` |
| queue, billing, learning | `/queue/*`, `/billing/*`, `/learning/*` | `src/features/indexing/api/queueBillingLearningRoutes.js` |
| review | `/review/*`, `/review-components/*` | `src/features/review/api/reviewRoutes.js` |
| test mode | `/test-mode/*` | `src/app/api/routes/testModeRoutes.js` |
| source strategy | `/source-strategy/*` | `src/features/indexing/api/sourceStrategyRoutes.js` |

## Settings and Policy Split

- `src/features/settings/api/configRoutes.js` mounts five live settings families:
  - runtime settings via `src/features/settings/api/configRuntimeSettingsHandler.js`
  - storage settings via `src/features/settings/api/configStorageSettingsHandler.js`
  - UI settings via `src/features/settings/api/configUiSettingsHandler.js`
  - category-scoped LLM route matrices via `src/features/settings/api/configLlmSettingsHandler.js`
  - composite LLM policy via `src/features/settings-authority/llmPolicyHandler.js`
- `src/features/settings/api/configIndexingMetricsHandler.js` also serves `GET /api/v1/indexing/llm-config`, which the GUI uses as read-only model, pricing, routing, and token-default metadata.
- `src/features/settings-authority/llmPolicyHandler.js` assembles/disassembles the composite policy with `src/core/llm/llmPolicySchema.js`, validates model IDs with `src/core/llm/llmModelValidation.js`, applies live config updates, and persists only the runtime section through `src/features/settings/api/configPersistenceContext.js`.
- No live `/api/v1/convergence-settings` handler is registered. The persisted `convergence` object survives only as `{}` in `category_authority/_runtime/user-settings.json` for backward compatibility, as documented in `src/features/settings-authority/README.md`.
- Category-scoped route matrices are a separate persistence boundary: `src/features/settings/api/configLlmSettingsHandler.js` writes rows into SQLite through `src/db/specDb.js` rather than through `user-settings.json`.

## Process Runtime and Worker Launch

- `src/app/api/processRuntime.js` owns the long-running child-process lifecycle for compile/indexing work.
- It launches CLI commands by spawning the local Node CLI surface rather than embedding pipeline logic directly in the HTTP server.
- It also probes/starts the local SearXNG Docker Compose stack and publishes process status snapshots.
- GUI actions like `/api/v1/process/start`, `/api/v1/process/stop`, and `/api/v1/process/status` are routed through infra routes into this runtime boundary.

## Realtime and Watchers

- `src/app/api/realtimeBridge.js` attaches the `/ws` upgrade handler.
- It watches runtime event files and IndexLab `run_events.ndjson` files using `chokidar`.
- Broadcast channels include at least `events`, `indexlab-event`, `data-change`, `process-status`, and screencast channels.
- The normalized `data-change` payload contract lives in `src/core/events/dataChangeContract.js` and is emitted from feature mutation helpers such as `src/features/review/api/routeSharedHelpers.js` and `src/features/settings-authority/llmPolicyHandler.js`.

## Persistence Boundaries

- SQLite: `src/db/specDb.js` composed from store modules in `src/db/stores/`.
- Category/rule content: `category_authority/` loaded by `src/categories/loader.js`.
- Canonical user settings: `category_authority/_runtime/user-settings.json` written through `src/features/settings-authority/userSettingsService.js`.
- Output roots and optional relocation/archive storage are normalized in `src/api/guiServer.js` and `src/api/services/runDataRelocationService.js`.

## Error Handling

- `src/app/api/requestDispatch.js` wraps API dispatch in a top-level `try/catch`.
- Unhandled route errors are logged and returned as `500 { error: 'internal', message }`.
- Unknown API routes return `404 { error: 'not_found' }`.
- Individual route handlers frequently return route-specific `400`, `404`, `422`, or `500` payloads instead of throwing.
- `src/features/settings-authority/llmPolicyHandler.js` returns `422 { ok: false, error: 'invalid_model', rejected }` when the submitted composite policy references model IDs missing from the provider registry.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/api/guiServer.js` | server assembly, dependency wiring, and entrypoint role |
| source | `src/api/guiServerHttpAssembly.js` | `routeCtx` handoff into the HTTP assembly pipeline |
| source | `src/app/api/guiRouteRegistration.js` | route registration wrapper around the registry |
| source | `src/app/api/requestDispatch.js` | parse/dispatch/error/static-serving pipeline |
| source | `src/app/api/routeRegistry.js` | registrar order and handler composition |
| source | `src/features/settings/api/configRoutes.js` | mounted settings route families |
| source | `src/features/settings/api/configPersistenceContext.js` | canonical settings persistence boundary |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy read/write behavior |
| source | `src/core/llm/llmPolicySchema.js` | composite LLM policy assembly/disassembly contract |
| source | `src/app/api/processRuntime.js` | child-process lifecycle and SearXNG control |
| source | `src/app/api/realtimeBridge.js` | `/ws` handling and watcher-backed broadcasts |
| source | `src/core/events/dataChangeContract.js` | normalized `data-change` payload contract |

## Related Documents

- [API Surface](../06-references/api-surface.md) - Endpoint-by-endpoint reference built from these route families.
- [LLM Policy and Provider Config](../04-features/llm-policy-and-provider-config.md) - Documents the `/llm-policy` and `/indexing/llm-config` flow in detail.
- [Background Jobs](../06-references/background-jobs.md) - Focuses on the process runtime and daemon/worker launch surfaces.
- [Data Model](./data-model.md) - Documents the SQLite layer these handlers read and write.
