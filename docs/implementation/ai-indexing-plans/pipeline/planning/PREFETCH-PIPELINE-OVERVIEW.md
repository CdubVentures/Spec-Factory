# Prefetch Pipeline Overview (NeedSet -> Domain Classifier)

Validated: 2026-03-17. Source of truth: live source code + runtime trace artifacts.

This file sits inside the preserved `docs/implementation/` subtree. Treat live source as authoritative if this document and current runtime behavior ever disagree.

This overview is organized around the eight logical discovery phases requested here:

1. NeedSet
2. Brand Resolver
3. Search Profile
4. Search Planner
5. Query Journey
6. Search Results
7. SERP Triage
8. Domain Classifier

Important runtime ordering note: the Schema 4 Search Planner is computed early inside `runDiscoverySeedPlan()` before `searchDiscovery()` enters Brand Resolver and the legacy Search Profile branch. It is documented here as Phase 04 because Query Journey consumes it as the preferred plan input.

---

## Pipeline Topology

```text
Runtime Start
  |
  v
[01] NeedSet
  |
  v
[02] Brand Resolver
  |
  v
[03] Search Profile
  |
  v
[04] Search Planner
  |
  v
[05] Query Journey
  |
  v
[06] Search Results
  |
  v
[07] SERP Triage
  |
  v
[08] Domain Classifier
  |
  v
Fetch + Parse handoff
```

Branching reality inside the runtime:

```text
NeedSet
  -> Search Planner (Schema 3 -> Schema 4 precompute)
  -> searchDiscovery()
       -> Brand Resolver
       -> Search Profile
       -> Query Journey chooses:
            preferred: Schema 4 handoff
            fallback: legacy search-profile planner chain
```

---

## Detailed Logic Box

```text
runDiscoverySeedPlan()
  discoveryEnabled := true
  searchProvider := config.searchProvider unless it is "none", then "dual"

  if enableSchema4SearchPlan:
    schema2 := computeNeedSet(...)
    schema3 := buildSearchPlanningContext(schema2, config, fieldGroups, previousRoundFields)
    schema4 := buildSearchPlan(schema3, config, llmContext)
    searchPlanHandoff := schema4.search_plan_handoff
  else:
    searchPlanHandoff := null

searchDiscovery()
  brandResolution := resolveBrandDomain()
    rules:
      no brand -> skip
      cache hit -> return cached domains and aliases immediately
      no routed API key -> cache-only, otherwise empty result
      LLM result -> normalize lowercase domains and aliases, store cache row

  if manufacturerAutoPromote and officialDomain exists:
    promote official/support domains into sourceHostMap as manufacturer hosts

  schema4Plan := resolveSchema4ExecutionPlan(searchPlanHandoff)
    adapter := convertHandoffToExecutionPlan()
    guard := enforceIdentityQueryGuard()

  if schema4Plan exists and guarded query count >= 6:
    use Schema 4 path
    searchProfilePlanned := minimal planned profile backed by schema4 metadata
  else:
    use legacy path
    searchProfileBase := buildSearchProfile(...)
    llmQueries := planDiscoveryQueriesLLM(...)
    uberSearchPlan := planUberQueries(...)
    mergedQueries := dedupeQueryRows(base + targeted + llm + uber)
    rankedQueries := prioritizeQueryRows(mergedQueries)
    guardedQueries := enforceIdentityQueryGuard(rankedQueries)
    apply deterministic budget = 3 non-LLM rows
    if all guarded rows rejected but ranked rows exist:
      retain top ranked row as fallback

  searchResults := executeSearchQueries(...)
    if discoveryInternalFirst:
      search internal corpus first
      if required coverage satisfied and internal URL count >= discoveryInternalMinResults:
        skip external search
    for remaining queries:
      frontier query cache can short-circuit cooled-down queries
      else run search provider(s)
      if internet returns zero results:
        reuse frontier cached results if available
    if no internet provider and no raw results:
      generate plan-only manufacturer URLs

  discoveryResult := processDiscoveryResults(...)
    dedupe by canonical URL
    reject non-https, denied hosts, URL cooldown hits, brand-mismatched manufacturer hosts, low relevance
    classify domain safety deterministically
    apply admission gate
    deterministic rerank always runs
    optional LLM rerank only runs when deterministic quality is insufficient
    select top discovered URLs
    split into approvedUrls vs candidateUrls
    persist searchProfileFinal + serp_explorer + discovery payloads

  for approvedUrls:
    planner.enqueue(url, "discovery_approved", forceApproved=true)

  if fetchCandidateSources and maxCandidateUrls > 0:
    planner.seedCandidates(candidateUrls)

SourcePlanner.enqueue()
  revalidate protocol, dedupe, denylist, low-value hosts, URL quality gate, manufacturer brand locks, caps
  route approved URLs to priority/manufacturer/main queues
  route non-approved URLs to candidateQueue
```

