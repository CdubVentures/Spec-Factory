# API Surface

> **Purpose:** Inventory the verified HTTP endpoints exposed by the GUI server, grouped by route family and backed by concrete file paths.
> **Prerequisites:** [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md), [../04-features/feature-index.md](../04-features/feature-index.md)
> **Last validated:** 2026-04-10

## Global Notes

- Base REST prefix: `/api/v1`
- Health alias without prefix: `/health`
- Auth: no verified auth middleware protects these endpoints in the current runtime
- Route parsing and category alias normalization live in `src/app/api/requestDispatch.js`
- Mounted route-family order lives in `src/app/api/guiServerRuntime.js`
- There is no live `/api/v1/storage-settings` or `/api/v1/convergence-settings` endpoint in the current server
- `GET /api/v1/runtime-settings`, `GET /api/v1/llm-policy`, and `GET /api/v1/indexing/llm-config` can return secret-bearing key material when configured

## Infra And Process Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/health` | root health alias | none | none | `{ ok, service, dist_root, cwd, isPkg, ffmpegAvailable }` |
| GET | `/api/v1/health` | GUI/API health | none | none | `{ ok, service, dist_root, cwd, isPkg, ffmpegAvailable }` |
| GET | `/api/v1/` | root health (empty path after prefix strip) | none | none | `{ ok, service, dist_root, cwd, isPkg, ffmpegAvailable }` |
| GET | `/api/v1/categories` | list authored categories | none | none | `string[]` |
| POST | `/api/v1/categories` | create category skeleton | none | `{ name }` | `{ ok, slug, categories }` |
| GET | `/api/v1/searxng/status` | SearXNG local status | none | none | status object |
| POST | `/api/v1/searxng/start` | start local SearXNG stack | none | none | start result or error |
| GET | `/api/v1/serper/credit` | Serper.dev credit balance (proxied without leaking API key) | none | none | `{ credit, configured, enabled }` or `500 { error: 'serper_account_check_failed' }` |
| POST | `/api/v1/process/start` | spawn GUI-managed IndexLab child process | none | launch-plan fields such as `category`, `productId`, `brand`, `base_model`, `variant`, `fields`, `providers`, `requestedRunId`, `replaceRunning` | normalized process status or `4xx` launch error |
| POST | `/api/v1/process/stop` | stop child process | none | `{ force? }` | normalized process status |
| GET | `/api/v1/process/status` | read child-process status | none | none | normalized process status |
| POST | `/api/v1/graphql` | proxy GraphQL request to local helper server (ORPHANED -- upstream `intelGraphApi.js` was deleted; always returns `502`) | none | GraphQL JSON body | proxied GraphQL JSON or `502 graphql_proxy_failed` |

## Settings And Configuration Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/ui-settings` | read persisted UI toggles | none | none | UI settings object |
| PUT | `/api/v1/ui-settings` | persist UI toggles | none | subset of UI keys | `{ ok, applied, snapshot, rejected }` |
| GET | `/api/v1/indexing/llm-config` | read model catalog, pricing metadata, resolved API keys, routing defaults, and token defaults used by settings UIs | none | none | config snapshot |
| GET | `/api/v1/indexing/llm-metrics` | aggregated LLM usage metrics | none | none | metrics payload |
| GET | `/api/v1/indexing/domain-checklist/:category` | domain/source checklist for a category | none | none | checklist payload |
| GET | `/api/v1/indexing/review-metrics/:category` | human review throughput metrics | none | none | review metrics payload |
| GET | `/api/v1/llm-settings/:category/routes` | read category LLM route matrix | none | none | `{ category, scope, rows }` |
| PUT | `/api/v1/llm-settings/:category/routes` | write category LLM route matrix | none | `{ rows }` | `{ ok, applied: { rows }, snapshot, rejected, category, rows }` |
| POST | `/api/v1/llm-settings/:category/routes/reset` | reset category LLM route matrix | none | none | `{ ok, category, rows }` |
| GET | `/api/v1/llm-policy` | read the composite global LLM policy assembled from managed runtime keys | none | none | `{ ok, policy }` |
| PUT | `/api/v1/llm-policy` | persist the composite global LLM policy back into runtime settings | none | `LlmPolicy` composite | `{ ok, policy }` or `422 { ok: false, error: 'invalid_model', rejected }` |
| POST | `/api/v1/llm-policy` | compatibility write alias for the composite global LLM policy | none | `LlmPolicy` composite | `{ ok, policy }` or `422 { ok: false, error: 'invalid_model', rejected }` |
| GET | `/api/v1/runtime-settings` | read runtime settings, including provider-key-backed flat fields when configured | none | none | runtime settings |
| PUT | `/api/v1/runtime-settings` | persist runtime settings | none | runtime settings patch | `{ ok, applied, snapshot, rejected }` |
| POST | `/api/v1/runtime-settings` | compatibility write alias for runtime-settings autosave | none | runtime settings patch | `{ ok, applied, snapshot, rejected }` |

