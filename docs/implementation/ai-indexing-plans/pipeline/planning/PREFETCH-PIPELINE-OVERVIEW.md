# Prefetch Pipeline Overview (Stages 01-08)

Validated: 2026-03-17. Source of truth: live source code + runtime trace artifacts.

The prefetch pipeline transforms a product identity into a set of fetched, classified, triaged URLs ready for extraction. Each stage adds data keys to a cumulative payload that grows as it propagates downstream.

---

## Pipeline Topology

```
Runtime Start
  |
  v
[01] NeedSet Engine -----> Schema 2 (NeedSetOutput)
  |                           |
  |  +-- fields[].history     |
  |  +-- summary/blockers     |
  |  +-- planner_seed         |
  |                           v
[02] Brand Resolver -----> Brand Resolution (sidecar, parallel)
  |                           |
  |  +-- officialDomain       |
  |  +-- supportDomain        |
  |  +-- aliases              |
  |  +-- confidence           |
  |                           v
[03] Search Planning Context -> Schema 3 (SearchPlanningContext)
  |   + Search Plan Builder      |
  |                              |
  |  +-- focus_groups[]          |
  |  +-- group_catalog           |
  |  +-- planner_limits          |
  |  +-- learning (anti-garbage) |
  |                              v
  +-------- Search Plan Builder -> Schema 4 (NeedSetPlannerOutput)
                                 |
                                 v
[04] Query Journey ---------> search_plan_handoff + panel + learning_writeback
  |   (consumes Schema 4)        |
  |                              |
  |  +-- handoff adapter         |
  |  +-- identity guard          |
  |  +-- execution routing       |
  |  +-- classification/triage   |
  |                              v
[05] Query Execution -------> rawResults[] + searchAttempts[] + searchJournal[]
  |                              |
  |  +-- provider routing        |
  |  +-- frontier cache          |
  |  +-- internal corpus         |
  |                              v
[06] SERP Triage -----------> candidates[] + approvedUrls[] + candidateUrls[]
  |                              |
  |  +-- URL classification      |
  |  +-- domain safety           |
  |  +-- deterministic rerank    |
  |  +-- conditional LLM rerank  |
  |  +-- serp_explorer artifact  |
  |  +-- searchProfileFinal      |
  |                              v
[07] Domain Classifier -----> Seeded planner queues
  |                              |
  |  +-- planner.enqueue()       |
  |  +-- planner.seedCandidates()|
  |  +-- queue routing           |
  |                              v
[08] Fetch + Parse ---------> sourceFetch payloads --> Stage 09 (Extraction)
     |
     +-- preflight gates
     +-- mode-aware fetcher
     +-- host concurrency
     +-- retry/repair
```

---

## Stage-by-Stage Contract

### 01 — Start to NeedSet

**Producer:** `needsetEngine.computeNeedSet()`
**Input:** Runtime product context (run_id, category, product_id, brand, model, fieldRules, provenance, round, roundMode)
**Output:** Schema 2 (NeedSetOutput)
**Schemas:** `01-needset-input.json`, `01-needset-output.json`, `01-needset-planner-context.json`, `01-needset-planner-output.json`

| Key Group | Keys Added | Transform |
|-----------|-----------|-----------|
| **run** | run_id, category, product_id, brand, model, base_model, aliases, round, round_mode | passthrough |
| **identity** | state, source_label_state, confidence, manufacturer, model, official_domain, support_domain | recomputed from identityContext |
| **fields[]** | field_key, label, group_key, idx.{required_level, min_evidence_refs, query_terms, domain_hints, preferred_content_types, tooltip_md, aliases}, pass_target, exact_match_required | normalized from fieldRules |
| **fields[].current** | status, value, confidence, effective_confidence, refs_found, best_tier_seen, meets_pass_target, reasons | recomputed from provenance |
| **fields[].history** | existing_queries, domains_tried, host_classes_tried, evidence_classes_tried, query_count, urls_examined_count, no_value_attempts, duplicate_attempts_suppressed | enriched by buildFieldHistories |
| **summary** | total, resolved, core_total, core_unresolved, secondary_total, secondary_unresolved, optional_total, optional_unresolved, conflicts | recomputed aggregation |
| **blockers** | missing, weak, conflict, needs_exact_match, search_exhausted | recomputed aggregation |
| **planner_seed** | missing_critical_fields[], unresolved_fields[], existing_queries[], current_product_identity | recomputed from fields[] |

