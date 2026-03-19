# Query Journey Logic In And Out

Validated against live code on 2026-03-18.

## What this stage is

Query Journey is the Stage 05 merged query-selection path owned by `runQueryJourney()`. It does not call an LLM itself. Instead, it merges deterministic Search Profile rows with outputs from both planner surfaces:

- Stage 01 Schema 4 handoff rows
- Stage 04 Search Planner uber queries

Primary owners:

- `src/features/indexing/discovery/stages/queryJourney.js`
- `src/features/indexing/discovery/discoveryQueryPlan.js`
- `src/features/indexing/discovery/searchPlanHandoffAdapter.js`

`src/features/indexing/discovery/searchDiscovery.js` still contains the compatibility implementation for direct callers, but the stage module above is the canonical path.

## Schema files in this folder

- `03-search-plan-handoff-input.json`
- `03-search-plan-handoff-output.json`
- `04-query-journey-input.json`
- `04-query-journey-llm-call.json`
- `04-query-journey-output.json`

## Inputs in

Query Journey works from:

- `searchProfileBase.base_templates`
- `searchProfileBase.query_rows`
- optional `schema4Plan`
- optional `uberSearchPlan`
- optional `hostPlanQueryRows`
- `variables` from resolved job identity
- `missingFields`
- `planningHints.missingCriticalFields`
- `planningHints.missingRequiredFields`
- `searchProfileCaps`
- `effectiveHostPlan`
- `categoryConfig`, `job`, `runId`, `logger`, `storage`
- optional `brandResolution`
- optional `searchPlanHandoff` metadata bridge (`_planner`, `_learning`, `_panel`)

## Live logic

The live path is:

1. Build one candidate list from:
   - deterministic base templates
   - deterministic targeted rows
   - guarded Schema 4 rows
   - Search Planner uber queries
2. Deduplicate with `dedupeQueryRows()`.
3. Build field-priority and host-fit maps.
4. Rank with `prioritizeQueryRows()`.
5. Apply a merged cap of `max(queryLimit, 6)`.
6. Guard the ranked set with `enforceIdentityQueryGuard()`.
7. Guard host-plan rows separately and append only unique survivors.
8. If every guarded row disappears but ranked rows existed, retain one fallback ranked query.
9. Build the planned `search_profile` payload.
10. Write planned `search_profile` artifacts.
11. Emit:
   - `search_profile_generated`
   - `query_journey_completed`

## Guard behavior

The identity guard rejects for reasons such as:

- `missing_brand_token`
- `missing_model_token`
- `missing_required_digit_group:<digits>`
- `foreign_model_token:<token>`

The guard returns:

- `rows`
- `rejectLog`
- `guardContext`

`guardContext` contains:

- `brandTokens`
- `modelTokens`
- `requiredDigitGroups`
- `allowedModelTokens`

## Important invariants

- Schema 4 rows are additive. They do not replace deterministic Search Profile rows.
- Search Planner uber queries are additive. They do not replace Schema 4 or deterministic rows.
- Host-plan rows are appended only after the main ranked set has already been deduped and guarded.
- Query Journey is deterministic in the current codebase. It does not make its own LLM call.
- `searchProfilePlanned.llm_queries` contains merged Schema 4 query texts plus Search Planner uber query texts.
- Canonical discovery callers still pass `llmQueries: []` into `processDiscoveryResults()`, so downstream `discoveryPayload.llm_queries` is currently empty even though the planned Search Profile persists the merged planner queries.

## Outputs out

`runQueryJourney()` returns:

- `queries`
- `selectedQueryRowMap`
- `profileQueryRowsByQuery`
- `searchProfilePlanned`
- `searchProfileKeys`
- `executionQueryLimit`
- `queryLimit`
- `queryRejectLogCombined`

`searchProfilePlanned` adds runtime-selection state onto the deterministic Search Profile base:

- `status: "planned"`
- `provider`
- `llm_queries`
- `query_guard`
- `selected_queries`
- `selected_query_count`
- rewritten `query_rows`
- optional `effective_host_plan`
- optional `brand_resolution`
- optional `schema4_planner`, `schema4_learning`, `schema4_panel`
- `key`, `run_key`, `latest_key`

## Side effects and persistence

- Query Journey writes the planned `search_profile` artifact family through `writeSearchProfileArtifacts()`.
- It emits `search_profile_generated` and `query_journey_completed`.
- It does not write a dedicated standalone Query Journey artifact.

## What it feeds next

Query Journey feeds Search Results with:

- final `queries`
- `executionQueryLimit`
- `selectedQueryRowMap`
- `profileQueryRowsByQuery`
- planned `search_profile`

From this point forward, discovery is executing and triaging URLs. Query text is no longer being invented.