## Storage Manager Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/storage/overview` | summarize archived/live run inventory and backend details | none | none | `{ total_runs, total_size_bytes, categories, products_indexed, oldest_run, newest_run, avg_run_size_bytes, storage_backend, backend_detail }` |
| GET | `/api/v1/storage/runs` | list run inventory, optionally filtered by `category` and `limit` query params | none | none | `{ runs }` |
| GET | `/api/v1/storage/runs/:runId` | read one run's storage metadata bundle | none | none | `{ run_id, ...meta, sources, identity }` or `404 { error: 'run_not_found', run_id }` |
| DELETE | `/api/v1/storage/runs/:runId` | delete one archived run bundle and related SQL state | none | none | deletion result or `409 { ok: false, error: 'run_in_progress', run_id }` |
| POST | `/api/v1/storage/runs/bulk-delete` | bulk-delete archived run bundles | none | `{ runIds: string[] }` | `{ ok, deleted, errors }` |
| POST | `/api/v1/storage/prune` | prune old archived runs, optionally failed-only | none | `{ olderThanDays?, failedOnly? }` | `{ ok, pruned, errors }` |
| POST | `/api/v1/storage/purge` | purge all archived runs after explicit confirmation token | none | `{ confirmToken }` | `{ ok, purged }` or `400 { ok: false, error: 'confirm_token_required' }` |
| POST | `/api/v1/storage/urls/delete` | delete one URL plus derived artifacts and SQL rows | none | `{ url, productId, category }` | deletion result or `400/501/500` |
| POST | `/api/v1/storage/products/:productId/purge-history` | delete all run history for one product | none | `{ category }` | deletion result or `409 { ok: false, error: 'product_has_active_run', run_id }` |
| GET | `/api/v1/storage/export` | download run inventory export JSON | none | none | `{ exported_at, storage_backend, runs }` with `Content-Disposition: attachment` |

## IndexLab Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/indexlab/runs` | list recent runs | none | none | `{ root, runs }` |
| GET | `/api/v1/indexlab/run/:runId` | read run metadata | none | none | run meta JSON |
| GET | `/api/v1/indexlab/run/:runId/events` | replay run events | none | none | `{ run_id, count, events }` |
| GET | `/api/v1/indexlab/run/:runId/needset` | read run needset | none | none | needset payload |
| GET | `/api/v1/indexlab/run/:runId/search-profile` | read run search profile | none | none | search profile payload |
| GET | `/api/v1/indexlab/run/:runId/serp` | read SERP explorer payload | none | none | SERP payload |
| GET | `/api/v1/indexlab/run/:runId/automation-queue` | read automation queue | none | none | automation queue payload |
| GET | `/api/v1/indexlab/run/:runId/rounds` | summarize run rounds from events | none | none | round summary |
| GET | `/api/v1/indexlab/run/:runId/learning` | summarize learning updates for a run | none | none | learning payload |
| GET | `/api/v1/indexlab/product-history` | read one product's aggregate run, query, and URL history | none | none | `{ product_id, category, aggregate, runs, queries, urls }` |
| GET | `/api/v1/indexlab/indexes/query-summary` | summarize query index by category | none | none | summary payload |
| GET | `/api/v1/indexlab/indexes/url-summary` | summarize URL index by category | none | none | summary payload |
| GET | `/api/v1/indexlab/indexes/prompt-summary` | summarize prompt index by category | none | none | summary payload |
| GET | `/api/v1/indexlab/indexes/knob-snapshots` | read knob snapshots by category | none | none | `{ category, snapshots }` |
| GET | `/api/v1/indexlab/analytics/compound-curve` | compound learning curve | none | none | analytics payload |
| GET | `/api/v1/indexlab/analytics/cross-run-metrics` | cross-run aggregation | none | none | aggregated metrics |
| GET | `/api/v1/indexlab/analytics/host-health` | host-health aggregation | none | none | `{ category, hosts }` |
| GET | `/api/v1/indexlab/live-crawl/check-catalog` | read live-crawl validation catalog | none | none | validation section catalog |
| GET | `/api/v1/indexlab/live-crawl/evaluate` | evaluate live-crawl checks against a run | none | none | validation result payload |
| GET | `/api/v1/indexlab/live-crawl/settings-snapshot` | effective live-crawl settings snapshot | none | none | settings snapshot |