---

### 02 — NeedSet + Brand to Profile

**Producer:** `brandResolver.resolveBrandDomain()`
**Input:** brand (from identity lock), category, config, callLlmFn (role=triage), storage
**Output:** Brand Resolution (sidecar payload)
**Schemas:** `02-brand-resolver-input.json`, `02-brand-resolver-output.json`

| Key | Transform | Notes |
|-----|-----------|-------|
| officialDomain | enriched (cache OR LLM) | normalized: lowercase, trimmed |
| supportDomain | enriched (cache OR LLM) | normalized: lowercase, trimmed |
| aliases | enriched (cache OR LLM) | normalized: lowercase, trimmed, filtered empty |
| confidence | enriched | 0.8 hardcoded for LLM, cached value for cache |
| reasoning | enriched | from LLM OR empty array on cache hit |

**Gating:** No brand -> skip. No triage API key -> cache-only. Cache hit -> return immediately.

**Downstream effect:** officialDomain + supportDomain promoted to tier 1 in sourceHostMap (manufacturer_auto_promote). aliases + officialDomain used as search_profile_hints.

---

### 03 — Profile to Planner

**Producer:** `buildSearchPlanningContext()` -> `buildSearchPlan()`
**Input:** Schema 2 NeedSetOutput + Brand Resolution + runtime config
**Output:** Schema 3 (SearchPlanningContext) -> Schema 4 (NeedSetPlannerOutput)
**Schemas:** `03-search-planner-input.json`, `03-search-planner-llm-call.json`, `03-search-planner-output.json`, `03-search-plan-handoff-input.json`, `03-search-plan-handoff-output.json`

#### Schema 3 adds these keys (derived from Schema 2):

| Key Group | Keys Added | Transform |
|-----------|-----------|-----------|
| **focus_groups[]** | key, label, desc, source_target, content_target, search_intent, host_class | enriched from GROUP_DEFAULTS catalog |
| **focus_groups[]** | field_keys, satisfied_field_keys, unresolved_field_keys, weak_field_keys, conflict_field_keys, search_exhausted_field_keys | recomputed (groupBy + filter) |
| **focus_groups[]** | core_unresolved_count, secondary_unresolved_count, optional_unresolved_count, exact_match_count | recomputed counts |
| **focus_groups[]** | query_terms_union, domain_hints_union, preferred_content_types_union, existing_queries_union, domains_tried_union, host_classes_tried_union, evidence_classes_tried_union, aliases_union | recomputed (SET union across non-accepted fields) |
| **focus_groups[]** | no_value_attempts, urls_examined_count, query_count, duplicate_attempts_suppressed | recomputed aggregation |
| **focus_groups[]** | priority (core/secondary/optional), phase (now/next/hold) | recomputed classification |
| **planner_limits** | phase2LlmEnabled, discoveryMaxQueries, maxUrlsPerProduct, llmModelPlan, searchProfileCapMap, searchProvider | recomputed from runtime config |
| **learning** | dead_query_hashes, dead_domains | passthrough from external learning stores |
| **field_priority_map** | field_key -> required_level | recomputed for bundle derivation |

#### Schema 4 adds these keys (from LLM + post-processing):

