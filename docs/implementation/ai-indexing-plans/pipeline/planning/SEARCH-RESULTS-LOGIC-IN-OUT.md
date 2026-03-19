# Search Results Logic In And Out

Validated against live code on 2026-03-18.

## What this stage is

Search Results is the provider-facing execution stage. It runs the final query set, handles internal-first behavior, frontier cache reuse, the Google-vs-SearXNG transport split, and the plan-only fallback for no-provider scenarios.

Primary owners:

- `src/features/indexing/discovery/discoverySearchExecution.js`
- `src/features/indexing/search/searchProviders.js`
- `src/features/indexing/search/searchGoogle.js`

## Schema files in this folder

- `05-searxng-execution-input.json`
- `05-google-crawlee-execution-input.json`
- cumulative runtime output coverage continues in `04-query-journey-output.json`

## Inputs in

`executeSearchQueries()` consumes:

- `queries`
- `executionQueryLimit`
- `queryConcurrency`
- `resultsPerQuery`
- `queryLimit`
- `searchProfileCaps`
- `missingFields`
- `variables`
- `selectedQueryRowMap`
- `profileQueryRowMap`
- `providerState`
- `requiredOnlySearch`
- `missingRequiredFields`
- `config`, `storage`, `logger`, `runtimeTraceWriter`, `frontierDb`
- `categoryConfig`, `job`, `runId`

Important caller nuance:

- canonical `runDiscoverySeedPlan()` forces `queryConcurrency = 1`
- compatibility `discoverCandidateSources()` still passes `max(1, config.discoveryQueryConcurrency || 1)`

## Live logic

`executeSearchQueries()` currently runs in this order:

1. Emit `search_provider_diagnostics`.
2. If `discoveryInternalFirst` is enabled:
   - optionally reuse frontier-cached query rows
   - search the internal source corpus
   - record internal query attempts in frontier
   - decide whether required-field pressure is satisfied enough to skip external search
3. If internet search is still needed and a provider path exists:
   - run queries through `runWithConcurrency()`
   - optionally reuse frontier-cached rows before calling a provider
   - emit `discovery_query_started` / `discovery_query_completed`
   - call `runSearchProviders()`
   - on zero provider results, try frontier-cache reuse for that query
   - record query index NDJSON rows
   - optionally write runtime search traces
4. If there is no viable provider path and `rawResults` is still empty:
   - build plan-only manufacturer URLs through `buildPlanOnlyResults()`

## Transport split

`runSearchProviders()` uses `splitEnginesByTransport()`:

- `google` goes through `attemptGoogleCrawlee()` -> `searchGoogle()`
- every non-google engine goes through `searchSearxng()`

Important details:

- Google readiness is independent of `searxngBaseUrl`.
- SearXNG readiness requires both configured engines and a valid base URL.
- Fallback engines only run when the primary attempt returns zero usable rows.

## Important invariants

- Frontier cache reuse can happen in both internal-first and internet-search branches.
- Zero provider rows do not automatically trigger plan-only fallback; plan-only happens only when there is no viable provider path and no accumulated raw results.
- CAPTCHA/consent handling on Google is non-fatal and returns zero rows.
- Search Results itself does not choose winners. It only returns raw rows plus attempt/journal metadata.
- `search_queued` is emitted by the canonical orchestrator before this stage starts. Search Results does not emit those queued-slot rows itself.

## Outputs out

`executeSearchQueries()` returns:

- `rawResults`
- `searchAttempts`
- `searchJournal`
- `internalSatisfied`
- `externalSearchReason`

## Side effects and persistence

- frontier query recording via `frontierDb.recordQuery()`
- query cooldown reuse via `frontierDb.shouldSkipQuery()`
- query-index NDJSON writes under the IndexLab runtime artifact root
- optional runtime trace JSON writes
- optional Google SERP screenshot writes
- query lifecycle runtime events for the bridge (`discovery_query_started`, `discovery_query_completed`)

## What it feeds next

Search Results feeds SERP Triage with:

- raw provider rows
- query attempt metadata
- search journal rows
- internal/external execution reason state

SERP Triage then decides what survives.
