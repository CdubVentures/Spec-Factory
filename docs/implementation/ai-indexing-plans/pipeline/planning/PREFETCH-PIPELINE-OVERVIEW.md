# Prefetch Pipeline Overview

Validated: 2026-03-18. Source of truth: live code under `src/features/indexing/orchestration/**`, `src/features/indexing/discovery/**`, `src/indexlab/**`, and the JSON contracts in this folder.

This folder still uses the 01-05 planning/discovery stage labels, but the live runtime is now organized around one orchestration entrypoint:

- `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js`

That entrypoint precomputes NeedSet and Schema 4 planning once, runs discovery, and then seeds the planner queues.

## Label Index

| Label | Title | What it owns now |
|------|-------|------------------|
| NeedSet | Gap Detection and Search Memory | Missing/weak/conflicting fields, field history, search exhaustion, planner seed. |
| Brand Resolver | Brand Host and Alias Resolution | Cache-first official/support domain resolution and alias hints. |
| Search Profile | Deterministic Query Envelope | Non-LLM aliases, templates, query rows, guard terms, and the planned `search_profile` artifact. |
| Search Planner | Need-Driven Schema 4 Planner | `buildSearchPlanningContext()` plus optional `buildSearchPlan()` handoff. |
| Query Journey | Query Selection and Identity Guard | Schema 4 adapter path or fallback planner path, then mandatory query guard. |
| Search Results | Provider Execution and Collection | Internal-first search, frontier cache reuse, internet providers, and plan-only fallback. |
| SERP Triage | URL Qualification and Selection | Hard drops, classification, soft labels, lane quotas, optional LLM rerank, and artifact writing. |
| Domain Classifier | Planner Queue Routing and Revalidation | Final enqueue rules inside `SourcePlanner`. |

## Name-Only Flow

```text
runDiscoverySeedPlan()
  -> NeedSet
  -> Brand Resolver
  -> Search Profile
  -> Search Planner
  -> Query Journey
  -> Search Results
  -> SERP Triage
  -> Domain Classifier
  -> Fetch + Parse handoff
```

## Live Runtime Flow

```text
runDiscoverySeedPlan()
  discoveryEnabled := true
  searchEngines := config.searchEngines || "bing,google"

  if enableSchema4SearchPlan:
    needSetOutput := computeNeedSet(...)
    searchPlanningContext := buildSearchPlanningContext(...)
    searchPlanOutput := buildSearchPlan(...)
    searchPlanHandoff := searchPlanOutput.search_plan_handoff
  else:
    searchPlanHandoff := null

discoverCandidateSources()
  brandResolution := resolveBrandDomain()
    cache first
    no brand -> skip
    no routed triage key -> cache-only behavior
    resolved official/support domains can auto-promote hosts

  schema4Plan := resolveSchema4ExecutionPlan(searchPlanHandoff)

  if schema4Plan exists and guarded query count >= 6:
    use Schema 4 rows directly
    write thin planned search_profile backed by schema4 metadata
  else:
    build deterministic Search Profile
    call fallback query planner via planUberQueries()
    merge deterministic + fallback queries
    rank rows
    enforce identity query guard
    keep at most 3 deterministic non-LLM rows
    if guard rejects everything but ranked rows exist:
      retain the top-ranked fallback query

  executeSearchQueries()
    optional internal-first corpus search
    frontier query cooldown may reuse cached SERPs
    internet providers execute remaining queries
    zero-result provider attempts may reuse frontier cache
    if no provider and no results:
      generate plan-only manufacturer URLs

  processDiscoveryResults()
    dedupe SERP rows
    apply hard drops
    classify URL candidates
    assign soft labels instead of early semantic kills
    assign lanes and compute lane quotas
    score candidates deterministically
    optionally rerank the selected set with the SERP LLM
    persist search_profile, serp_explorer, discovery payloads

  approvedUrls -> planner.enqueue(... forceApproved=true)
  candidateUrls -> planner.seedCandidates(...) when candidate fetching is enabled
```

## Cross-Cutting Rules

