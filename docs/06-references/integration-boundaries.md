# Integration Boundaries

> **Purpose:** Define where the local runtime stops and external systems or sidecars begin, including contract surfaces and failure behavior.
> **Prerequisites:** [../02-dependencies/external-services.md](../02-dependencies/external-services.md), [../03-architecture/system-map.md](../03-architecture/system-map.md)
> **Last validated:** 2026-03-23

## Boundary Matrix

| Boundary | Owner path(s) | External identity | Contract surface | Failure behavior |
|----------|---------------|-------------------|------------------|------------------|
| Storage backend | `src/s3/storage.js`, `src/api/services/runDataRelocationService.js` | local filesystem or Amazon S3 | JSON/text/blob read-write through storage abstraction and run-data relocation settings | read/write failures surface to CLI/API and may emit relocation failure events |
| SearXNG search sidecar | `src/app/api/processRuntime.js`, `src/app/api/routes/infra/searxngRoutes.js`, `tools/searxng/docker-compose.yml` | local HTTP service, default `http://127.0.0.1:8080` | HTTP status probes plus local Docker Compose start | `/api/v1/searxng/status` or `/api/v1/searxng/start` returns failure metadata |
| Intel Graph helper API | `src/app/api/routes/infra/graphqlRoutes.js`, `src/api/intelGraphApi.js` | local GraphQL server on `http://localhost:8787/graphql` | JSON GraphQL POST proxy | proxy returns `502 graphql_proxy_failed` when helper is absent or unhealthy |
| LLM providers / Cortex routing | `src/core/llm/`, `src/features/settings/api/configRoutes.js`, `src/cli/spec.js` | provider APIs selected by model/provider settings | provider/model strings, token caps, routing matrix, health checks | runtime commands or health checks fail; fallback routes may engage if configured |
| Structured metadata sidecar | `src/features/indexing/extraction/structuredMetadataClient.js` | local HTTP extractor, default `http://127.0.0.1:8011/extract/structured` | structured metadata extraction POSTs | extraction degrades to best-effort behavior when sidecar is unavailable |
| Browser crawling stack | `playwright`, `crawlee`, runtime fetch/extraction code | external websites | browser/http fetch plus runtime event capture | fetch failures are logged into runtime events and Runtime Ops |
| Category-authority control plane | `category_authority/`, `src/features/settings-authority/index.js`, `src/api/services/specDbSyncService.js` | authored JSON control-plane content on disk | compiled rules, catalogs, sources, user settings | stale or missing authority artifacts produce compile-stale states, `specdb_not_ready`, or sync drift |
| Excluded schema assets | `src/indexlab/indexingSchemaPacketsValidator.js` | JSON schemas under the excluded `docs/implementation/ai-indexing-plans/schema/` subtree | schema packet validation at runtime | validator/runtime code fails if required schema assets are missing or malformed |

## Retry And Recovery Notes

| Boundary | Retry / recovery behavior |
|----------|---------------------------|
| Storage backend | manual retry by rerunning CLI/API flows; no external queue broker verified |
| SearXNG | local start endpoint attempts to bring the stack up; callers can recheck status |
| Intel Graph helper API | start the helper via `npm run intel:api`, then retry the proxied request |
| LLM providers | fallback models/providers may be used when configured; otherwise the run fails and is logged |
| Structured metadata sidecar | optional enrichment; failures do not create a separate retry queue in the verified code |
| Category-authority control plane | rerun compile/sync flows to rebuild generated artifacts and SpecDb state |

## Hard Boundaries For Agents

- Do not assume a hosted cloud control plane exists; the verified runtime is local-first.
- Do not assume auth/session infrastructure protects these boundaries; the GUI API is effectively local/trusted-network only in the verified code.
- Do not treat the excluded `docs/implementation/` subtree as current-state documentation authority. One exception exists at runtime: `src/indexlab/indexingSchemaPacketsValidator.js` defaults its schema root to JSON files under `docs/implementation/ai-indexing-plans/schema/`.

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/s3/storage.js` | storage abstraction boundary |
| source | `src/api/services/runDataRelocationService.js` | run-data relocation contract |
| source | `src/app/api/processRuntime.js` | SearXNG probing and child-process integration |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | GraphQL proxy contract |
| source | `src/api/intelGraphApi.js` | local GraphQL helper endpoint |
| source | `src/features/indexing/extraction/structuredMetadataClient.js` | structured metadata sidecar endpoint |
| source | `src/features/settings-authority/index.js` | file-backed settings/control-plane contract |
| source | `src/api/services/specDbSyncService.js` | authority-to-SQLite sync boundary |
| source | `src/indexlab/indexingSchemaPacketsValidator.js` | runtime dependency on docs schema JSON |

## Related Documents

- [External Services](../02-dependencies/external-services.md) - Provider-by-provider inventory of external systems.
- [Environment and Config](../02-dependencies/environment-and-config.md) - Config keys that select these boundaries.
- [Background Jobs](./background-jobs.md) - Jobs that call across these boundaries.