## Runtime Ops Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/indexlab/run/:runId/runtime/summary` | runtime summary rail | none | none | runtime summary |
| GET | `/api/v1/indexlab/run/:runId/runtime/workers` | worker list | none | none | `{ run_id, workers }` |
| GET | `/api/v1/indexlab/run/:runId/runtime/documents` | runtime documents list | none | none | `{ run_id, documents }` |
| GET | `/api/v1/indexlab/run/:runId/runtime/documents/:encodedUrl` | runtime document detail | none | none | document detail |
| GET | `/api/v1/indexlab/run/:runId/runtime/metrics` | runtime metrics rail | none | none | metrics payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/extraction/fields` | extraction field telemetry | none | none | extraction payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/extraction/plugins` | extraction plugin execution summary | none | none | `{ run_id, plugins }` |
| GET | `/api/v1/indexlab/run/:runId/runtime/extraction/open-folder/:folder` | open local extraction artifact folder in the OS shell | none | none | `{ opened }` or `404/500` |
| GET | `/api/v1/indexlab/run/:runId/runtime/extraction/resolve-folder/:folder` | resolve local extraction artifact folder path without opening it | none | none | `{ path, folder, type: 'local' }` |
| GET | `/api/v1/indexlab/run/:runId/runtime/fallbacks` | fallback events | none | none | fallback payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/queue` | queue telemetry | none | none | queue payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/crawl-ledger` | live URL crawl history plus query cooldown state | none | none | `{ run_id, urls, query_cooldowns }` or `400 { error: 'product_id required' }` |
| GET | `/api/v1/indexlab/run/:runId/runtime/workers/:workerId` | worker detail | none | none | worker detail |
| GET | `/api/v1/indexlab/run/:runId/runtime/screencast/:workerId/last` | last retained or synthesized screencast frame | none | none | `{ run_id, worker_id, frame }` or `404 { error: 'screencast_frame_not_found' }` |
| GET | `/api/v1/indexlab/run/:runId/runtime/video/:workerId` | stream retained crawl video for one worker | none | none | `video/webm` stream or `404 { error: 'video_not_found' }` |
| GET | `/api/v1/indexlab/run/:runId/runtime/llm-dashboard` | runtime LLM dashboard | none | none | dashboard payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/prefetch` | needset/search-profile prefetch payload | none | none | prefetch payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/fetch` | fetch-phase runtime payload | none | none | fetch payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/pipeline` | pipeline-flow payload | none | none | pipeline payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/assets/:filename` | serve retained runtime screenshot asset | none | none | binary image/video asset or `404 { error: 'file_not_found' }` |