---

## Cross-Phase Rules And Decisions

| Rule | Where enforced | Effect |
|------|----------------|--------|
| Discovery is effectively always on during seed planning | `runDiscoverySeedPlan()` | The seed phase forces `discoveryEnabled=true`; `searchProvider='none'` is normalized to `dual` for discovery. |
| Brand resolution is cache-first | `resolveBrandDomain()` | Cached brand-domain rows bypass the LLM completely. |
| Schema 4 is preferred, not unconditional | `resolveSchema4ExecutionPlan()` + `SCHEMA4_MIN_QUERIES` | The Schema 4 handoff only stays active when at least 6 identity-guarded queries survive. |
| Identity guard is mandatory for both planner paths | `enforceIdentityQueryGuard()` | Queries missing brand/model identity or carrying foreign model tokens are rejected before execution. |
| Search Profile is both an artifact and a fallback planning branch | `searchDiscovery.js` + `queryBuilder.js` | Schema 4 path writes a thinner planned profile; legacy path builds a richer deterministic profile first. |
| Search-first still reuses cached frontier knowledge | `executeSearchQueries()` | Query cooldown hits reuse cached SERPs; zero-result internet searches can also reuse frontier results. |
| SERP domain safety is deterministic | `processDiscoveryResults()` | No LLM domain classifier exists here; host allow/deny/tier heuristics decide safety. |
| LLM SERP triage is conditional | `processDiscoveryResults()` | The reranker is skipped when deterministic quality already clears the configured bar. |
| Planner seeding revalidates selected URLs | `SourcePlanner.enqueue()` | URLs that passed SERP triage can still be rejected for protocol, brand restriction, low-value host, or queue-cap reasons. |

---

## Phase Map

| Phase | Primary code path | Main outputs | Primary decisions |
|------|-------------------|--------------|-------------------|
| 01 NeedSet | `computeNeedSet()`, `buildFieldHistories()` | `fields[]`, `summary`, `blockers`, `planner_seed`, `identity` | What is still missing, weak, conflicting, exact-match-sensitive, or search-exhausted |
| 02 Brand Resolver | `resolveBrandDomain()` | `officialDomain`, `supportDomain`, `aliases`, `confidence` | Cache hit vs LLM lookup vs empty resolution |
| 03 Search Profile | `buildSearchProfile()` and planned profile assembly in `searchDiscovery.js` | `base_templates`, `query_rows`, `variant_guard_terms`, planned `search_profile` | Which deterministic query inventory and profile hints exist before execution |
| 04 Search Planner | `buildSearchPlanningContext()`, `buildSearchPlan()` | Schema 3 context, Schema 4 handoff, planner panel, learning writeback | Which focus groups are active and which LLM queries survive anti-garbage filtering |
| 05 Query Journey | `resolveSchema4ExecutionPlan()`, legacy planner chain in `searchDiscovery.js` | final `queries[]`, `selectedQueryRowMap`, `query_guard`, `query_reject_log` | Schema 4 vs legacy branch, dedupe/ranking, identity guard, deterministic budget |
| 06 Search Results | `executeSearchQueries()` | `rawResults[]`, `searchAttempts[]`, `searchJournal[]` | Internal-first skip, frontier cache reuse, internet provider execution, plan-only fallback |
| 07 SERP Triage | `processDiscoveryResults()` | `candidates[]`, `approvedUrls[]`, `candidateUrls[]`, `searchProfileFinal`, `serp_explorer` | URL rejection, domain safety, admission, deterministic rerank, optional LLM rerank |
| 08 Domain Classifier | `runDiscoverySeedPlan()`, `SourcePlanner.enqueue()`, `SourcePlanner.seedCandidates()` | planner queues and enqueue counters | Approved vs candidate routing, queue selection, queue caps, final host/URL revalidation |

---

## Phase-By-Phase Summary

### 01 - NeedSet