| Rule | Where enforced | Meaning |
|------|----------------|---------|
| Discovery is effectively always on during seed planning | `runDiscoverySeedPlan()` | The orchestration layer forces `discoveryEnabled=true`. |
| Search engines default at seed time | `runDiscoverySeedPlan()` | Empty `config.searchEngines` falls back to `"bing,google"`. |
| Brand resolution is cache-first | `resolveBrandDomain()` | No routed spend if a cached brand row already exists. |
| Schema 4 is preferred, not guaranteed | `resolveSchema4ExecutionPlan()` + `SCHEMA4_MIN_QUERIES` | The handoff only wins when at least 6 guarded queries survive. |
| Identity guard is mandatory | `enforceIdentityQueryGuard()` | Queries that no longer point at the locked product do not execute. |
| SERP triage is now lane-based | `processDiscoveryResults()` | Hard drops, soft labels, lane routing, lane quotas, and surface scoring happen before optional LLM rerank. |
| Planner seeding is a second gate | `SourcePlanner.enqueue()` | Passing SERP triage does not guarantee queue admission. |

## Label Map

| Label | Primary code path | Main outputs | Main decisions |
|------|-------------------|--------------|----------------|
| NeedSet | `computeNeedSet()`, `buildFieldHistories()` | `fields[]`, `summary`, `blockers`, `planner_seed`, `identity` | What is unresolved, weak, conflicting, exact-match-sensitive, or search-exhausted. |
| Brand Resolver | `resolveBrandDomain()` | `officialDomain`, `supportDomain`, `aliases`, `confidence` | Cache hit vs routed lookup vs empty resolution. |
| Search Profile | `buildSearchProfile()` and `searchDiscovery.js` | deterministic query inventory and planned `search_profile` | Which non-LLM query rows and guard terms exist before execution. |
| Search Planner | `buildSearchPlanningContext()`, `buildSearchPlan()` | Schema 3 context, Schema 4 handoff, planner panel, learning writeback | Which groups are active and which NeedSet-aware LLM queries survive dedupe/caps. |
| Query Journey | `resolveSchema4ExecutionPlan()`, `discoveryQueryPlan.js`, `searchDiscovery.js`, `planUberQueries()` | final `queries[]`, row maps, guard context, reject log | Schema 4 vs fallback planner path, dedupe/ranking, identity guard, deterministic budget. |
| Search Results | `executeSearchQueries()` | `rawResults[]`, `searchAttempts[]`, `searchJournal[]` | Internal-first skip, frontier reuse, provider execution, plan-only fallback. |
| SERP Triage | `processDiscoveryResults()`, `triageHardDropFilter.js`, `triageSoftLabeler.js`, `triageLaneRouter.js`, `triageSurfaceScorer.js`, `rerankSerpResults()` | `candidates[]`, `approvedUrls[]`, `candidateUrls[]`, `searchProfileFinal`, `serp_explorer` | Hard drops, classification, soft labels, lane selection, optional LLM rerank. |
| Domain Classifier | `runDiscoverySeedPlan()`, `SourcePlanner.enqueue()`, `SourcePlanner.seedCandidates()` | queue mutations and enqueue counters | Approved vs candidate routing, queue caps, host validation, brand-lock enforcement. |

## Anti-Garbage Loop

```text
buildFieldHistories()
  -> computeNeedSet()
    -> buildSearchPlanningContext()
      -> buildSearchPlan() and fallback query planning
        -> next round avoids dead domains, dead hashes, and exhausted fields
```

| Signal | Produced at | Consumed at |
|--------|-------------|-------------|
| `existing_queries` | NeedSet history | Schema 4 dedupe and fallback merge logic |
| `domains_tried` | NeedSet history | Schema 4 domain anti-garbage filtering |
| `host_classes_tried` | NeedSet history | Schema 4 diversification prompt |
| `evidence_classes_tried` | NeedSet history | Schema 4 content-type diversification prompt |
| `no_value_attempts` | NeedSet history | Schema 4 strategy shift trigger |
| `dead_query_hashes` | learning stores | Schema 4 pre-LLM filtering |
| `dead_domains` | learning stores | Schema 4 pre-LLM filtering |

## LLM Surfaces

| Label | LLM surface | Role | Gate |
|------|-------------|------|------|
| Brand Resolver | `resolveBrandDomain()` sidecar call | `triage` | brand present + routed triage key + no cache hit |
| Search Planner | `buildSearchPlan()` | `plan` | `enableSchema4SearchPlan` + routed `plan` key |
| Query Journey | `planUberQueries()` fallback planner | `plan` | Schema 4 disabled or guarded query count < 6 |
| SERP Triage | `rerankSerpResults()` | `plan` | triage enabled + deterministic quality gap + routed `plan` key |

`discoveryPlanner.js` is not on the live `searchDiscovery.js` path anymore. The fallback planner used by the current runtime is `src/research/queryPlanner.js`.

## Persisted Artifacts

