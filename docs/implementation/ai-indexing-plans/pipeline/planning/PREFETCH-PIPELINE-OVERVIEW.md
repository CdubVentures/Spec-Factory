# Prefetch Pipeline Overview

Validated: 2026-03-18.

Source of truth:

- `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js`
- `src/features/indexing/discovery/stages/needSet.js`
- `src/features/indexing/discovery/stages/brandResolver.js`
- `src/features/indexing/discovery/stages/searchProfile.js`
- `src/features/indexing/discovery/stages/searchPlanner.js`
- `src/features/indexing/discovery/stages/queryJourney.js`
- `src/features/indexing/discovery/discoverySearchExecution.js`
- `src/features/indexing/discovery/discoveryResultProcessor.js`

## Strict 8-Stage Sequential Flow

```text
Stage 01: NeedSet           - Schema 2 -> Schema 3 -> Schema 4 planner handoff
Stage 02: Brand Resolver    - brand domain, aliases, support domain, auto-promotion
Stage 03: Search Profile    - deterministic query base + optional effective host plan
Stage 04: Search Planner    - Schema 4 adaptation + uber query planning
Stage 05: Query Journey     - merge, dedupe, rank, guard, write planned search_profile
Stage 06: Search Results    - internal/frontier/provider execution
Stage 07: SERP Triage       - selector path or deterministic lane-selection path
Stage 08: Domain Classifier - enqueue approved/candidate URLs to planner queue
```

Every stage runs. There is no branching between stages. Conditional behavior stays inside the stage that owns it.

## Canonical runtime order

`runDiscoverySeedPlan()`:
1. Load enabled source entries and normalize planning hints.
2. Force `discoveryEnabled=true` and default empty `searchEngines` to `bing,google`.
3. Stage 01 NeedSet:
   - `computeNeedSet()` builds Schema 2.
   - `buildSearchPlanningContext()` builds Schema 3.
   - `buildSearchPlan()` builds Schema 4.
   - `runNeedSet()` emits `needset_computed` twice when Schema 4 succeeds:
     - `scope: schema2_preview` before the Schema 4 LLM call
     - `scope: schema4_planner` after the panel is assembled
4. Stage 02 Brand Resolver:
   - `runBrandResolver()` resolves brand domains after NeedSet so the NeedSet worker appears first in the GUI.
   - manufacturer auto-promotion happens here when enabled.
5. Stage 03 Search Profile:
   - `runSearchProfile()` builds deterministic `searchProfileBase`.
   - optional `buildEffectiveHostPlan()` and `buildScoredQueryRowsFromHostPlan()` run here.
6. Stage 04 Search Planner:
   - `resolveSchema4ExecutionPlan()` adapts the Schema 4 handoff.
   - `planUberQueries()` fires the Search Planner LLM call.
   - `search_plan_generated` is emitted here.
7. Stage 05 Query Journey:
   - merge deterministic rows, guarded Schema 4 rows, Search Planner uber queries, then append separately guarded host-plan rows.
   - write planned `search_profile`.
   - emit `search_profile_generated` and `query_journey_completed`.
8. Emit `search_queued` rows before Stage 06 so every search slot is visible before execution starts.
9. Stage 06 Search Results:
   - `executeSearchQueries()` runs internal-first lookup, frontier reuse, live provider search, and plan-only fallback.
10. Stage 07 SERP Triage:
   - `processDiscoveryResults()` performs deterministic domain classification.
   - then either:
     - uses the LLM selector path, or
     - uses deterministic soft-label/lane/quota selection plus optional rerank annotation.
11. Attach `seed_search_plan_output` to the discovery result when Schema 4 exists.
12. Stage 08 Domain Classifier:
   - `runDomainClassifier()` enqueues approved URLs and seeds candidate URLs.

`discoverCandidateSources()` remains as a compatibility entrypoint for direct callers and tests. It still mirrors the same stage logic, but the canonical GUI-facing pipeline is the stage-based orchestrator above.

## Logical tab order vs event order

Logical tab order:

```text
needset -> brand_resolver -> search_profile -> search_planner ->
query_journey -> search_results -> serp_triage -> domain_classifier
```

Actual key runtime event order on the canonical path:

```text
needset_computed
brand_resolved
search_plan_generated
search_profile_generated
query_journey_completed
search_queued
discovery_query_started
discovery_query_completed
search_results_collected
serp_triage_completed   (reranker path only)
domains_classified
discovery_enqueue_summary
```

Important nuance: `search_profile_generated` is emitted from Query Journey when the planned artifact is written, even though the GUI still treats it as the Search Profile tab payload.

## LLM surfaces

| Stage | Tab / Worker | Reason | Role | Owner |
|-------|---------------|--------|------|-------|
| 01 NeedSet | needset | `needset_search_planner` | `plan` | `src/indexlab/searchPlanBuilder.js` |
| 02 Brand Resolver | brand_resolver | `brand_resolution` | `triage` | `src/features/indexing/discovery/discoveryLlmAdapters.js` |
| 04 Search Planner | search_planner | `search_planner` | `plan` | `src/research/queryPlanner.js` |
| 07 SERP Triage | serp_triage | `serp_url_selector` | `triage` | `src/features/indexing/discovery/serpSelectorLlmAdapter.js` |
| 07 SERP Triage | serp_triage | `uber_serp_reranker` | `plan` | `src/research/serpReranker.js` |