| Aspect | Summary |
|--------|---------|
| Producer | `src/indexlab/needsetEngine.js`, `src/indexlab/buildFieldHistories.js` |
| Purpose | Normalize run identity, field rules, provenance, and previous-round memory into Schema 2. |
| Inputs | `runId`, category/product identity, `fieldOrder`, `fieldRules`, `provenance`, `fieldReasoning`, `constraintAnalysis`, `identityContext`, `previousFieldHistories`, round metadata |
| Outputs | `identity`, `fields[]`, `summary`, `blockers`, `planner_seed`, plus backward-compatible `rows`, `bundles`, `profile_mix`, `focus_fields` |
| Core logic | Each field is classified into accepted, weak, conflict, or missing; unresolved fields get `need_score`, reasons, and search hints. |
| Key rules | `search_exhausted` only increments when an unresolved field has `no_value_attempts >= 3` and at least 3 evidence classes. Exact-match contracts increment `needs_exact_match`. Historical queries/domains/evidence classes are unioned forward so later rounds have anti-garbage memory. |

### 02 - Brand Resolver

| Aspect | Summary |
|--------|---------|
| Producer | `src/features/indexing/discovery/brandResolver.js` |
| Purpose | Resolve brand-level official/support domains and aliases that can bias search and host approval. |
| Inputs | `brand`, `category`, `config`, routed LLM call adapter, storage cache |
| Outputs | `officialDomain`, `supportDomain`, `aliases`, `confidence`, `reasoning` |
| Core logic | Cache lookup runs first; if there is no cache hit and a routed LLM is available, the LLM produces normalized domains/aliases and the cache is updated. |
| Key rules | No brand means full skip. No routed API key means cache-only behavior. Returned domains and aliases are trimmed and lowercased. `manufacturerAutoPromote` can push the resolved domains into `sourceHostMap` as tier-1 manufacturer sources. |

### 03 - Search Profile

| Aspect | Summary |
|--------|---------|
| Producer | `src/features/indexing/search/queryBuilder.js` and planned profile assembly in `src/features/indexing/discovery/searchDiscovery.js` |
| Purpose | Build the deterministic query/profile envelope that discovery persists and the legacy planner branch can refine. |
| Inputs | job identity, category search templates, missing fields, lexicon, learned queries, brand resolution, per-profile caps |
| Outputs | `variant_guard_terms`, `identity_aliases`, `base_templates`, `query_rows`, `queries`, `targeted_queries`, `field_target_queries`, `doc_hint_queries`, `archetype_summary`, `coverage_analysis`, planned `search_profile` artifact |
| Core logic | The profile builder creates deterministic aliases, variant guard terms, base templates, and targeted query rows, then bounds the result to a configured cap and writes reject reasons for duplicate/empty/capped rows. |
| Key rules | If base templates are empty but brand and model exist, fallback specification and datasheet templates are synthesized. On the Schema 4 path, the persisted planned profile is thinner but still carries `query_guard`, `brand_resolution`, and Schema 4 planner metadata. |

### 04 - Search Planner

| Aspect | Summary |
|--------|---------|
| Producer | `src/indexlab/searchPlanningContext.js`, `src/indexlab/searchPlanBuilder.js` |
| Purpose | Convert Schema 2 NeedSet into grouped planning context and, when enabled, a Schema 4 LLM handoff. |
| Inputs | Schema 2 output, runtime config, field groups, prior round field state, learning dead-domain/dead-query hints |
| Outputs | Schema 3 `focus_groups`, `group_catalog`, `planner_limits`, `field_priority_map`; Schema 4 `search_plan_handoff`, `panel`, `learning_writeback`, planner metadata |
| Core logic | Groups are classified into `now`, `next`, or `hold` based on unresolved priority and search exhaustion. Only `now` and `next` groups are sent to the planner LLM. |
| Key rules | Dead domains and dead query hashes are filtered before the LLM call. Per-group output is capped at 3 queries and global output is capped by `discoveryMaxQueries`. If no routed `plan` model key exists, the planner returns a disabled result instead of throwing. Post-LLM dedupe suppresses any query whose hash already exists in `needset.existing_queries`. |

### 05 - Query Journey