## Color Registry And Finder Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/colors` | list global color registry entries | none | none | `Color[]` |
| POST | `/api/v1/colors` | add one global color | none | `{ name, hex }` | `{ ok, color }` or `400 { ok: false, error }` |
| PUT | `/api/v1/colors/:name` | update one color hex | none | `{ hex }` | `{ ok, color }` or `404 { ok: false, error: 'not_found' }` |
| DELETE | `/api/v1/colors/:name` | delete one color | none | none | `{ ok: true, deleted }` or `404 { ok: false, error: 'not_found' }` |
| GET | `/api/v1/color-edition-finder/:category` | list color-edition-finder rows for one category | none | none | row array or `503 { error: 'specDb not ready' }` |
| GET | `/api/v1/color-edition-finder/:category/:productId` | read one product's color-edition-finder state | none | none | detail payload or `404/503` |
| POST | `/api/v1/color-edition-finder/:category/:productId` | run the finder for one product | none | none | `{ ok, colors, editions, default_color, fallbackUsed }` or `404/503/500` |
| DELETE | `/api/v1/color-edition-finder/:category/:productId/runs/:runNumber` | delete one historical finder run | none | none | `{ ok: true, remaining_runs }` or `400/503` |
| DELETE | `/api/v1/color-edition-finder/:category/:productId` | delete all finder state for one product | none | none | `{ ok: true }` or `503` |

## Unit Registry Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/unit-registry` | list all managed units | none | none | `{ units }` |
| GET | `/api/v1/unit-registry/canonicals` | list canonical unit keys for lightweight pickers | none | none | `{ canonicals }` |
| GET | `/api/v1/unit-registry/:canonical` | read one unit | none | none | `{ unit }` or `404 { error: 'Unit not found' }` |
| POST | `/api/v1/unit-registry/sync` | force AppDb -> JSON mirror sync | none | none | `{ synced: true }` |
| POST | `/api/v1/unit-registry` | create or update one unit | none | `{ canonical, label?, synonyms?, conversions? }` | `{ unit }` or `400 { error: 'canonical is required' }` |
| DELETE | `/api/v1/unit-registry/:canonical` | delete one unit | none | none | `{ deleted: true, canonical }` or `404 { error: 'Unit not found' }` |

## Catalog And Brand Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| POST | `/api/v1/catalog/:category/reconcile` | reconcile orphaned catalog state | none | `{ dryRun? }` | reconciliation result |
| GET | `/api/v1/catalog/:category/products` | list products in category catalog | none | none | product rows |
| POST | `/api/v1/catalog/:category/products` | add a product | none | `{ brand, base_model, variant? }` | product add result |
| POST | `/api/v1/catalog/:category/products/bulk` | bulk add products | none | `{ brand, rows }` | bulk add result |
| PUT | `/api/v1/catalog/:category/products/:productId` | update product | none | patch body | update result |
| DELETE | `/api/v1/catalog/:category/products/:productId` | delete product | none | none | delete result |
| GET | `/api/v1/catalog/:category` | category catalog overview | none | none | catalog rows |
| GET | `/api/v1/catalog/all` | merged cross-category catalog | none | none | catalog rows |
| GET | `/api/v1/product/:category/:productId` | latest product detail bundle | none | none | `{ summary, normalized, provenance, trafficLight, fieldOrder }` |
| GET | `/api/v1/brands` | list brands, optionally filtered by category query param | none | none | brand rows |
| POST | `/api/v1/brands/seed` | seed brands from active filtering | none | `{ category? }` | seed result |
| POST | `/api/v1/brands/bulk` | bulk add brands | none | `{ category, names }` | bulk add result |
| GET | `/api/v1/brands/:slug/impact` | rename/delete impact analysis | none | none | impact analysis |
| POST | `/api/v1/brands` | add brand | none | `{ name, aliases?, categories?, website? }` | add result |
| PUT | `/api/v1/brands/:slug` | update or rename brand | none | patch body | update/rename result |
| DELETE | `/api/v1/brands/:slug` | delete brand | none | none | delete result |