| Key Group | Keys Added | Transform |
|-----------|-----------|-----------|
| **planner** | mode, model, planner_complete, planner_confidence, queries_generated, duplicates_suppressed, targeted_exceptions, error | recomputed + enriched (LLM) |
| **search_plan_handoff.queries[]** | q, query_hash, family, group_key, target_fields, preferred_domains, exact_match_required | enriched (LLM) + recomputed (dedup, caps) |
| **panel** | round, round_mode, identity, summary, blockers, bundles[], profile_influence (14 keys), deltas[] | passthrough + recomputed |
| **learning_writeback** | query_hashes_generated, queries_generated, families_used, domains_targeted, groups_activated, duplicates_suppressed | recomputed from query analysis |

---

### 04 — Search Planner to Query Journey

**Producer:** `convertHandoffToExecutionPlan()` -> 6-phase journey
**Input:** Schema 4 search_plan_handoff
**Output:** Execution plan + identity-guarded queries + classified results
**Schemas:** `04-query-journey-input.json`, `04-query-journey-llm-call.json`, `04-query-journey-output.json`

#### Phase 1 — Handoff Adapter

| Key | Transform | Notes |
|-----|-----------|-------|
| queries[] | recomputed | deduped query strings from handoff |
| selectedQueryRowMap | recomputed | Map<lowercase(q) -> row> with source, target_fields, domain_hint, doc_hint, hint_source, family, group_key, query_hash |
| queryRows[] | recomputed | flat array of query metadata rows |
| source | recomputed | 'schema4' |

#### Phase 2 — Identity Guard

| Key | Transform | Notes |
|-----|-----------|-------|
| filtered rows[] | recomputed | brand+model token validation |
| rejectLog | recomputed | { query, reasons[] } for rejected queries |
| guardContext | recomputed | { brandTokens, modelTokens, requiredDigitGroups } |

#### Phase 3 — Query Execution (see Stage 05)

#### Phase 4 — Classification + Admission

| Key | Transform | Notes |
|-----|-----------|-------|
| per-result classification | enriched | host, rootDomain, path, tier, tierName, role, doc_kind_guess, identity_match_level, variant_guard_hit, multi_model_hint |
| hard rejects | recomputed | non-https, denied_host, url_cooldown, brand_mismatch, low_relevance |
| soft exclusions | recomputed | forum_subdomain, sibling_model_page, non_manufacturer_multi_model |

#### Phase 5 — Rerank + Triage (see Stage 06)

#### Phase 6 — Outputs

| Key | Transform | Notes |
|-----|-----------|-------|
| searchProfileFinal | recomputed | status='executed', query_stats, serp_explorer |
| approvedUrls[] | recomputed | approved domain URLs -> planner.enqueue() |
| candidateUrls[] | recomputed | candidate domain URLs -> planner.seedCandidates() |
| serp_explorer | recomputed | full query-level + candidate-level trace artifact |

**Execution dispatch:** `executeSearchQueries()` receives an identical interface regardless of whether queries come from Schema 4 handoff (new path) or the old 7-layer profile chain (fallback). Both paths produce identical `rawResults` from SearXNG.

---

### 05 — Query to Results

**Producer:** `executeSearchQueries()`
**Input:** queries[] (from handoff adapter), config, categoryConfig, job, providerState
**Output:** rawResults[], searchAttempts[], searchJournal[], internalSatisfied, externalSearchReason
**Schemas:** `05-searxng-execution-input.json`

| Key Group | Keys Added | Transform |
|-----------|-----------|-----------|
| **rawResults[]** | url, title, snippet, provider, query, rank, seen_in_queries, seen_by_providers | enriched from search providers |
| **searchAttempts[]** | query, provider, result_count, reason_code, duration_ms | recomputed per query |
| **searchJournal[]** | ts, query, provider, action, reason, result_count, duration_ms | recomputed timeline |
| **internalSatisfied** | boolean | recomputed: internal corpus met minimum |
| **externalSearchReason** | string or null | recomputed: why internet search was needed |