| Aspect | Summary |
|--------|---------|
| Producer | `src/features/indexing/discovery/searchPlanHandoffAdapter.js`, `src/features/indexing/discovery/searchDiscovery.js`, `src/features/indexing/discovery/discoveryQueryPlan.js`, `src/features/indexing/discovery/discoveryPlanner.js`, `src/research/queryPlanner.js` |
| Purpose | Choose the actual execution queries from the preferred Schema 4 path or the legacy fallback chain. |
| Inputs | Schema 4 handoff, legacy Search Profile artifact, brand/model identity, host plan hints, query caps |
| Outputs | `queries[]`, `selectedQueryRowMap`, `query_rows`, `query_guard`, `query_reject_log`, `searchProfilePlanned` |
| Core logic | Schema 4 queries are adapted and identity-guarded first. If at least 6 survive, that plan wins. Otherwise the runtime falls back to base templates + targeted profile rows + legacy LLM planner + uber planner, then dedupes, ranks, and guards the merged set. |
| Key rules | The identity guard rejects queries missing brand tokens, missing required digit groups, missing model tokens, or carrying foreign model-like tokens. The legacy branch enforces a deterministic non-LLM row budget of 3. If the guard rejects everything but ranked rows exist, the top ranked row is retained as a fallback to avoid an empty execution set. |

### 06 - Search Results

| Aspect | Summary |
|--------|---------|
| Producer | `src/features/indexing/discovery/discoverySearchExecution.js` |
| Purpose | Run the selected query set across internal corpus, frontier cache, internet providers, or plan-only manufacturer paths. |
| Inputs | query list, provider state, category config, search caps, frontier DB, internal corpus, runtime trace writer |
| Outputs | `rawResults[]`, `searchAttempts[]`, `searchJournal[]`, `internalSatisfied`, `externalSearchReason` |
| Core logic | The executor can run internal corpus lookup first, reuse cooled-down frontier query results, call internet search providers concurrently, and fall back to plan-only manufacturer URLs when there is no provider. |
| Key rules | `discoveryInternalFirst` gates the internal-first branch. External search is skipped only when required coverage is satisfied and internal results meet `discoveryInternalMinResults`. Internet zero-result queries can reuse frontier cache rows. If there is no internet provider and no raw results, `buildPlanOnlyResults()` generates manufacturer-only path guesses. |

### 07 - SERP Triage

| Aspect | Summary |
|--------|---------|
| Producer | `src/features/indexing/discovery/discoveryResultProcessor.js`, `src/features/indexing/search/resultReranker.js`, `src/research/serpReranker.js` |
| Purpose | Convert raw search results into selected discovery URLs and the final executed search profile. |
| Inputs | `rawResults`, query metadata, identity lock, brand resolution, missing fields, learning yield, provider state |
| Outputs | `candidates[]`, `approvedUrls[]`, `candidateUrls[]`, `searchProfileFinal`, `serp_explorer`, `_discovery` payload, candidate payload |
| Core logic | Results are deduped by canonical URL, classified, filtered through admission gates, reranked deterministically, optionally reranked by the SERP LLM, and then truncated to the discovery cap. |
| Key rules | Hard rejects include non-HTTPS URLs, denied hosts, URL cooldown hits, manufacturer brand mismatches, and low relevance. Domain safety is deterministic only: blocked/safe/caution is derived from allow/deny/tier heuristics. The LLM reranker only activates when `serpTriageEnabled` is on and deterministic high-quality rows are below `ceil(serpTriageMaxUrls * 0.6)`. |

### 08 - Domain Classifier

| Aspect | Summary |
|--------|---------|
| Producer | `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js`, `src/planner/sourcePlanner.js`, `src/planner/sourcePlannerValidation.js` |
| Purpose | Take triaged discovery URLs and route them into the planner queues that drive fetch/parsing. |
| Inputs | `approvedUrls`, `candidateUrls`, planner settings, source registry, identity lock, queue counters |
| Outputs | `priorityQueue`, `manufacturerQueue`, `queue`, `candidateQueue`, enqueue counters |
| Core logic | Approved URLs are force-enqueued into approved queues; candidate URLs are only seeded when candidate fetching is enabled. Every URL is revalidated by `SourcePlanner.enqueue()` before it is accepted. |
| Key rules | Enqueue rejects empty/invalid URLs, bad protocols, duplicates, denied or blocked hosts, low-value hosts, URL quality-gate failures, manufacturer brand mismatches, locked manufacturer slugs, locale duplicates, and domain/global caps. Approved manufacturer URLs can frontload into `priorityQueue` or `manufacturerQueue`; other approved URLs go to `queue`; non-approved URLs go to `candidateQueue`. |

