# Prefetch Pipeline Overview

Validated: 2026-03-20 (NeedSet budget-aware allocation added, round-mode overrides removed, round_mode field retired).

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
Stage 01: NeedSet           - Schema 2 -> Schema 3 -> Schema 4 group annotations (no queries)
Stage 02: Brand Resolver    - brand domain, aliases, support domain, auto-promotion
Stage 03: Search Profile    - tier-aware deterministic query generation + optional host plan
Stage 04: Search Planner    - tier-aware LLM query enhancement via enhanceQueryRows
Stage 05: Query Journey     - dedupe, rank, guard, cap, write planned search_profile
Stage 06: Search Results    - internal/frontier/provider execution
Stage 07: SERP Triage       - selector path or deterministic lane-selection path
Stage 08: Domain Classifier - enqueue approved/candidate URLs to planner queue
```

Every stage runs. There is no branching between stages. Conditional behavior stays inside the stage that owns it.

## Three-Tier Search Model (V4)

The discovery search system operates on three query tiers. NeedSet's job is to rank groups by easiest/most productive, compute a budget-aware tier allocation from `searchProfileQueryCap`, and tell Search Profile "you have N slots — spend them like this." When those groups are checked off, NeedSet surfaces the next batch. Search Profile and Search Planner write the actual queries.

### Tier 1 — Broad Seeds (fire once, cooldown)
- `{brand} {model} {variant} specifications`
- `{brand} {model} {variant} {source}`
- Query completion model: 1 query = parent, up to 10 SERP URLs = children. Parent done only when child scrape work done.
- Complete when: `scrape_complete` or `exhausted` AND `new_fields_closed >= 1`
- Cooldown: `seedCooldownMs` (default 30 days) via Unix timestamp comparison
- NeedSet emits `seed_status` with per-seed `last_status`, `cooldown_until_ms`, `new_fields_closed_last_run`
- Source seeds include: category source hosts (`categoryConfig.sourceHosts`), identity official/support domains, and previously executed seed queries from frontier

### Tier 2 — Group Searches (conditional)
- `{brand} {model} {variant} {group} {description}`
- NeedSet computes `group_search_worthy` using `group_query_count` (actual Tier 2 broad searches, NOT sum of key retries)
- Skip reasons: `group_mostly_resolved` (coverage >= 80%), `too_few_missing_keys` (< 3 unresolved), `group_search_exhausted` (>= 3 broad searches), `group_on_hold`
- Two-level fingerprint: `group_fingerprint_coarse` (stable = group_key) for broad suppression, `group_fingerprint_fine` (group_key + sorted keys) for "meaningfully different?"

### Tier 3 — Individual Key Searches (progressive enrichment per-key)
- Enriched based on per-key `repeat_count` (not round number):
  - 3a (repeat=0): `{brand} {model} {variant} {key}` — bare
  - 3b (repeat=1): `+ aliases` — cumulative from here forward
  - 3c (repeat=2): `+ untried domain hint`
  - 3d (repeat=3+): `+ untried content type`
- `repeat_count` tracked via `query_count` in `previousFieldHistories`, incremented by `buildFieldHistories()` at finalization
- NeedSet emits enriched `normalized_key_queue` objects with per-key: `normalized_key`, `repeat_count`, `all_aliases`, `domain_hints`, `preferred_content_types`, `domains_tried_for_key`, `content_types_tried_for_key`
- Queue sorted by: availability → difficulty → repeat → need_score → required_level

### Query Execution History
Structured per-query tracking with `tier`, `group_key`, `normalized_key`, `hint_source` persisted by `frontierDb.recordQuery()` at fire-time via `resolveSelectedQueryRow()` in `discoverySearchExecution.js`. `runDiscoverySeedPlan` calls `frontierDb.buildQueryExecutionHistory(productId)` before NeedSet and passes the result through `runNeedSet` to `buildSearchPlanningContext`.

### Field History Feedback Loop
`runUntilComplete.js` extracts `previousFieldHistories` from `roundResult.needSet.fields[].history` via `buildPreviousFieldHistories()` after each round completes. This is passed in `roundContext` to the next round's `computeNeedSet()`, enabling `repeat_count` accumulation, `domains_tried_for_key` tracking, and progressive Tier 3 enrichment.

## Canonical runtime order

`runDiscoverySeedPlan()`:
1. Load enabled source entries and normalize planning hints.
2. Force `discoveryEnabled=true` and default empty `searchEngines` to `bing,google`.
3. Stage 01 NeedSet:
   - `computeNeedSet()` builds Schema 2.
   - `buildSearchPlanningContext()` builds Schema 3 (includes `seed_status`, `focus_groups` with V4 tier signals, budget-aware `tier_allocation`, expanded `pass_seed`). Receives `queryExecutionHistory` for round-over-round awareness.
   - `buildSearchPlan()` builds Schema 4 — LLM assesses groups (`reason_active`, `planner_confidence`) but does NOT generate queries. `search_plan_handoff.queries` is always empty.
   - `runNeedSet()` emits `needset_computed` twice when Schema 4 succeeds:
     - `scope: schema2_preview` before the Schema 4 LLM call
     - `scope: schema4_planner` after panel is assembled. Panel `profile_influence` shows budget-aware targeting: `targeted_specification`, `targeted_sources`, `targeted_groups`, `targeted_single` (allocation-based), plus `budget`, `allocated`, `overflow_groups`, `overflow_keys`.
4. Stage 02 Brand Resolver:
   - `runBrandResolver()` resolves brand domains after NeedSet so the NeedSet worker appears first in the GUI.
   - manufacturer auto-promotion happens here when enabled.
5. Stage 03 Search Profile:
   - `runSearchProfile()` receives `seedStatus` and `focusGroups` from NeedSet.
   - `buildSearchProfile()` calls `determineQueryModes()` to decide which tiers fire, then runs `buildTier1Queries`, `buildTier2Queries`, `buildTier3Queries` as appropriate. Fully deterministic, no LLM.
   - optional `buildEffectiveHostPlan()` and `buildScoredQueryRowsFromHostPlan()` run here.
6. Stage 04 Search Planner:
   - `enhanceQueryRows()` receives tier-tagged `query_rows` from Search Profile + query history.
   - LLM enhances query strings while preserving tier metadata (tier, group_key, normalized_key, target_fields are passthrough).
   - Fallback: no API key, no model, or LLM fails twice → returns rows unchanged as `deterministic_fallback`.
   - `search_plan_generated` emitted when LLM succeeds.
7. Stage 05 Query Journey:
   - receives enhanced rows from Search Planner (LLM-enhanced or deterministic fallback — treated identically).
   - dedupe, rank by field priority, cap to `searchProfileQueryCap`, identity guard.
   - append separately guarded host-plan rows.
   - write planned `search_profile`.
   - emit `query_journey_completed`.
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
| 01 NeedSet | needset | `needset_search_planner` | `plan` | `src/indexlab/searchPlanBuilder.js` (group annotations only, no queries) |
| 02 Brand Resolver | brand_resolver | `brand_resolution` | `triage` | `src/features/indexing/discovery/discoveryLlmAdapters.js` |
| 04 Search Planner | search_planner | `search_planner_enhance` | `plan` | `src/research/queryPlanner.js` (`enhanceQueryRows`) |
| 07 SERP Triage | serp_triage | `serp_url_selector` | `triage` | `src/features/indexing/discovery/serpSelectorLlmAdapter.js` |
| 07 SERP Triage | serp_triage | `uber_serp_reranker` | `plan` | `src/research/serpReranker.js` |

`serp_triage` is a shared GUI tab/call-type bucket. In the live code, Stage 07 may use the selector, the reranker, neither, but never both at the same time on the same branch.

## Query Journey merge

Two input streams:

1. **Enhanced rows** from Search Planner — same rows as `searchProfileBase.query_rows` but with potentially LLM-rewritten `query` strings. If LLM failed, these are exact copies of the deterministic rows. Tagged with `tier: 'seed' | 'group_search' | 'key_search'` and `hint_source` ending in `_llm` when LLM-enhanced.
2. **Host-plan rows** — appended after guard, separately identity-guarded.

Then:

- `dedupeQueryRows()`
- `prioritizeQueryRows()`
- cap to `searchProfileQueryCap`
- `enforceIdentityQueryGuard()`
- separately guard host-plan rows and append unique survivors
- write planned `search_profile`
- emit `query_journey_completed`

`searchProfilePlanned.llm_queries` contains only query texts from rows where `hint_source` ends with `_llm`. Empty when LLM failed.

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
- `src/research/queryPlanner.js` (`enhanceQueryRows`)

Query Journey:
- `src/features/indexing/discovery/stages/queryJourney.js`
- `src/features/indexing/discovery/discoveryQueryPlan.js`

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
- `runDiscoverySeedPlan()` attaches `seed_search_plan_output` to the discovery result so finalization can reuse the Schema 4 output without re-calling the NeedSet planner LLM. Note: Schema 4 no longer contains queries, only group annotations and tier metadata.

## Conditional behavior

- Brand resolution short-circuits on empty brand, cache hit, missing route key, or resolver error.
- NeedSet preview `needset_computed` emits before the Schema 4 LLM call; the Schema 4 `needset_computed` event is conditional on `schema4.panel`. Panel bundles do not carry queries. `profile_influence` shows budget-aware targeting counts (allocation-based when `tier_allocation` is present, aspirational fallback otherwise).
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
