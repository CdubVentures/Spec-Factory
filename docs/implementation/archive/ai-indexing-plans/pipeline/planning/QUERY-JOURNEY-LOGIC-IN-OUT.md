# Query Journey Logic In And Out

Validated against live code on 2026-03-23. P7: host plan concept deleted entirely — no `hostPlanQueryRows` or `effectiveHostPlan` inputs.

## What this phase is

Query Journey is the Query Journey phase query-selection and persistence boundary owned by `runQueryJourney()`. It does not call an LLM. It receives enhanced query rows from Search Planner phase, then deduplicates, ranks, guards, caps, and persists the final query list.

Primary owners:

- `src/features/indexing/pipeline/queryJourney/runQueryJourney.js`
- `src/features/indexing/pipeline/shared/queryPlan.js`

## Inputs in

Query Journey works from:

- `enhancedRows` — tier-tagged rows from Search Planner (LLM-enhanced or deterministic fallback)
- `searchProfileBase` — deterministic base from Search Profile phase (for `variant_guard_terms`, `query_reject_log`, original `query_rows`)
- `variables` — resolved job identity
- `missingFields`
- `planningHints.missingCriticalFields`, `planningHints.missingRequiredFields`
- `searchProfileCaps`
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

**Query Journey treats both identically.** It does not branch on whether the LLM succeeded. The rows go through the same dedupe -> rank -> guard -> cap pipeline either way.

## Live logic

1. Build `profileQueryRowsByQuery` Map from `searchProfileBase.query_rows` (keyed by lowercase query).
2. Build candidate list from `enhancedRows` (Stream 1) — normalize all string fields.
3. Deduplicate with `dedupeQueryRows(queryCandidates, searchProfileCaps.dedupeQueriesCap)`.
4. Cap to `searchProfileQueryCap` via `.slice(0, mergedQueryCap)`. Tier order IS execution priority — no re-ranking.
5. Guard with `enforceIdentityQueryGuard()` using `variant_guard_terms`.
6. If every guarded row disappears but capped rows existed, retain one fallback query.
8. Build `llm_queries` — filter `enhancedRows` where `hint_source` ends with `_llm`.
9. Build planned `search_profile` payload (`searchProfilePlanned`).
10. Write planned `search_profile` artifacts via `writeSearchProfileArtifacts()`.
11. Emit `query_journey_completed`.

## Guard behavior

The identity guard rejects for reasons such as:

- `missing_brand_token`
- `missing_model_token`
- `missing_required_digit_group:<digits>`
- `foreign_model_token:<token>`

## Important invariants

- Query Journey is deterministic. It does not make its own LLM call.
- Enhanced rows are the sole query source (no separate "deterministic" and "LLM" streams merged). The LLM enhancement is applied *before* Query Journey receives them.
- `searchProfilePlanned.llm_queries` contains only queries where `hint_source` ends with `_llm`.
- If the LLM failed in Search Planner, `llm_queries` will be empty and all rows will have their original deterministic `hint_source`.

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
- `deterministic_query_rows` — frozen copy of `searchProfileBase.query_rows` (the deterministic profile output, preserved for the GUI Search Profile panel)
- `status: "planned"`
- `provider`
- `llm_queries` — LLM-enhanced query texts (empty if LLM failed)
- `query_guard`
- `selected_queries`, `selected_query_count`
- `query_rows` — final selected rows (capped, LLM-enhanced). Downstream consumers (Result Processing, merge helpers, automation queue) use this for execution matching.
- `brand_resolution`
- `key`, `run_key`, `latest_key`

## Side effects and persistence

- Writes planned `search_profile` artifact family through `writeSearchProfileArtifacts()`.
- Emits `query_journey_completed`.
- Does not write a dedicated standalone Query Journey artifact.

## What it feeds next

Query Journey feeds Search Execution phase with:

- final `queries`
- `executionQueryLimit`
- `selectedQueryRowMap`
- `profileQueryRowsByQuery`
- planned `search_profile`

From this point forward, discovery is executing and triaging URLs. Query text is no longer being invented.