| Artifact | Written by | Storage pattern | Main consumer |
|----------|------------|----------------|---------------|
| NeedSet payload | NeedSet / runtime bridge | `_discovery/needset` | GUI and planning review |
| planned `search_profile` | Search Profile or Schema 4 path | `_discovery/search-profile/*` | GUI and review surfaces |
| executed `search_profile` | SERP Triage | `_discovery/search-profile/*` | GUI and final summaries |
| `serp_explorer` | SERP Triage | embedded in `searchProfileFinal` | RuntimeOps inspection |
| discovery payload | SERP Triage | `_sources/discovery` | planner seeding and run summaries |
| candidate payload | SERP Triage | `_sources/candidates` | candidate queue seeding |
| enqueue summary | Domain Classifier | runtime log event | queue diagnostics |

## Source Code Map

| Label | Primary source files |
|-------|----------------------|
| NeedSet | `src/indexlab/needsetEngine.js`, `src/indexlab/buildFieldHistories.js` |
| Brand Resolver | `src/features/indexing/discovery/brandResolver.js`, `src/features/indexing/discovery/searchDiscovery.js` |
| Search Profile | `src/features/indexing/search/queryBuilder.js`, `src/features/indexing/discovery/searchDiscovery.js` |
| Search Planner | `src/indexlab/searchPlanningContext.js`, `src/indexlab/searchPlanBuilder.js`, `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js` |
| Query Journey | `src/features/indexing/discovery/searchPlanHandoffAdapter.js`, `src/features/indexing/discovery/discoveryQueryPlan.js`, `src/features/indexing/discovery/searchDiscovery.js`, `src/research/queryPlanner.js` |
| Search Results | `src/features/indexing/discovery/discoverySearchExecution.js` |
| SERP Triage | `src/features/indexing/discovery/discoveryResultProcessor.js`, `src/features/indexing/discovery/triageHardDropFilter.js`, `src/features/indexing/discovery/triageSoftLabeler.js`, `src/features/indexing/discovery/triageLaneRouter.js`, `src/features/indexing/discovery/triageSurfaceScorer.js`, `src/research/serpReranker.js` |
| Domain Classifier | `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js`, `src/planner/sourcePlanner.js`, `src/planner/sourcePlannerValidation.js` |

## Schema Coverage Map

| Schema file | Covered label | Notes |
|-------------|---------------|-------|
| `01-needset-input.json` | NeedSet | start-input mapping |
| `01-needset-output.json` | NeedSet | Schema 2 output |
| `01-needset-planner-context.json` | Search Planner | grouped planning context |
| `01-needset-planner-output.json` | Search Planner | Schema 4 planner output |
| `02-brand-resolver-input.json` | Brand Resolver | resolver input contract |
| `02-brand-resolver-output.json` | Brand Resolver | resolver output contract |
| `03-search-planner-input.json` | Search Planner | Search Planner input contract |
| `03-search-planner-llm-call.json` | Search Planner | Schema 4 planner LLM call |
| `03-search-planner-output.json` | Search Planner | Search Planner output contract |
| `03-search-plan-handoff-input.json` | Query Journey | Schema 4 handoff into query selection |
| `03-search-plan-handoff-output.json` | Search Results and SERP Triage | cumulative discovery artifact shape |
| `04-query-journey-input.json` | Query Journey -> Search Results -> SERP Triage | cumulative runtime inputs after the orchestration rework |
| `04-query-journey-llm-call.json` | Query Journey and SERP Triage | fallback query planner + SERP reranker |
| `04-query-journey-output.json` | Query Journey -> Search Results -> SERP Triage | cumulative runtime outputs after the orchestration rework |
| `05-searxng-execution-input.json` | Search Results | provider-facing query payload |

## Validation Status

| Check | Result |
|------|--------|
| NeedSet history, blockers, and search-exhaustion rules match live code | CONFIRMED |
| Brand Resolver cache-first and routed-key gating match live code | CONFIRMED |
| Schema 4 planning path and `SCHEMA4_MIN_QUERIES = 6` threshold match live code | CONFIRMED |
| Fallback query planning now correctly points to `planUberQueries()` instead of `discoveryPlanner.js` | CONFIRMED |
| Search execution uses `searchEngines`, internal-first search, frontier reuse, and plan-only fallback | CONFIRMED |
| SERP processing now reflects hard drops, soft labels, lane quotas, and optional LLM rerank | CONFIRMED |
| Planner queue seeding and enqueue revalidation match live code | CONFIRMED |
