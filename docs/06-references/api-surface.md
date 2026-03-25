# API Surface

> **Purpose:** Inventory the verified HTTP endpoints exposed by the GUI server, grouped by route family and backed by concrete file paths.
> **Prerequisites:** [../03-architecture/backend-architecture.md](../03-architecture/backend-architecture.md), [../04-features/feature-index.md](../04-features/feature-index.md)
> **Last validated:** 2026-03-24

## Global Notes

- Base REST prefix: `/api/v1`
- Health alias without prefix: `/health`
- Auth: no verified auth middleware protects these endpoints in the current runtime
- Route parsing and category alias normalization live in `src/app/api/requestDispatch.js`

## Infra And Process Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/health` | root health alias | none | none | `{ ok, service, dist_root, cwd, isPkg }` |
| GET | `/api/v1/health` | GUI/API health | none | none | `{ ok, service, dist_root, cwd, isPkg }` |
| GET | `/api/v1/categories` | list categories | none | none | `string[]` |
| POST | `/api/v1/categories` | create category skeleton | none | `{ name }` | `{ ok, slug, categories }` |
| GET | `/api/v1/searxng/status` | SearXNG local status | none | none | status object |
| POST | `/api/v1/searxng/start` | start local SearXNG stack | none | none | start result or error |
| POST | `/api/v1/process/start` | spawn CLI child process | none | process launch plan fields such as `category`, `command`, `replaceRunning`, `runId` | normalized process status |
| POST | `/api/v1/process/stop` | stop child process | none | `{ force? }` | normalized process status |
| GET | `/api/v1/process/status` | read child-process status | none | none | normalized process status |
| POST | `/api/v1/graphql` | proxy GraphQL request to local helper server | none | GraphQL JSON body | proxied GraphQL JSON or `502` |

## Settings And Configuration Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/ui-settings` | read persisted UI toggles | none | none | UI settings object |
| PUT | `/api/v1/ui-settings` | persist UI toggles | none | subset of UI toggle keys | `{ ok, applied, snapshot, rejected }` |
| GET | `/api/v1/storage-settings/local` | browse local run-data directories | none | none | directory listing |
| GET | `/api/v1/storage-settings/local/browse` | browse local run-data directories | none | none | directory listing |
| GET | `/api/v1/storage-settings` | read run-data storage settings | none | none | sanitized storage settings |
| PUT | `/api/v1/storage-settings` | persist run-data storage settings | none | storage settings patch | `{ ok, applied, snapshot, rejected }` |
| POST | `/api/v1/storage-settings` | compatibility write alias for storage-settings autosave | none | storage settings patch | `{ ok, applied, snapshot, rejected }` |
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
| GET | `/api/v1/runtime-settings` | read runtime settings | none | none | runtime settings |
| PUT | `/api/v1/runtime-settings` | persist runtime settings | none | runtime settings patch | `{ ok, applied, snapshot, rejected }` |
| POST | `/api/v1/runtime-settings` | compatibility write alias for runtime-settings autosave | none | runtime settings patch | `{ ok, applied, snapshot, rejected }` |

No live `/api/v1/convergence-settings` route is registered in `src/features/settings/api/configRoutes.js`. The persisted `convergence` object in `user-settings.json` is compatibility-only.