## Studio Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/field-labels/:category` | session-derived field labels | none | none | `{ category, labels }` |
| GET | `/api/v1/studio/:category/payload` | studio payload (backfills missing EG defaults; returns `egLockedKeys`, `egEditablePaths`, `egToggles`, `registeredColors`) | none | none | field rules, order, UI catalog, guardrails, EG lock state |
| GET | `/api/v1/studio/:category/products` | product list for studio context | none | none | `{ products, brands }` |
| POST | `/api/v1/studio/:category/compile` | start compile-rules process | none | none | process status |
| POST | `/api/v1/studio/:category/validate-rules` | start validate-rules process | none | none | process status |
| GET | `/api/v1/studio/:category/guardrails` | read generated studio guardrails | none | none | guardrails JSON |
| GET | `/api/v1/studio/:category/known-values` | read known values from SpecDb | none | none | known-values payload or `503 { error: 'specdb_not_ready' }` |
| POST | `/api/v1/studio/:category/enum-consistency` | enum-consistency review/apply from suggestions | none | `{ field, apply?, maxPending?, formatGuidance? }` | consistency payload |
| GET | `/api/v1/studio/:category/component-db` | read component DB projection from SpecDb | none | none | component-db payload or `503 { error: 'specdb_not_ready' }` |
| GET | `/api/v1/studio/:category/field-studio-map` | read preferred field-studio map | none | none | map payload |
| PUT | `/api/v1/studio/:category/field-studio-map` | save field-studio map (sanitizes locked EG field overrides) | none | field-studio map JSON | save result |
| PUT | `/api/v1/studio/:category/field-key-order` | persist field-key ordering | none | `{ order: string[] }` | `{ ok: true, category }` or `503 { error: 'specdb_not_ready' }` |
| POST | `/api/v1/studio/:category/validate-field-studio-map` | validate field-studio map | none | field-studio map JSON | validation result |
| GET | `/api/v1/studio/:category/tooltip-bank` | read tooltip-bank aggregate | none | none | tooltip entries + files |
| POST | `/api/v1/studio/:category/invalidate-cache` | invalidate session/studio caches | none | none | `{ ok: true }` |
| GET | `/api/v1/studio/:category/artifacts` | list generated artifact files | none | none | artifact rows |

## Authority, Queue, Billing, Learning, Source Strategy, And Spec Seeds

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/data-authority/:category/snapshot` | authority freshness and observability snapshot | none | none | authority snapshot |
| GET | `/api/v1/queue/:category` | raw queue state for a category | none | none | queue product rows |
| GET | `/api/v1/queue/:category/review` | review queue slice | none | none | review queue rows |
| POST | `/api/v1/queue/:category/retry` | requeue one product | none | `{ productId }` | retry result |
| POST | `/api/v1/queue/:category/pause` | pause one product | none | `{ productId }` | pause result |
| POST | `/api/v1/queue/:category/priority` | update queue priority | none | `{ productId, priority }` | priority result |
| POST | `/api/v1/queue/:category/requeue-exhausted` | requeue failed/exhausted products | none | none | `{ ok, requeued_count, productIds }` |
| GET | `/api/v1/billing/:category/monthly` | latest monthly billing summary | none | none | billing summary |
| GET | `/api/v1/learning/:category/artifacts` | list learning artifact files | none | none | artifact rows |
| GET | `/api/v1/source-strategy?category=:category` | read source strategy entries | none | none | source entries |
| POST | `/api/v1/source-strategy?category=:category` | create source strategy entry | none | source entry body | `{ ok, sourceId }` |
| PUT | `/api/v1/source-strategy/:sourceId?category=:category` | update source strategy entry | none | patch body | updated entry |
| DELETE | `/api/v1/source-strategy/:sourceId?category=:category` | delete source strategy entry | none | none | `{ ok: true }` |
| GET | `/api/v1/spec-seeds?category=:category` | read per-category deterministic query templates | none | none | `{ category, seeds }` |
| PUT | `/api/v1/spec-seeds?category=:category` | replace per-category deterministic query templates | none | `{ seeds: string[] }` or `string[]` | `{ category, seeds }` or `400 { error: 'invalid_spec_seeds', reason }` |

## Publisher Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/publisher/:category/candidates?page=:page&limit=:limit` | read paginated publisher candidate rows plus aggregate stats | none | none | `{ rows, total, page, limit, stats }` or `400/404` |
| GET | `/api/v1/publisher/:category/stats` | read aggregate publisher candidate stats only | none | none | `{ total, resolved, pending, repaired, products }` or `400/404` |