---

## Cumulative Data Growth

This eight-phase view splits old Stage 03 and Stage 04 into more operator-friendly buckets, so the counts overlap more than the older stage-based arithmetic. The important invariant is that downstream phases add artifacts and decisions without dropping the upstream context they still need.

```text
Phase 01 NeedSet:        ~65 keys   (identity, fields, summaries, blockers, planner seed)
Phase 02 Brand Resolver:  +5 keys   (official/support domains, aliases, confidence, reasoning)
Phase 03 Search Profile: +15 keys   (aliases, templates, query rows, guard hints, coverage views)
Phase 04 Search Planner: +25 keys   (focus groups, planner limits, schema4 handoff, panel)
Phase 05 Query Journey:  +10 keys   (selected queries, guard context, reject log, planned profile)
Phase 06 Search Results:  +5 keys   (rawResults, attempts, journal, internal/external reason)
Phase 07 SERP Triage:    +20 keys   (classification, safety, rerank output, explorer, final profile)
Phase 08 Domain Classifier:
                           +4 keys   (approved/candidate routing, planner queues, enqueue counters)
                          ------
Logical total:          140+ keys/artifacts before fetch begins
```

The fetch handoff still lands in the same overall runtime neighborhood as the older stage view: roughly `170+` cumulative keys/artifacts once the queue and fetch context are included.

---

## Anti-Garbage Intelligence Loop

The anti-garbage loop is still one of the most important cross-phase behaviors in prefetch.

```text
buildFieldHistories (prior rounds and current evidence)
  -> NeedSet field history
    -> Search Planner focus-group unions
      -> Schema 4 LLM payload and legacy planner context
        -> duplicate/dead query suppression
          -> next round avoids stale domains, stale query families, and exhausted fields
```

| Signal | Created at | Aggregated at | Consumed at |
|--------|------------|---------------|-------------|
| `existing_queries` | NeedSet history | Search Planner focus groups | Schema 4 dedupe and legacy planner merge |
| `domains_tried` | NeedSet history | Search Planner focus groups | Schema 4 domain anti-garbage filter |
| `host_classes_tried` | NeedSet history | Search Planner focus groups | Schema 4 diversification prompt |
| `evidence_classes_tried` | NeedSet history | Search Planner focus groups | Schema 4 content-type diversification prompt |
| `no_value_attempts` | NeedSet history | Search Planner focus groups | Schema 4 strategy-shift trigger |
| `dead_query_hashes` | external learning store | Search Planner `learning` block | pre-LLM query suppression |
| `dead_domains` | external learning store | Search Planner `learning` block | pre-LLM domain suppression |

---

## LLM Calls (Current Discovery Surfaces)

Prefetch LLM work is front-loaded, but it is not a strict one-call-only system anymore. The Schema 4 planner is single-call; the legacy fallback planner can issue multiple passes when Schema 4 is disabled or underfilled.

| LLM Call | Role | Phase | Gate |
|----------|------|-------|------|
| Brand Resolver | compatibility label `triage` routed over the plan stack | 02 | brand present + routed triage key + no cache hit |
| NeedSet Search Planner | `plan` | 04 | `enableSchema4SearchPlan` + routed `plan` key |
| Legacy Discovery Planner | `plan` | 05 fallback path | Schema 4 disabled or guarded query count < 6 |
| Uber Query Planner | `plan` | 05 fallback path | `uberMode` path in legacy branch |
| SERP Reranker | `plan` | 07 | `serpTriageEnabled` + deterministic quality gap + (`uberMode` or `llmSerpRerankEnabled`) + routed `plan` key |

---

## Persisted Artifacts

| Artifact | Written at | Storage key pattern | Consumer |
|----------|------------|--------------------|----------|
| needset | 01 | `_discovery/needset` | planner context, GUI panel |
| brand resolution telemetry | 02 | runtime log event | search profile hints, manufacturer auto-promotion |
| planned `search_profile` | 03/05 | `_discovery/search-profile/*` | GUI panel, runtime review, final search profile merge |
| executed `search_profile` | 07 | `_discovery/search-profile/*` | GUI panel, finalization summary |
| `serp_explorer` | 07 | embedded in `searchProfileFinal` | GUI RuntimeOps panel |
| discovery payload | 07 | `_sources/discovery` | planner seeding, finalization summary |
| candidate payload | 07 | `_sources/candidates` | planner candidate seeding |
| enqueue summary | 08 | runtime log event | queue diagnostics |

