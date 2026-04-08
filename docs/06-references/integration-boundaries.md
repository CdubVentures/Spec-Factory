# Integration Boundaries

> **Purpose:** Define where the local runtime stops and external systems or sidecars begin, including contract surfaces and failure behavior.
> **Prerequisites:** [../02-dependencies/external-services.md](../02-dependencies/external-services.md), [../03-architecture/system-map.md](../03-architecture/system-map.md)
> **Last validated:** 2026-04-07

## Boundary Matrix

| Boundary | Owner path(s) | External identity | Contract surface | Failure behavior |
|----------|---------------|-------------------|------------------|------------------|
| Artifact storage backend | `src/core/storage/storage.js`, `src/app/api/bootstrap/createBootstrapEnvironment.js` | local filesystem | object-style `list/read/write/delete` methods behind `createStorage(config)` | read/write failures surface to CLI/API callers |
| Storage inventory + deletion API | `src/features/indexing/api/storageManagerRoutes.js`, `src/db/stores/deletionStore.js` | local IndexLab run tree + SpecDb/AppDb-backed cleanup | `/api/v1/storage/overview`, `/runs`, `/runs/:runId`, `/runs/bulk-delete`, `/urls/delete`, `/products/:productId/purge-history`, `/prune`, `/purge`, `/export` | missing runs return `404`, active-run deletes return `409`, deletion store absence returns `501`, purge requires explicit `confirmToken`; current overview reports `storage_backend: "local"` |
| SearXNG search sidecar | `src/app/api/processRuntime.js`, `src/app/api/routes/infra/searxngRoutes.js`, `tools/searxng/docker-compose.yml` | local HTTP service, default `http://127.0.0.1:8080` | HTTP status probes plus local Docker Compose start | `/api/v1/searxng/status` or `/api/v1/searxng/start` returns failure metadata |
| LLM provider boundary | `src/core/llm/`, `src/features/settings/api/configRuntimeSettingsHandler.js`, `src/features/settings-authority/llmPolicyHandler.js`, `src/features/settings/api/configIndexingMetricsHandler.js`, `src/app/cli/spec.js` | OpenAI-compatible, Anthropic, Gemini, DeepSeek, and local lab provider endpoints depending on config | provider registry JSON, model IDs, API keys, pricing metadata, token defaults, fallback settings | request failures surface to runtime commands and health checks; no auth currently protects `/runtime-settings`, `/llm-policy`, or `/indexing/llm-config` |
| Browser crawling stack | `src/features/crawl/index.js`, `src/pipeline/runProduct.js`, Playwright / Crawlee deps | external websites | browser automation, HTTP fetches, screenshots, video, HTML capture, runtime telemetry, and frontier recording | crawl failures are logged and recorded; block handling engages retry / bypass behavior when configured |
| Category-authority control plane | `category_authority/`, `src/features/settings-authority/userSettingsService.js`, `src/features/indexing/sources/sourceFileService.js`, `src/features/indexing/sources/specSeedsFileService.js`, `src/app/api/services/specDbSyncService.js` | authored JSON control-plane content on disk | `user-settings.json`, `sources.json`, `spec-seeds.json`, compiled artifacts, and AppDb / SpecDb sync | stale or missing artifacts can produce compile-stale states, `specdb_not_ready`, or sync drift |

## Retry And Recovery Notes

| Boundary | Retry / recovery behavior |
|----------|---------------------------|
| Artifact storage backend | rerun the initiating CLI/API flow; no external queue broker or relocation worker is present |
| Storage inventory + deletion API | rerun list/export after run completion; delete/prune/purge skip active runs rather than forcing them |
| SearXNG | local start endpoint attempts to bring the stack up; callers can recheck status |
| LLM providers | fallback models/providers may be used when configured; otherwise the run fails and is logged |
| Category-authority control plane | rerun compile/sync flows to rebuild generated artifacts and SpecDb state |

## Hard Boundaries For Agents

- Do not assume a hosted cloud control plane exists; the verified runtime is local-first.
- Do not assume auth/session infrastructure protects these boundaries; the GUI API is effectively workstation or trusted-network scoped in the verified code.
- Do not assume the removed relocation/storage-settings feature still exists. The current codebase has no mounted `/storage-settings` route and no mounted `/storage/sync/*` surface.
- The test-mode field contract audit (`POST /api/v1/test-mode/validate`) is a local compute job — it reads compiled rules and discovered enums from SpecDb, runs contract checks in-process, and writes results back to SpecDb. It has no external integration boundary.
- The Intel Graph helper API (`intelGraphApi.js`) has been deleted. The orphaned GraphQL proxy route (`POST /api/v1/graphql`) in `infraRoutes.js` still exists on disk but always returns `502` since the helper server is gone.
- Treat `docs/implementation/` as supplemental reference only. If it disagrees with numbered docs or live source, numbered docs and source win.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/core/storage/storage.js` | local filesystem storage adapter |
| source | `src/app/api/bootstrap/createBootstrapEnvironment.js` | storage bootstrap path and runtime roots |
| source | `src/features/indexing/api/storageManagerRoutes.js` | current storage inventory and deletion API surface |
| source | `src/db/stores/deletionStore.js` | URL, run, and product-history deletion contract |
| source | `src/app/api/processRuntime.js` | SearXNG probing and child-process integration |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | orphaned GraphQL proxy route (helper server deleted; always returns `502`) |
| source | `src/features/crawl/index.js` | crawl module boundary |
| source | `src/pipeline/runProduct.js` | crawl execution and telemetry boundary |
| source | `src/features/settings-authority/userSettingsService.js` | settings control-plane persistence |
| source | `src/features/indexing/sources/sourceFileService.js` | source-strategy file contract |
| source | `src/features/indexing/sources/specSeedsFileService.js` | spec-seed file contract |
| source | `src/app/api/services/specDbSyncService.js` | authority-to-SQLite sync boundary |
| runtime | `http://127.0.0.1:8788/api/v1/storage/overview` | current storage manager response shape and local backend state |

## Related Documents

- [External Services](../02-dependencies/external-services.md) - provider-by-provider inventory of external systems.
- [Environment and Config](../02-dependencies/environment-and-config.md) - config keys that select or influence these boundaries.
- [Background Jobs](./background-jobs.md) - jobs and workers that call across these boundaries.