## IndexLab Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| GET | `/api/v1/indexlab/runs` | list recent runs | none | none | `{ root, runs }` |
| GET | `/api/v1/indexlab/run/:runId` | read run metadata | none | none | run meta JSON |
| GET | `/api/v1/indexlab/run/:runId/events` | replay run events | none | none | `{ run_id, count, events }` |
| GET | `/api/v1/indexlab/run/:runId/needset` | read run needset | none | none | needset payload |
| GET | `/api/v1/indexlab/run/:runId/search-profile` | read run search profile | none | none | search profile payload |
| GET | `/api/v1/indexlab/run/:runId/phase07-retrieval` | read retrieval packet | none | none | retrieval payload |
| GET | `/api/v1/indexlab/run/:runId/phase08-extraction` | read extraction packet | none | none | extraction payload |
| GET | `/api/v1/indexlab/run/:runId/dynamic-fetch-dashboard` | read dynamic-fetch dashboard | none | none | dynamic-fetch payload |
| GET | `/api/v1/indexlab/run/:runId/source-indexing-packets` | read source packet collection | none | none | source packet payload |
| GET | `/api/v1/indexlab/run/:runId/item-indexing-packet` | read item packet | none | none | item packet payload |
| GET | `/api/v1/indexlab/run/:runId/run-meta-packet` | read run-meta packet | none | none | run-meta packet payload |
| GET | `/api/v1/indexlab/run/:runId/serp` | read SERP explorer payload | none | none | SERP payload |
| GET | `/api/v1/indexlab/run/:runId/llm-traces` | read LLM trace slice | none | none | trace payload |
| GET | `/api/v1/indexlab/run/:runId/automation-queue` | read automation queue | none | none | automation queue payload |
| GET | `/api/v1/indexlab/run/:runId/evidence-index` | query evidence index | none | none | evidence search payload |
| GET | `/api/v1/indexlab/run/:runId/rounds` | summarize run rounds from events | none | none | round summary |
| GET | `/api/v1/indexlab/run/:runId/learning` | summarize learning updates for a run | none | none | learning payload |
| GET | `/api/v1/indexlab/indexes/query-summary` | summarize query index by category | none | none | summary payload |
| GET | `/api/v1/indexlab/indexes/url-summary` | summarize URL index by category | none | none | summary payload |
| GET | `/api/v1/indexlab/indexes/prompt-summary` | summarize prompt index by category | none | none | summary payload |
| GET | `/api/v1/indexlab/indexes/knob-snapshots` | read knob snapshots by category | none | none | `{ category, snapshots }` |
| GET | `/api/v1/indexlab/analytics/compound-curve` | compound learning curve | none | none | analytics payload |
| GET | `/api/v1/indexlab/analytics/plan-diff` | diff two run plans | none | none | plan diff payload |
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
| GET | `/api/v1/indexlab/run/:runId/runtime/fallbacks` | fallback events | none | none | fallback payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/queue` | queue telemetry | none | none | queue payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/workers/:workerId` | worker detail | none | none | worker detail |
| GET | `/api/v1/indexlab/run/:runId/runtime/screencast/:workerId/last` | last screencast frame | none | none | retained or synthetic frame payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/llm-dashboard` | runtime LLM dashboard | none | none | dashboard payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/prefetch` | needset/search-profile prefetch payload | none | none | prefetch payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/pipeline` | pipeline-flow payload | none | none | pipeline payload |
| GET | `/api/v1/indexlab/run/:runId/runtime/assets/:filename` | serve retained runtime screenshot asset | none | none | binary image asset |

## Catalog And Brand Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| POST | `/api/v1/catalog/:category/reconcile` | reconcile orphaned catalog state | none | `{ dryRun? }` | reconciliation result |
| GET | `/api/v1/catalog/:category/products` | list products in category catalog | none | none | product rows |
| POST | `/api/v1/catalog/:category/products` | add a product | none | `{ brand, model, variant?, seedUrls? }` | product add result |
| POST | `/api/v1/catalog/:category/products/seed` | seed queue/catalog from catalog entries | none | `{ mode? }` | seed result |
| POST | `/api/v1/catalog/:category/products/bulk` | bulk add products | none | `{ brand, rows }` | bulk add result |
| PUT | `/api/v1/catalog/:category/products/:productId` | update product | none | patch body | update result |
| DELETE | `/api/v1/catalog/:category/products/:productId` | delete product | none | none | delete result |
| GET | `/api/v1/catalog/:category` | category catalog overview | none | none | catalog rows |
| GET | `/api/v1/catalog/all` | merged cross-category catalog | none | none | catalog rows |
| GET | `/api/v1/product/:category/:productId` | latest product detail bundle | none | none | `{ summary, normalized, provenance, trafficLight, fieldOrder }` |
| GET | `/api/v1/events/:category` | filtered runtime events | none | none | event rows |
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
| GET | `/api/v1/studio/:category/payload` | studio payload | none | none | field rules, order, UI catalog, guardrails |
| GET | `/api/v1/studio/:category/products` | product list for studio context | none | none | `{ products, brands }` |
| POST | `/api/v1/studio/:category/compile` | start compile-rules process | none | none | process status |
| POST | `/api/v1/studio/:category/validate-rules` | start validate-rules process | none | none | process status |
| GET | `/api/v1/studio/:category/guardrails` | read generated studio guardrails | none | none | guardrails JSON |
| GET | `/api/v1/studio/:category/known-values` | read known values from SpecDb | none | none | known-values payload |
| POST | `/api/v1/studio/:category/enum-consistency` | enum-consistency review/apply from suggestions | none | `{ field, apply?, maxPending?, formatGuidance? }` | consistency payload |
| GET | `/api/v1/studio/:category/component-db` | read component DB projection from SpecDb | none | none | component-db payload |
| GET | `/api/v1/studio/:category/field-studio-map` | read preferred field-studio map | none | none | map payload |
| PUT | `/api/v1/studio/:category/field-studio-map` | save field-studio map | none | field-studio map JSON | save result |
| POST | `/api/v1/studio/:category/validate-field-studio-map` | validate field-studio map | none | field-studio map JSON | validation result |
| GET | `/api/v1/studio/:category/tooltip-bank` | read tooltip-bank aggregate | none | none | tooltip entries + files |
| POST | `/api/v1/studio/:category/invalidate-cache` | invalidate session/studio caches | none | none | `{ ok: true }` |
| GET | `/api/v1/studio/:category/artifacts` | list generated artifact files | none | none | artifact rows |

## Authority, Queue, Billing, Learning, And Source Strategy

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
| POST | `/api/v1/review-components/:category/run-component-review-batch` | run batch component review | none | none | batch result |
| POST | `/api/v1/review-components/:category/component-override` | override component property/identity | none | component mutation body | mutation result |
| POST | `/api/v1/review-components/:category/component-key-review-confirm` | AI confirm component shared lane | none | component lane body | mutation result |
| POST | `/api/v1/review-components/:category/enum-override` | add/remove/accept/confirm enum value | none | enum mutation body | mutation result |
| POST | `/api/v1/review-components/:category/enum-rename` | rename enum value atomically | none | `{ newValue, ...context }` | mutation result |

No verified `POST /api/v1/review/:category/finalize` endpoint exists in the current server route tree. `tools/gui-react/src/features/review/components/ReviewPage.tsx` still references that path, so treat it as stale client drift rather than part of the live API contract.

## Test Mode Endpoints

| Method | Path | Purpose | Auth | Request body | Response shape |
|--------|------|---------|------|--------------|----------------|
| POST | `/api/v1/test-mode/create` | create `_test_*` category from a source category | none | `{ sourceCategory? }` | `{ ok, category, contractSummary }` |
| GET | `/api/v1/test-mode/contract-summary` | read test-mode contract summary | none | none | `{ ok, summary, matrices, scenarioDefs }` |
| GET | `/api/v1/test-mode/status` | read test-mode fixture/run status | none | none | `{ ok, exists, testCategory, testCases, runResults }` |
| POST | `/api/v1/test-mode/generate-products` | generate synthetic products | none | `{ category }` | `{ ok, products, testCases }` |
| POST | `/api/v1/test-mode/run` | attempt synthetic product runs; currently returns per-product error rows because `runTestProduct` is stubbed in route context | none | `{ category, productId?, useLlm?, aiReview?, resetState?, resyncSpecDb? }` | `{ ok, results }` with `status: 'error'` rows on the current worktree |
| POST | `/api/v1/test-mode/validate` | validate synthetic run outputs | none | `{ category }` | validation results + summary |
| DELETE | `/api/v1/test-mode/:category` | delete `_test_*` category artifacts | none | none | `{ ok, deleted }` |

## Validated Against

| Source | Path | What was verified |
|--------|------|-------------------|
| source | `src/app/api/requestDispatch.js` | base prefix, alias normalization, route parsing |
| source | `src/app/api/routes/infraRoutes.js` | infra route family composition |
| source | `src/features/settings/api/configRoutes.js` | settings/config endpoints |
| source | `src/features/settings/api/configUiSettingsHandler.js` | `ui-settings` GET/PUT contract |
| source | `src/features/settings/api/configStorageSettingsHandler.js` | `storage-settings` browse alias plus GET/PUT/POST contract |
| source | `src/features/settings/api/configRuntimeSettingsHandler.js` | `runtime-settings` GET/PUT/POST contract |
| source | `src/features/settings/api/configLlmSettingsHandler.js` | category LLM route-matrix GET/PUT/reset contract |
| source | `src/features/settings/api/configIndexingMetricsHandler.js` | `indexing/llm-config`, `llm-metrics`, checklist, and review-metrics payloads |
| source | `src/features/settings-authority/llmPolicyHandler.js` | composite LLM policy endpoint behavior |
| source | `src/features/indexing/api/indexlabRoutes.js` | IndexLab endpoints |
| source | `src/features/indexing/api/runtimeOpsRoutes.js` | Runtime Ops endpoints |
| source | `src/features/catalog/api/catalogRoutes.js` | catalog/product/event endpoints |
| source | `src/features/catalog/api/brandRoutes.js` | brand endpoints |
| source | `src/features/studio/api/studioRoutes.js` | studio endpoints |
| source | `src/features/category-authority/api/dataAuthorityRoutes.js` | authority snapshot endpoint |
| source | `src/features/indexing/api/queueBillingLearningRoutes.js` | queue/billing/learning endpoints |
| source | `src/features/indexing/api/sourceStrategyRoutes.js` | source strategy endpoints |
| source | `src/features/review/api/reviewRoutes.js` | review read endpoints and review batch endpoints |
| source | `src/features/review/api/itemMutationRoutes.js` | scalar review mutation endpoints |
| source | `src/features/review/api/componentMutationRoutes.js` | component mutation endpoints |
| source | `src/features/review/api/enumMutationRoutes.js` | enum mutation endpoints |
| source | `tools/gui-react/src/features/review/components/ReviewPage.tsx` | stale client reference to non-live `finalize` path |
| source | `src/app/api/routes/testModeRoutes.js` | test-mode endpoints |
| source | `src/app/api/routes/testModeRouteContext.js` | stubbed test-mode run context |

## Related Documents

- [Routing and GUI](../03-architecture/routing-and-gui.md) - Maps GUI routes to the endpoint families listed here.
- [Feature Index](../04-features/feature-index.md) - Maps endpoint families to features.
- [Background Jobs](./background-jobs.md) - Identifies which of these endpoints start long-running work.