---

## Source Code Map

| Phase | Primary source file(s) |
|------|-------------------------|
| 01 NeedSet | `src/indexlab/needsetEngine.js`, `src/indexlab/buildFieldHistories.js` |
| 02 Brand Resolver | `src/features/indexing/discovery/brandResolver.js`, `src/features/indexing/discovery/searchDiscovery.js` |
| 03 Search Profile | `src/features/indexing/search/queryBuilder.js`, `src/features/indexing/discovery/searchDiscovery.js` |
| 04 Search Planner | `src/indexlab/searchPlanningContext.js`, `src/indexlab/searchPlanBuilder.js`, `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js` |
| 05 Query Journey | `src/features/indexing/discovery/searchPlanHandoffAdapter.js`, `src/features/indexing/discovery/discoveryQueryPlan.js`, `src/features/indexing/discovery/searchDiscovery.js`, `src/features/indexing/discovery/discoveryPlanner.js`, `src/research/queryPlanner.js` |
| 06 Search Results | `src/features/indexing/discovery/discoverySearchExecution.js` |
| 07 SERP Triage | `src/features/indexing/discovery/discoveryResultProcessor.js`, `src/features/indexing/search/resultReranker.js`, `src/research/serpReranker.js` |
| 08 Domain Classifier | `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js`, `src/planner/sourcePlanner.js`, `src/planner/sourcePlannerValidation.js` |

---

## Schema File Index

This folder's JSON schema packets currently cover the NeedSet, Brand Resolver, Search Planner, Query Journey, and Search Results boundaries. SERP Triage and Domain Classifier are represented by runtime artifacts and planner queue state rather than dedicated JSON packet files in this directory.

| File | Logical phase | Content |
|------|---------------|---------|
| `01-needset-input.json` | 01 | NeedSet start input mapping |
| `01-needset-output.json` | 01 | Schema 2 NeedSet output |
| `01-needset-planner-context.json` | 04 | Schema 3 Search Planning Context |
| `01-needset-planner-output.json` | 04 | Schema 4 planner output |
| `02-brand-resolver-input.json` | 02 | Brand resolver input contract |
| `02-brand-resolver-output.json` | 02 | Brand resolver output contract |
| `03-search-planner-input.json` | 04 | Search planner input contract |
| `03-search-planner-llm-call.json` | 04 | Search planner prompt/payload/response contract |
| `03-search-planner-output.json` | 04 | Search planner output contract |
| `03-search-plan-handoff-input.json` | 05 | Schema 4 handoff into Query Journey |
| `03-search-plan-handoff-output.json` | 07 | cumulative post-search output contract |
| `04-query-journey-input.json` | 05 | adapter/guard/execution/rerank input contract |
| `04-query-journey-llm-call.json` | 07 | SERP reranker LLM contract |
| `04-query-journey-output.json` | 07 | Query Journey and SERP Triage output shapes |
| `05-searxng-execution-input.json` | 06 | Final query payload reaching search providers |

---

## Naming Conventions

| Asset type | Convention | Example |
|------------|------------|---------|
| Schema file | `{stage}-{descriptor}.json` | `01-needset-output.json` |
| Overview doc | `SCREAMING-KEBAB.md` | `PREFETCH-PIPELINE-OVERVIEW.md` |

---

## Validation Status

| Check | Result |
|------|--------|
| NeedSet fields, blockers, planner seed, and search-exhaustion rules match live code | CONFIRMED |
| Brand Resolver cache-first and routed-key gating match live code | CONFIRMED |
| Search Profile dual role (artifact + fallback planner branch) matches live code | CONFIRMED |
| Schema 4 planning path and `SCHEMA4_MIN_QUERIES = 6` threshold match live code | CONFIRMED |
| Query Journey identity guard rules match live code | CONFIRMED |
| Search Results internal-first, frontier-cache reuse, and plan-only fallback match live code | CONFIRMED |
| SERP Triage deterministic safety + conditional LLM rerank match live code | CONFIRMED |
| Domain Classifier queue revalidation and approved/candidate routing match live code | CONFIRMED |
| All schema JSON files in this folder still align with the covered code boundaries | CONFIRMED |