**Execution flow:** Internal corpus (if discoveryInternalFirst) -> Internet search (SearXNG, google/bing/dual) -> Plan-only fallback (manufacturer URLs). Frontier cache check per query. Concurrency-controlled.

---

### 06 — Search Results to SERP Triage

**Producer:** `processDiscoveryResults()`
**Input:** rawResults[] + searchAttempts[] + config + categoryConfig + identityLock + brandResolution + missingFields + learning
**Output:** candidates[], approvedUrls[], candidateUrls[], search_profile, serp_explorer

| Step | Keys Added/Transformed | Notes |
|------|----------------------|-------|
| **Dedup** | cross-provider dedup by canonical URL | removes provider duplicates |
| **URL Classification** | host, rootDomain, tier, tierName, role, approvedDomain, doc_kind_guess, identity_match_level, variant_guard_hit, multi_model_hint, cross_provider_count, seen_by_providers, seen_in_queries | enriched per-result |
| **Domain Safety** | domain, safety_class (blocked/safe/caution), budget_score, notes | recomputed per domain |
| **Admission Gate** | exclusionReason per candidate | recomputed filter |
| **Deterministic Rerank** | score, score_breakdown (14 components: base, frontier, identity, variant, multi_model, tier, host_health, operator_risk, field_affinity, diversity, needset_coverage, brand_presence, model_presence, spec_manual) | recomputed scoring |
| **LLM Rerank** (conditional) | rerank_score, rerank_reason, keep | enriched from uber_serp_reranker LLM |
| **serp_explorer** | generated_at, provider, llm_triage_enabled/applied/model, query_count, candidates_checked, urls_triaged/selected/rejected, dedupe stats, queries[].candidates[] | recomputed trace artifact |
| **searchProfileFinal** | status='executed', query_rows, query_stats, discovered_count, approved_count, candidate_count, llm flags | recomputed final profile |

---

### 07 — SERP Triage to Domain Classifier

**Producer:** `runDiscoverySeedPlan()`
**Input:** discoveryResult (candidates[], approvedUrls[], candidateUrls[])
**Output:** Seeded planner queues (manufacturerQueue, queue, candidateQueue)

| Step | Keys Added/Transformed | Notes |
|------|----------------------|-------|
| **Approved URL seeding** | planner.enqueue(url, discovery_approved, forceApproved=true) | approved URLs go to manufacturer or main queue |
| **Candidate URL seeding** | planner.seedCandidates() | if enabled + maxCandidateUrls > 0 |
| **Queue routing** | manufacturerQueue, queue, candidateQueue | based on host tier + manufacturer match |
| **Planner revalidation** | URL parse, protocol check, dedup, denylist, low-value filter, brand restrictions, caps | per-URL gates before enqueue |
| **Queue snapshot** | queue_snapshot trace artifact | written by runPlannerQueueSnapshotPhase() |

---

### 08 — Domain Classifier to Fetch + Parse

**Producer:** `runFetcherStartPhase()` -> `runProcessPlannerQueuePhase()`
**Input:** Seeded planner queues
**Output:** sourceFetch payloads -> Stage 09 (Extraction)

| Step | Keys Added/Transformed | Notes |
|------|----------------------|-------|
| **Preflight** | source, sourceHost, hostBudgetRow | per-URL preflight checks |
| **Skip gates** | runtime blocked domain, frontier cooldown, host budget blocked/backoff | recomputed per source |
| **Mode resolution** | fetcherModeUsed (override -> discovery/http -> static/http -> requires_js/playwright -> base) | recomputed per source |
| **Fetch dispatch** | workerId, host concurrency gate, retry wrapper | infrastructure |
| **Fetch outcome** | ok, pageData, fetchDurationMs, fetcherModeUsed | enriched from fetcher |
| **pageData** | robots, pacing, throttling, navigation, capture | enriched from inner fetcher |
| **Failure classification** | host_budget, backoff, frontier record, repair handoff | recomputed on failure |

---

## Cumulative Data Growth

