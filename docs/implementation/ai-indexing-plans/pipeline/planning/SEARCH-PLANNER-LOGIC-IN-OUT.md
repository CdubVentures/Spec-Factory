# Search Planner Logic In And Out

Validated against live code on 2026-03-19.

## What this stage is

Search Planner is the Stage 04 planner boundary owned by `runSearchPlanner()`. It is not the Stage 01 Schema 4 NeedSet planner. Its job is to:

- adapt the Stage 01 Schema 4 handoff into guarded execution rows
- call `planUberQueries()` for extra query exploration driven by Search Profile context

Primary owners:

- `src/features/indexing/discovery/stages/searchPlanner.js`
- `src/features/indexing/discovery/searchDiscovery.js` (`resolveSchema4ExecutionPlan`)
- `src/research/queryPlanner.js`

## Schema files in this folder

- `03-search-plan-handoff-input.json`
- `03-search-plan-handoff-output.json`
- `03-search-planner-input.json`
- `03-search-planner-llm-call.json`
- `03-search-planner-output.json`

The Stage 01 NeedSet planner is documented separately in:

- `01-needset-planner-context.json`
- `01-needset-planner-output.json`

## Inputs in

`runSearchPlanner()` consumes:

- `searchPlanHandoff`
- `searchProfileBase`
- `variables`
- `config`
- `logger`
- `llmContext`
- `identityLock`
- `missingFields`
- `planningHints.missingCriticalFields`
- `baseQueries`
- `frontierDb`
- `job`

Derived context:

- `targetedQueries` from `searchProfileBase.queries`
- `archetypeSummary` from `searchProfileBase.archetype_summary`
- `coverageAnalysis` from `searchProfileBase.coverage_analysis`
- `frontierSummary` from `frontierDb.snapshotForProduct(job.productId)`

## Live logic

The live stage does this:

1. Call `resolveSchema4ExecutionPlan()`:
   - adapt `searchPlanHandoff` with `convertHandoffToExecutionPlan()`
   - guard the adapted rows with `enforceIdentityQueryGuard()`
   - return `null` when the handoff is empty or every row is rejected
   - emit `schema4_path_active` when guarded Schema 4 rows survive
2. Build `archetypeContext` from Search Profile:
   - `archetypes_emitted`
   - `hosts_targeted`
   - `uncovered_search_worthy`
   - `representative_gaps`
3. Build `frontierSummary` from the current product snapshot.
4. Call `planUberQueries()` with:
   - `reason: "search_planner"`
   - `phase: "searchPlanner"`
   - Search Profile-derived base queries
   - missing field pressure
   - frontier summary
5. Emit `search_plan_generated` when the stage has query output.

## Important invariants

- Stage order is Search Profile first, Search Planner second, Query Journey third.
- Search Planner never writes its own artifact. It returns in-memory planning state.
- `planUberQueries()` falls back to deterministic output when:
  - there is no `plan` route API key
  - `resolvePhaseModel(config, "searchPlanner")` returns no model
  - the LLM call fails
- Stage 04 Search Planner does not bypass later identity guarding. Uber queries are still merged, capped, and guarded in Query Journey.

## Outputs out

`runSearchPlanner()` returns:

- `schema4Plan`
- `uberSearchPlan`

`schema4Plan` shape:

- `queries`
- `queryRows`
- `selectedQueryRowMap`
- `rejectLog`
- `guardContext`
- `source: "schema4"`

`uberSearchPlan` shape:

- `source: "llm" | "deterministic" | "deterministic_fallback"`
- `queries`
- `preferred_domains`
- `negative_filters`
- `max_queries`
- `max_new_domains`
- `sitemap_mode_recommended`

Important distinction:

- `schema4Plan` comes from Stage 01 Schema 4 handoff adaptation
- `uberSearchPlan` comes from the Stage 04 Search Planner LLM call or deterministic fallback

## Side effects and persistence

- optional routed LLM call through `planUberQueries()`
- `search_plan_generated` runtime event
- `schema4_path_active` warning/info telemetry when Schema 4 rows survive

No direct storage writes happen in this stage.

## What it feeds next

Search Planner feeds Query Journey with:

- guarded `schema4Plan.queryRows`
- `uberSearchPlan.queries`

Query Journey then merges those with deterministic Search Profile rows and optional host-plan rows.
