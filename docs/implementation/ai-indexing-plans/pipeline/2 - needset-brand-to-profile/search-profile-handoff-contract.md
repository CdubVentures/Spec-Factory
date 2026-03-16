# Search Profile Handoff Contract

## Purpose

Documents how Search Profile now consumes Schema 4 `search_plan_handoff` as its primary query input, replacing the old 7-layer append chain. Post-execution result processing (SERP dedup, domain classification, reranking, triage, artifact writing) is handled by `discoveryResultProcessor.js`.

## Two Query Paths

### Schema 4 Path (New — Primary)

When `config.enableSchema4SearchPlan` is enabled and the Schema 2/3/4 pipeline completes:

1. `runDiscoverySeedPlan` computes Schema 2 (`computeNeedSet`) -> Schema 3 (`buildSearchPlanningContext`) -> Schema 4 (`buildSearchPlan`)
2. `runDiscoverySeedPlan` attaches `_planner`, `_learning`, `_panel` metadata from Schema 4 onto the `search_plan_handoff` object
3. `search_plan_handoff` (with metadata) is passed to `discoverCandidateSources({ searchPlanHandoff })`
4. `resolveSchema4ExecutionPlan()` converts the handoff via `convertHandoffToExecutionPlan()` and runs `enforceIdentityQueryGuard()` as safety net
5. Converted queries go directly to `executeSearchQueries()` — the 7-layer append chain is bypassed

### Old Path (Fallback)

When Schema 4 is disabled, unavailable, or identity guard rejects all queries:

1. `buildSearchProfile()` generates deterministic base + targeted queries
2. `planDiscoveryQueriesLLM()` adds LLM-generated queries
3. `planUberQueries()` adds uber-aggressive fallback queries (when mode=uber)
4. 7-layer chain: dedup -> rank -> guard -> host-plan append
5. Result goes to `executeSearchQueries()`

Both paths converge at `executeSearchQueries()` with identical interface, then delegate to `processDiscoveryResults()` for post-execution processing.

## searchProfilePlanned Enrichment

Both paths now attach upstream data to `searchProfilePlanned` for downstream visibility:

| Field | Schema 4 Path | Old Path | Consumer |
|-------|--------------|----------|----------|
| `brand_resolution` | `{ officialDomain, supportDomain, aliases, confidence, reasoning }` | same | Review/sorting: trust level of source discovery |
| `schema4_planner` | `{ mode, planner_confidence, duplicates_suppressed, targeted_exceptions }` | `null` | Round-over-round: query plan quality assessment |
| `schema4_learning` | `{ query_hashes_generated, queries_generated, families_used, domains_targeted, groups_activated, duplicates_suppressed }` | `null` | Learning loop: what was tried, what to try differently |
| `schema4_panel` | `{ round, round_mode, identity, summary, blockers, bundles, profile_influence, deltas }` | `null` | Review/GUI: full visibility into planner decisions |

These fields persist through to `searchProfileFinal` (which spreads `searchProfilePlanned`).

## Key Files

| File | Role |
|------|------|
| `src/features/indexing/orchestration/discovery/runDiscoverySeedPlan.js` | Orchestrator: computes Schema 2/3/4, attaches metadata, passes handoff |
| `src/features/indexing/discovery/searchPlanHandoffAdapter.js` | Adapter: converts Schema 4 handoff to execution shape |
| `src/features/indexing/discovery/searchDiscovery.js` | Pre-execution: identity, brand, planning, query selection (~680 LOC) |
| `src/features/indexing/discovery/discoveryResultProcessor.js` | Post-execution: SERP dedup, rerank, triage, artifact writing (~750 LOC) |
| `src/indexlab/needsetEngine.js` | Schema 2: `computeNeedSet()` |
| `src/indexlab/searchPlanningContext.js` | Schema 3: `buildSearchPlanningContext()` |
| `src/indexlab/searchPlanBuilder.js` | Schema 4: `buildSearchPlan()` |

## Alias Note

Brand Resolver `aliases` are text-only labels. They are NOT promoted as manufacturer hosts (fixed in `manufacturerPromoter.js`). Only `officialDomain` and `supportDomain` are promoted.