`serp_triage` is a shared GUI tab/call-type bucket. In the live code, Stage 07 may use the selector, the reranker, neither, but never both at the same time on the same branch.

## Query Journey merge

Main merged candidate set:

1. Deterministic base templates from `searchProfileBase.base_templates`
2. Deterministic targeted rows from `searchProfileBase.query_rows`
3. Guarded Schema 4 rows from `resolveSchema4ExecutionPlan()`
4. Search Planner uber queries from `planUberQueries()`

Then:

- `dedupeQueryRows()`
- `prioritizeQueryRows()`
- rank cap
- `enforceIdentityQueryGuard()`
- separately guard host-plan rows and append unique survivors
- write planned `search_profile`
- emit `query_journey_completed`

`searchProfilePlanned.llm_queries` contains the merged Schema 4 query texts plus Search Planner uber query texts.

## Search worker slots

Each planned query gets its own letter slot. Slots stay visible because the orchestrator emits `search_queued` before execution starts.

- Query 1 -> `search-a`
- Query 2 -> `search-b`
- Query 3 -> `search-c`
- ...up to 26 letters, then `search-overflow-N`

Canonical orchestrator behavior:

- `runDiscoverySeedPlan()` forces `queryConcurrency = 1`
- search execution is strictly sequential
- queued slots keep the GUI ball alive between queries

Compatibility behavior:

- direct `discoverCandidateSources()` callers still pass `max(1, config.discoveryQueryConcurrency || 1)`

Search workers cannot appear before `query_journey_completed` fires. The GUI gates the Search Results tab on query journey data.

## Stage ownership

NeedSet:
- `src/features/indexing/discovery/stages/needSet.js`
- `src/indexlab/needsetEngine.js`
- `src/indexlab/searchPlanningContext.js`
- `src/indexlab/searchPlanBuilder.js`

Brand Resolver:
- `src/features/indexing/discovery/stages/brandResolver.js`
- `src/features/indexing/discovery/brandResolver.js`
- `src/features/indexing/discovery/discoveryLlmAdapters.js`

Search Profile:
- `src/features/indexing/discovery/stages/searchProfile.js`
- `src/features/indexing/search/queryBuilder.js`
- `src/features/indexing/discovery/domainHintResolver.js`

Search Planner:
- `src/features/indexing/discovery/stages/searchPlanner.js`
- `src/features/indexing/discovery/searchDiscovery.js` (`resolveSchema4ExecutionPlan`)
- `src/research/queryPlanner.js`

Query Journey:
- `src/features/indexing/discovery/stages/queryJourney.js`
- `src/features/indexing/discovery/discoveryQueryPlan.js`
- `src/features/indexing/discovery/searchPlanHandoffAdapter.js`

Search Results:
- `src/features/indexing/discovery/discoverySearchExecution.js`
- `src/features/indexing/search/searchProviders.js`
- `src/features/indexing/search/searchGoogle.js`

SERP Triage:
- `src/features/indexing/discovery/discoveryResultProcessor.js`
- triage helpers under `src/features/indexing/discovery/`
- `src/features/indexing/discovery/serpSelector.js`
- `src/features/indexing/discovery/serpSelectorLlmAdapter.js`
- `src/research/serpReranker.js`

Domain Classifier:
- `src/features/indexing/discovery/stages/domainClassifier.js`

## Artifacts

Planned then executed `search_profile`:
- `_discovery/{category}/{runId}.search_profile.json`
- `{category}/{productId}/runs/{runId}/analysis/search_profile.json`
- `{category}/{productId}/latest/search_profile.json`

Post-triage payloads:
- `_discovery/{category}/{runId}.json`
- `_sources/candidates/{category}/{runId}.json`

Search screenshots:
- `{indexLabRoot}/{runId}/screenshots/google-serp-*.jpeg`

Seed-phase carry-through:
- `runDiscoverySeedPlan()` attaches `seed_search_plan_output` to the discovery result so finalization can reuse the Schema 4 output without re-calling the NeedSet planner LLM.

## Conditional behavior

- Brand resolution short-circuits on empty brand, cache hit, missing route key, or resolver error.
- NeedSet preview `needset_computed` emits before the Schema 4 LLM call; the Schema 4 `needset_computed` event is conditional on `schema4.panel`.
- Search Planner falls back to deterministic output when no `plan` route API key or no stage model is available.
- `buildEffectiveHostPlan()` only runs when `categoryConfig.validatedRegistry` exists.
- External search can be skipped when `discoveryInternalFirst` satisfies required-field pressure.
- Plan-only URLs are emitted only when there is no viable provider path and `rawResults` is still empty.
- Stage 07 uses the selector path only when `serpSelectorEnabled=true` and a triage route key exists; otherwise it falls back to deterministic triage.
- `serp_triage_completed` is only guaranteed on the reranker path. Selector-only runs still surface as `serp_triage` LLM calls through worker telemetry.

## Learning loop

Bootstrap readback:
- `loadLearningStoreHintsForRun()` is best-effort and only when `selfImproveEnabled=true`.
- runtime discovery reads `_learning/{category}/field_lexicon.json`, `query_templates.json`, and `field_yield.json`.

Finalization writeback:
- `persistSelfImproveLearningStores()` only writes when `selfImproveEnabled=true` and there are accepted updates.
