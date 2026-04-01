# NeedSet Logic In And Out

Validated against live code on 2026-03-23. Return shape simplified to 3-field contract. P5: cumulative Zod checkpoint validates output at `afterBootstrap`.
`settings` parameter retired. Error handling split into step-isolated catches.
`configInt` hardened with registry-derived clamping. `bestTierSeen` infinity guard added.

P0 changes (2026-03-22): Rank constants (`AVAILABILITY_RANKS`, `DIFFICULTY_RANKS`, `REQUIRED_LEVEL_RANKS`,
`PRIORITY_BUCKET_ORDER`) and exhaustion thresholds (`EXHAUSTION_MIN_ATTEMPTS`, `EXHAUSTION_MIN_EVIDENCE_CLASSES`)
extracted to `src/shared/discoveryRankConstants.js`. Accessor functions re-exported from `needsetEngine.js` for
backward compatibility. NeedSet assessment / search planning context / search plan naming convention retained in
code comments — refers to the transformation chain: raw input -> NeedSet assessment (per-field) -> search planning
context (group planning) -> search plan (LLM annotations).

Post-audit fixes (2026-03-22):
- `mapRequiredLevelToBucket()` extracted to `discoveryRankConstants.js` as shared SSOT. Private copies in
  `needsetEngine.js` and `searchPlanBuilder.js` deleted. Fixes semantic divergence where `required` mapped to
  `core` in one file and `secondary` in the other.
- `buildSearchPlanningContext()` phase assignment refactored to immutable pattern: `phaseOverrides` Map +
  `.map()` spread instead of in-place `g.phase = 'next'` mutation. Original `focusGroups` objects are never modified.

P1 (2026-03-22, COMPLETE): `field_history` table added to specDb. Per-field search history persisted to DB
at end of each round inside the `exportToSpecDb()` transaction (atomic with product_run, item_field_state,
candidate writes). On startup, `runUntilComplete.js` loads `previousFieldHistories` from DB for crash recovery.
In-memory handoff remains the fast path between rounds within the same process.

P3 finding (2026-03-22): `NEED_SCORE_WEIGHTS` is redundant with `REQUIRED_LEVEL_RANKS` — both encode the same
field importance hierarchy. `needScore` contributes ~1% to group productivity scoring and the productivity_score
sort is discarded in final group ordering (which uses phase/priority via `PRIORITY_BUCKET_ORDER`). The scoring
machinery is vestigial but retained for backward compat (`primeSourcesBuilder.js` sorts by `need_score`).

## What this phase is

NeedSet is the NeedSet phase of the discovery pipeline. It assesses what fields are missing, groups
them, ranks which groups are easiest/most productive to work on, computes a budget-aware tier
allocation, and passes that information upstream. It does not write queries or decide search
strategy.

Internally it runs three functions in sequence:
- `computeNeedSet()` — per-field gap assessment + V4 search packs (NeedSet assessment)
- `buildSearchPlanningContext()` — group-level aggregation, coverage/worthiness ranking,
  seed status, budget-aware tier allocation (search planning context)
- `assembleSearchPlan()` — LLM call for group-level annotations only (search plan, LLM-annotated,
  does NOT generate queries)

These are implementation details. The phase returns a clean 3-field contract:
```
{ focusGroups, seedStatus, seedSearchPlan }
```

Primary owners:
- `src/features/indexing/pipeline/needSet/runNeedSet.js` — phase wrapper
- `src/indexlab/needsetEngine.js` — `computeNeedSet()`
- `src/indexlab/searchPlanningContext.js` — `buildSearchPlanningContext()`
- `src/indexlab/searchPlanBuilder.js` — `assembleSearchPlan()`
- `src/indexlab/buildFieldHistories.js` — next-round memory (finalization only)

## Phase return contract

```js
{
  focusGroups: FocusGroup[],     // for Search Profile tier-aware query generation
  seedStatus:  SeedStatus|null,  // for Search Profile seed dispatch
  seedSearchPlan: SearchPlan|null,  // for finalization (bundles, profile_influence, deltas)
}
```