## Review Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/review/:category/layout` | scalar review layout | none | none | layout payload |
| GET | `/api/v1/review/:category/product/:productId` | one product review payload | none | none | product review payload |
| GET | `/api/v1/review/:category/products` | batch review payloads | none | none | review payload array |
| GET | `/api/v1/review/:category/products-index` | lightweight review index | none | none | `{ products, brands, total, metrics_run }` |
| GET | `/api/v1/review/:category/candidates/:productId/:fieldKey` | lazy candidate drawer payload | none | none | candidate payload |
| POST | `/api/v1/review/:category/suggest` | append review suggestion via CLI helper | none | suggestion body | `{ ok, output }` |
| POST | `/api/v1/review/:category/override` | accept candidate or manual override for scalar review | none | override body | mutation result |
| POST | `/api/v1/review/:category/manual-override` | manual override with explicit evidence payload | none | manual-override body | mutation result |
| POST | `/api/v1/review/:category/key-review-confirm` | AI confirm a scalar lane candidate | none | `{ lane, candidateId, itemFieldStateId/id }` | mutation result |
| POST | `/api/v1/review/:category/key-review-accept` | human accept a scalar lane candidate | none | `{ lane, candidateId, itemFieldStateId/id }` | mutation result |
| GET | `/api/v1/review-components/:category/layout` | component review layout | none | none | layout payload |
| GET | `/api/v1/review-components/:category/components` | component review items | none | none | component payload |
| GET | `/api/v1/review-components/:category/enums` | enum review items | none | none | enum payload |
| POST | `/api/v1/review-components/:category/enum-consistency` | enum-consistency review/apply on review surface | none | `{ field, apply?, maxPending? }` | consistency payload |
| GET | `/api/v1/review-components/:category/component-impact` | products impacted by a component | none | none | impact payload |
| GET | `/api/v1/review-components/:category/component-review` | component review queue doc | none | none | review doc |
| POST | `/api/v1/review-components/:category/component-review-action` | apply component review action | none | `{ review_id, action, merge_target? }` | action result |
| POST | `/api/v1/review-components/:category/component-override` | override component property/identity | none | component mutation body | mutation result |
| POST | `/api/v1/review-components/:category/component-key-review-confirm` | AI confirm component shared lane | none | component lane body | mutation result |
| POST | `/api/v1/review-components/:category/enum-override` | add/remove/accept/confirm enum value | none | enum mutation body | mutation result |
| POST | `/api/v1/review-components/:category/enum-rename` | rename enum value atomically | none | `{ newValue, ...context }` | mutation result |

No verified `POST /api/v1/review/:category/finalize` endpoint exists in the current server route tree. `tools/gui-react/src/features/review/components/ReviewPage.tsx` still references that path, so treat it as stale client drift rather than part of the live API contract.