Each stage **adds** data to the payload — nothing is lost that downstream consumers need.

```
Stage 01: ~65 keys  (run context + identity + 30+ field keys + summary + blockers + planner_seed)
Stage 02:  +5 keys  (officialDomain, supportDomain, aliases, confidence, reasoning)
Stage 03: +40 keys  (focus_groups with 8 union arrays, group_catalog, planner_limits, learning)
Stage 04: +25 keys  (planner metadata, search_plan_handoff queries, panel, learning_writeback)
Stage 05:  +5 keys  (rawResults[], searchAttempts[], searchJournal[], internalSatisfied, externalSearchReason)
Stage 06: +20 keys  (URL classification, domain safety, rerank scores, serp_explorer, searchProfileFinal)
Stage 07:  +3 keys  (seeded queues: manufacturerQueue, queue, candidateQueue)
Stage 08:  +6 keys  (sourceFetch: ok, pageData, fetchDurationMs, fetcherModeUsed, workerId, preflight)
                    -------
Total:    ~170+ keys at fetch handoff, all traceable to their origin stage
```

---

## Anti-Garbage Intelligence Loop

The feedback loop ensures the LLM planner does not repeat failed strategies across rounds:

```
buildFieldHistories (round N-1 evidence)
  -> Schema 2 fields[].history (per-field memory)
    -> Schema 3 focus_groups[].*_union (aggregated per group)
      -> Schema 4 LLM payload (sent as anti-garbage context)
        -> LLM avoids dead domains, dead queries, exhausted patterns
```

| Signal | Created At | Aggregated At | Consumed At |
|--------|-----------|--------------|-------------|
| domains_tried | S2 (buildFieldHistories) | S3 (domains_tried_union) | S4 (LLM payload, capped to 5) |
| host_classes_tried | S2 (classifyHostClass) | S3 (host_classes_tried_union) | S4 (LLM payload) |
| evidence_classes_tried | S2 (classifyEvidenceClass) | S3 (evidence_classes_tried_union) | S4 (LLM payload) |
| no_value_attempts | S2 (buildFieldHistories) | S3 (max across group fields) | S4 (LLM payload) |
| existing_queries | S2 (buildFieldHistories) | S3 (existing_queries_union) | S4 (LLM payload + hash dedup) |
| dead_query_hashes | external learning store | S3 (learning passthrough) | S4 (pre-LLM anti-garbage filter) |
| dead_domains | external learning store | S3 (learning passthrough) | S4 (pre-LLM anti-garbage filter) |

---

## LLM Calls (Prefetch-Once Guarantee)

Each prefetch LLM type fires **exactly once** at run start, never during finalization:

| LLM Call | Role | Stage | Gate |
|----------|------|-------|------|
| Brand Resolver | triage | 02 | brand present + hasLlmRouteApiKey('triage') + no cache hit |
| Query Planner | plan | 03 | enableSchema4SearchPlan + phase2LlmEnabled + hasLlmRouteApiKey('plan') |
| SERP Reranker | plan | 06 | serpTriageEnabled + quality threshold + hasLlmRouteApiKey('plan') |

---

## Persisted Artifacts

| Artifact | Written At | Storage Key Pattern | Consumer |
|----------|-----------|-------------------|----------|
| needset | 01 | `_discovery/needset` | planning context, GUI panel |
| brand_resolution | 02 | runtime log event | search_profile_hints, manufacturer_auto_promote |
| search_profile | 03-06 | `_discovery/search-profile/*` | GUI panel, finalization summary |
| serp_explorer | 06 | embedded in searchProfileFinal | GUI RuntimeOps panel |
| discovery payload | 06 | `_sources/discovery` | planner queue seeding |
| candidates payload | 06 | `_sources/candidates` | planner queue seeding |
| queue_snapshot | 07 | runtime trace | GUI RuntimeOps panel |
| source_fetches | 08 | per-source traces | extraction pipeline |