Removed from return (2026-03-22): `needSetOutput` (internal only), `planningContext`
(exposed as `seedStatus`), `searchPlanHandoff` (internal only, flows out via
`seedSearchPlan.search_plan_handoff`).

## Three-Tier Search Model

NeedSet packages data for three downstream query tiers:

### Tier 1 — Broad Seeds
- `{brand} {model} {variant} specifications`
- `{brand} {model} {variant} {source}`
- Cooldown: `queryCooldownDays` (default 30 days) — uses `cooldown_until` from DB, same pattern as group cooldown
- NeedSet emits: `seed_status` with per-seed `is_needed`, `cooldown_until_ms`, `attempt_count`

### Tier 2 — Group Searches
- `{brand} {model} {variant} {group} {description}`
- Skip logic: `group_search_worthy` based on coverage ratio, unresolved count, and
  `group_query_count` (broad group queries, NOT individual key retries)
- NeedSet emits: `group_description_short`, `group_description_long`, `coverage_ratio`,
  `group_fingerprint_coarse`/`fine`

### Tier 3 — Individual Key Searches (progressive enrichment)
- Progressively enriched per-key based on `repeat_count`:
  - `repeat_count=0` (3a): `{brand} {model} {variant} {key}` — bare query
  - `repeat_count=1` (3b): `+ {aliases}` — aliases carried forward on all subsequent passes
  - `repeat_count=2` (3c): `+ {untried domain hint}`
  - `repeat_count=3+` (3d): `+ {untried content type}`
- Each pass is cumulative
- NeedSet emits enriched `normalized_key_queue` entries per group

NeedSet does NOT write queries. Its job is to say "these groups are easiest/most productive —
focus on them now" and pass enriched descriptions and field packs upstream.

## Error handling (updated 2026-03-22)

Step-isolated catches attribute failures to the correct step:
- `computeNeedSetFn` throws -> logs `needset_computation_failed`, returns early with all nulls
- `buildSearchPlanningContextFn` throws -> logs `search_planning_context_failed`, returns early
- `buildSearchPlanFn` throws -> logs `search_plan_failed` (defensive — real function
  has internal catch and should never throw)

Previously a single try/catch misattributed all failures as `search_plan_failed`.

## Inputs

`runNeedSet()` receives:
- **Run identity**: `runId`, `category`
- **Product**: `job` (productId, brand, model, baseModel, aliases, identityLock)
- **Category config**: `categoryConfig` (fieldOrder, fieldRules, fieldGroups, sourceHosts)
- **Round state**: `roundContext` (provenance, fieldReasoning, constraintAnalysis,
  identityContext, round, previousFieldHistories, previousRoundFields)
- **Query history**: `queryExecutionHistory` — from `frontierDb.buildQueryExecutionHistory()`.
  Null on round 0.
- **DI seams**: `computeNeedSetFn`, `buildSearchPlanningContextFn`, `buildSearchPlanFn`
- **Config + logging**: `config`, `llmContext`, `logger`

### Data origin (SSOT gap analysis)