## Test Mode Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/test-mode/audit` | read cached field contract audit from `field_audit_cache` table | none | query param: `category` | `{ cached: true, run_at, ...auditResults }` or `{ cached: false }` |
| POST | `/api/v1/test-mode/validate` | run full field contract audit, persist results to DB, return results | none | `{ category }` | `FieldContractAuditResult` with `{ summary: { totalFields, totalChecks, passCount, failCount }, ... }` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/guiServerRuntime.js` | mounted route families include `specSeeds`, `colors`, and `colorEditionFinder` in the live runtime |
| source | `src/app/api/requestDispatch.js` | base prefix, alias normalization, category segment scopes, and route parsing |
| source | `src/app/api/routes/infraRoutes.js` | infra route family composition (health, category, searxng, serper, process, graphql) |
| source | `src/app/api/routes/infra/healthRoutes.js` | health GET handler (root + `/health`) |
| source | `src/app/api/routes/infra/categoryRoutes.js` | category list/create endpoints |
| source | `src/app/api/routes/infra/searxngRoutes.js` | SearXNG status/start endpoints |
| source | `src/app/api/routes/infra/serperRoutes.js` | Serper credit balance proxy endpoint |
| source | `src/app/api/routes/infra/processRoutes.js` | process start/stop/status surface |
| source | `src/app/api/routes/infra/graphqlRoutes.js` | orphaned GraphQL proxy (always 502) |
| source | `src/features/settings/api/configRoutes.js` | config route dispatcher (ui-settings, indexing, llm-settings, runtime-settings, llm-policy) |
| source | `src/features/settings/api/configUiSettingsHandler.js` | `ui-settings` GET/PUT contract |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | `runtime-settings` GET/PUT/POST contract |
| source | `src/features/settings/api/configLlmSettingsHandler.js` | category LLM route-matrix GET/PUT/reset contract |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | `indexing/llm-config`, `llm-metrics`, `domain-checklist`, and `review-metrics` payloads |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy endpoint behavior |
| source | `src/features/indexing/api/indexlabRoutes.js` | IndexLab endpoints, analytics, live-crawl, and storage delegation |
| source | `src/features/indexing/api/storageManagerRoutes.js` | live `/storage/*` inventory and maintenance endpoints |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | Runtime Ops endpoints (20 GET routes under `/runtime/`) |
| source | `src/features/color-registry/api/colorRoutes.js` | global color registry CRUD endpoints |
| source | `src/features/color-edition/api/colorEditionFinderRoutes.js` | color-edition-finder GET/POST/DELETE endpoints |
| source | `src/features/unit-registry/api/unitRegistryRoutes.js` | unit registry CRUD and sync endpoints |
| source | `src/features/catalog/api/catalogRoutes.js` | catalog/product endpoints (no `events` or `products/seed` handler exists) |
| source | `src/features/catalog/api/brandRoutes.js` | brand CRUD endpoints including rename, seed, bulk, impact, delete |
| source | `src/features/studio/api/studioRoutes.js` | studio endpoints (17 routes including field-key-order, tooltip-bank, artifacts, invalidate-cache) |
| source | `src/features/category-authority/api/dataAuthorityRoutes.js` | authority snapshot endpoint |
| source | `src/features/indexing/api/queueBillingLearningRoutes.js` | queue/billing/learning endpoints |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source strategy CRUD endpoints including DELETE |
| source | `src/features/indexing/api/specSeedsRoutes.js` | deterministic spec-seed GET/PUT endpoints |
| source | `src/features/publisher/api/publisherRoutes.js` | publisher audit endpoints |
| source | `src/features/review/api/reviewRoutes.js` | review dispatcher (delegates to field, component, item mutation, component mutation, enum mutation handlers) |
| source | `src/features/review/api/fieldReviewHandlers.js` | field review read routes (layout, product, products, products-index, candidates, suggest) |
| source | `src/features/review/api/itemMutationRoutes.js` | scalar review mutation routes (override, manual-override, key-review-confirm, key-review-accept) |
| source | `src/features/review/api/componentReviewHandlers.js` | component review read routes (layout, components, enums, enum-consistency, component-impact, component-review, component-review-action) |
| source | `src/features/review/api/componentMutationRoutes.js` | component mutation routes (component-override, component-key-review-confirm) |
| source | `src/features/review/api/enumMutationRoutes.js` | enum mutation routes (enum-override, enum-rename) |
| source | `src/features/review/api/routeSharedHelpers.js` | `routeMatches` function confirms `parts[0]/parts[1]/parts[2]` = scope/category/action URL pattern |
| source | `src/features/review/services/itemMutationService.js` | `resolveItemOverrideMode` confirms override and manual-override action paths |
| source | `src/app/api/routes/testModeRoutes.js` | test-mode field contract audit endpoints (audit GET + validate POST) |
| source | `src/app/api/routes/testModeRouteContext.js` | test-mode route context wiring `runFieldContractTests`, `mergeDiscoveredEnums`, `buildDiscoveredEnumMap` |

## Related Documents

- [Routing and GUI](../03-architecture/routing-and-gui.md) - maps GUI routes to the endpoint families listed here.
- [Feature Index](../04-features/feature-index.md) - maps endpoint families to features.
- [Background Jobs](./background-jobs.md) - identifies which of these endpoints start long-running work.
