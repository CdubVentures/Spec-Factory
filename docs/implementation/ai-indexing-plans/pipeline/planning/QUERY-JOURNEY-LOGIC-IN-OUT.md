# Query Journey Logic In And Out

Validated against live code on 2026-03-20.

## What this stage is

Query Journey is the Stage 05 query-selection and persistence boundary owned by `runQueryJourney()`. It does not call an LLM. It receives enhanced query rows from Search Planner (Stage 04) and optional host-plan rows, then deduplicates, ranks, guards, caps, and persists the final query list.

Primary owners:

- `src/features/indexing/discovery/stages/queryJourney.js`
- `src/features/indexing/discovery/discoveryQueryPlan.js`

## Inputs in

Query Journey works from:

- `enhancedRows` — tier-tagged rows from Search Planner (LLM-enhanced or deterministic fallback)
- `searchProfileBase` — deterministic base from Stage 03 (for `variant_guard_terms`, `query_reject_log`, original `query_rows`)
- optional `hostPlanQueryRows` — scored queries from host-plan scorer
- `variables` — resolved job identity
- `missingFields`
- `planningHints.missingCriticalFields`, `planningHints.missingRequiredFields`
- `searchProfileCaps`
- `effectiveHostPlan`
- `categoryConfig`, `job`, `runId`, `logger`, `storage`
- optional `brandResolution`

## How enhanced rows and deterministic rows relate

Search Planner returns `enhancedRows` which are the *same rows* as `searchProfileBase.query_rows`, just with potentially rewritten `query` strings. Two scenarios:

**LLM succeeded (`source: 'llm'`):**
- Each row has `hint_source` updated to `{original}_llm` (e.g. `tier3_key_llm`)
- `query` is the LLM-enhanced version
- `original_query` preserves the deterministic version
- All tier metadata unchanged

**LLM failed (`source: 'deterministic_fallback'`):**
- Each row is an exact copy of the original `searchProfileBase.query_rows`
- `hint_source` unchanged (e.g. `tier3_key`)
- No `original_query` field
- No `_llm` suffix

**Query Journey treats both identically.** It does not branch on whether the LLM succeeded. The rows go through the same dedupe → rank → guard → cap pipeline either way.

## Live logic

1. Build candidate list from `enhancedRows` (Stream 1).
2. Deduplicate with `dedupeQueryRows()`.
3. Build field-priority map from `missingCriticalFields` and `missingRequiredFields`.
4. Build host-field-fit map from `categoryConfig.sourceHostMap` and `effectiveHostPlan`.
5. Rank with `prioritizeQueryRows()`.
6. Cap to `searchProfileQueryCap`.
7. Guard with `enforceIdentityQueryGuard()` using `variant_guard_terms`.
8. Guard host-plan rows (Stream 2) separately, append only unique survivors.
9. If every guarded row disappears but ranked rows existed, retain one fallback query.
10. Build `llm_queries` — filter `enhancedRows` where `hint_source` ends with `_llm`.
11. Build planned `search_profile` payload.
12. Write planned `search_profile` artifacts.
13. Emit `query_journey_completed`.

## Guard behavior

The identity guard rejects for reasons such as:

- `missing_brand_token`
- `missing_model_token`
- `missing_required_digit_group:<digits>`
- `foreign_model_token:<token>`

## Important invariants

- Query Journey is deterministic. It does not make its own LLM call.
- Enhanced rows are the sole query source (no separate "deterministic" and "LLM" streams merged). The LLM enhancement is applied *before* Query Journey receives them.
- Host-plan rows are appended only after the main ranked set has been deduped and guarded.
- `searchProfilePlanned.llm_queries` contains only queries where `hint_source` ends with `_llm`.
- If the LLM failed in Stage 04, `llm_queries` will be empty and all rows will have their original deterministic `hint_source`.

## Outputs out

`runQueryJourney()` returns:

- `queries` — final string array for execution
- `selectedQueryRowMap` — `Map<lowercase_query, row>` for runtime lookup
- `profileQueryRowsByQuery` — `Map<lowercase_query, original_profile_row>` for execution enrichment
- `searchProfilePlanned` — persisted artifact payload
- `searchProfileKeys` — storage keys
- `executionQueryLimit`
- `queryLimit`
- `queryRejectLogCombined`

`searchProfilePlanned` shape:

- `...searchProfileBase` (spread)
- `status: "planned"`
- `provider`
- `llm_queries` — LLM-enhanced query texts (empty if LLM failed)
- `query_guard`
- `selected_queries`, `selected_query_count`
- `query_rows` — final selected rows (capped)
- `effective_host_plan`
- `brand_resolution`
- `key`, `run_key`, `latest_key`

## Side effects and persistence

- Writes planned `search_profile` artifact family through `writeSearchProfileArtifacts()`.
- Emits `query_journey_completed`.
- Does not write a dedicated standalone Query Journey artifact.

## What it feeds next

Query Journey feeds Search Results (Stage 06) with:

- final `queries`
- `executionQueryLimit`
- `selectedQueryRowMap`
- `profileQueryRowsByQuery`
- planned `search_profile`

From this point forward, discovery is executing and triaging URLs. Query text is no longer being invented.