---

## Source Code Map

| Stage | Primary Source File(s) |
|-------|----------------------|
| 01 | `src/indexlab/needsetEngine.js`, `src/indexlab/buildFieldHistories.js` |
| 02 | `src/features/indexing/discovery/brandResolver.js` |
| 03 | `src/indexlab/searchPlanningContext.js`, `src/indexlab/searchPlanBuilder.js` |
| 04 | `src/features/indexing/discovery/searchPlanHandoffAdapter.js`, `src/features/indexing/discovery/searchDiscovery.js`, `src/features/indexing/discovery/discoveryQueryPlan.js` |
| 05 | `src/features/indexing/discovery/discoverySearchExecution.js` |
| 06 | `src/features/indexing/discovery/discoveryResultProcessor.js`, `src/research/serpReranker.js` |
| 07 | `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js` |
| 08 | `src/features/indexing/orchestration/index.js` (fetch phases) |

---

## Schema File Index

All schema contracts are in this folder, prefixed by stage number:

| File | Stage | Content |
|------|-------|---------|
| `01-needset-input.json` | 01 | Schema 1 (NeedSetStartInput) — field-by-field data source mapping |
| `01-needset-output.json` | 01 | Schema 2 (NeedSetOutput) — gap analysis vs actual computeNeedSet() output |
| `01-needset-planner-context.json` | 01 | Schema 3 (SearchPlanningContext) — gap analysis vs buildSearchPlanningContext() |
| `01-needset-planner-output.json` | 01 | Schema 4 (NeedSetPlannerOutput) — gap analysis vs assembleSchema4() |
| `02-brand-resolver-input.json` | 02 | Brand resolver input contract — call boundary + gates + storage |
| `02-brand-resolver-output.json` | 02 | Brand resolver output contract — officialDomain/aliases/supportDomain |
| `03-search-planner-input.json` | 03 | Search planner input — Schema 3 consumption contract with per-field tags |
| `03-search-planner-llm-call.json` | 03 | Search planner LLM — prompt, payload, response schema, post-processing |
| `03-search-planner-output.json` | 03 | Search planner output — Schema 4 output contract with per-field tags |
| `03-search-plan-handoff-input.json` | 03 | Handoff shape — Schema 4 queries -> execution adapter |
| `03-search-plan-handoff-output.json` | 03 | Cumulative output — searchProfileFinal + serp_explorer + return contract |
| `04-query-journey-input.json` | 04 | Query journey 6-phase input contract (adapter -> guard -> exec -> classify -> rerank) |
| `04-query-journey-llm-call.json` | 04 | SERP reranker LLM contract — uber_serp_reranker prompt/weights/response |
| `04-query-journey-output.json` | 04 | Query journey per-phase output shapes with cumulative artifacts |
| `05-searxng-execution-input.json` | 05 | Final query payload hitting SearXNG — identical shape regardless of path |

---

## Naming Conventions

| Asset Type | Convention | Example |
|-----------|-----------|---------|
| Schema file | `{stage}-{descriptor}.json` | `01-needset-input.json` |
| Overview doc | `SCREAMING-KEBAB.md` | `PREFETCH-PIPELINE-OVERVIEW.md` |

---

## Validation Status

| Check | Result |
|-------|--------|
| Data propagates from NeedSet -> Brand Resolver -> Search Profile | CONFIRMED |
| Each stage adds keys to cumulative payload | CONFIRMED (65 -> 70 -> 110 -> 135 -> 140 -> 160 -> 163 -> 170+) |
| No data loss between boundaries (forward-investment preserved) | CONFIRMED |
| Anti-garbage intelligence loop functional across rounds | CONFIRMED |
| LLM calls fire exactly once per run (prefetch-once guarantee) | CONFIRMED |
| All schema JSON files match live source code contracts | CONFIRMED |
| All 15 schema files validated against source (0 open material gaps) | CONFIRMED |