| Parameter | Source | In DB today? |
|-----------|--------|-------------|
| `provenance` | Runtime: `executeConsensusPhase()` | No — nearest: `item_field_state` but missing `evidence[]` |
| `fieldRules` | Static config: category JSON | Partial — `llm_route_matrix` covers subset |
| `fieldReasoning` | Runtime: `buildFieldReasoning()` | No |
| `constraintAnalysis` | Runtime: `evaluateConstraintGraph()` | No |
| `identityContext` | Runtime: identity gate + run results | Partial — `products` has brand/model |
| `previousFieldHistories` | In-memory carry-forward OR `specDb.getFieldHistories()` on crash recovery | **Yes** — `field_history` table in specDb (P1) |
| `fieldOrder` | Static config: category authoring schema | No (and doesn't need to be) |
| `queryExecutionHistory` | **DB**: `frontierDb.buildQueryExecutionHistory()` | Yes |

Field search history is now persisted in the `field_history` table (P1). Remaining SSOT gaps:
provenance evidence arrays, identity intermediate state.

## Internal logic

`computeNeedSet()`:
1. Collect field universe from `fieldOrder`, provenance keys, and rule keys
2. Normalize required levels to `identity | critical | required | expected | optional`
3. Normalize search hints into `query_terms`, `domain_hints`, `preferred_content_types`
4. Derive field state: `covered | missing | weak | conflict` -> map to NeedSet assessment state
5. Compute reasons: `missing`, `conflict`, `low_conf`, `min_refs_fail`, `publish_gate_block`
6. Build per-field history from `previousFieldHistories` + current evidence
7. Build V4 search packs: `normalized_key`, `all_aliases`, `alias_shards`, `availability`,
   `difficulty`, `repeat_count`, `search_intent` (per-key, not per-group)
8. Compute `sorted_unresolved_keys` (availability -> difficulty -> repeat -> need_score ->
   required_level)
9. Compute bundles, rows, profile_mix, focus_fields, summary, blockers, planner_seed

`buildSearchPlanningContext()` adds:
1. Group descriptions (`group_description_short` / `group_description_long`)
2. Coverage metrics (`coverage_ratio`, `total_field_count`, `resolved_field_count`)
3. Query counts (`group_query_count` for Tier 2, `group_key_retry_count` for per-field)
4. Worthiness (`group_search_worthy`, `skip_reason`)
5. Fingerprints (`group_fingerprint_coarse`, `group_fingerprint_fine`)
6. `normalized_key_queue` — V4-sorted unresolved keys per group
7. `productivity_score` — for budget-aware phase assignment
8. `seed_status` — per-seed completion with cooldown
9. `pass_seed` — seed signals for Search Profile
10. `tier_allocation` — budget-aware slot distribution

`assembleSearchPlan()` (LLM):
- Annotates groups with `reason_active`, `planner_confidence`
- Does NOT generate queries — `search_plan_handoff.queries` is always empty
- Returns `panel` for GUI display (bundles, profile_influence, deltas)

## Events emitted

1. `needset_computed` (scope: `needset_assessment`) — before LLM call. Fields, summary,
   blockers, planner_seed, deltas. Bundles and profile_influence are empty.
2. `needset_computed` (scope: `search_plan`) — after LLM call, only when panel exists.
   Includes search plan panel data (bundles, profile_influence, deltas) plus NeedSet assessment fields.
3. `search_plan_ready` — when handoff has queries (currently always empty).

## Important invariants

- NeedSet and Brand Resolver run in parallel via `Promise.all` — neither depends on the other
- Every field in `fieldOrder`, provenance, or rules appears in `fields[]`
- Round 0 history is zeroed; later rounds carry forward via `previousFieldHistories`
- `need_score` is zero for covered fields
- `search_intent` is per-key (from `exact_match_required`), not per-group
- `group_query_count` counts Tier 2 broad searches only, NOT per-key retries
- `group_search_worthy` uses `group_query_count`, not `group_key_retry_count`
- Phase is productivity-based AND budget-aware
- Seed cooldown uses `cooldown_until > now` (same pattern as group cooldown)
- `passA_specs_seed` derives from `seedStatus.specs_seed.is_needed`, not round number
- `tier_allocation` mirrors Search Profile's priority order (seeds -> groups -> keys)
- `configInt` is now clamped to registry `min`/`max` with NaN fallback to registry default
- `bestTierSeen` returns `null` (not `Infinity`) when all evidence tiers >= 99
- `computeDeltas` null-guards entries before accessing `.field_key`/`.state`

## What it feeds next

- **Search Profile phase**: `focusGroups` + `seedStatus` — determines which tier to
  operate in via `determineQueryModes()`, fires tier builders
- **Finalization**: `seedSearchPlan` — bundles, profile_influence, deltas, and
  `search_plan_handoff.queries` for `enrichNeedSetFieldHistories()`
- **Next round**: `previousFieldHistories` extracted from `fields[].history` by
  `buildPreviousFieldHistories()` in `runUntilComplete.js`

## Schema files in this folder

- `01-needset-contract.json` — merged input + output contracts with data origin map, stage return shapes, NeedSet assessment, and search plan output
