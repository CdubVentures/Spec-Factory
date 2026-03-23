# NeedSet Logic In And Out

Validated against live code on 2026-03-22. Return shape simplified to 3-field contract.
`settings` parameter retired. Error handling split into step-isolated catches.
`configInt` hardened with registry-derived clamping. `bestTierSeen` infinity guard added.

P0 changes (2026-03-22): Rank constants (`AVAILABILITY_RANKS`, `DIFFICULTY_RANKS`, `REQUIRED_LEVEL_RANKS`,
`PRIORITY_BUCKET_ORDER`) and exhaustion thresholds (`EXHAUSTION_MIN_ATTEMPTS`, `EXHAUSTION_MIN_EVIDENCE_CLASSES`)
extracted to `src/shared/discoveryRankConstants.js`. Accessor functions re-exported from `needsetEngine.js` for
backward compatibility. Schema 2/3/4 naming convention retained in code comments — refers to the transformation
chain: Schema 1 (raw input) → Schema 2 (per-field assessment) → Schema 3 (group planning) → Schema 4 (LLM annotations).

P1 Phase A (2026-03-22): `field_history` table added to specDb. Per-field search history (repeat_count, domains_tried,
no_value_attempts, etc.) will be persisted to DB at end of each round and loaded at start for crash recovery.

## What this stage is

NeedSet is Stage 01 of the discovery pipeline. It assesses what fields are missing, groups
them, ranks which groups are easiest/most productive to work on, computes a budget-aware tier
allocation, and passes that information upstream. It does not write queries or decide search
strategy.

Internally it runs three functions in sequence:
- `computeNeedSet()` — per-field gap assessment + V4 search packs (Schema 2)
- `buildSearchPlanningContext()` — group-level aggregation, coverage/worthiness ranking,
  seed status, budget-aware tier allocation (Schema 3)
- `buildSearchPlan()` — LLM call for group-level annotations only (Schema 4, does NOT
  generate queries)

These are implementation details. The stage returns a clean 3-field contract:
```
{ focusGroups, seedStatus, seedSearchPlan }
```

Primary owners:
- `src/features/indexing/discovery/stages/needSet.js` — stage wrapper
- `src/indexlab/needsetEngine.js` — `computeNeedSet()`
- `src/indexlab/searchPlanningContext.js` — `buildSearchPlanningContext()`
- `src/indexlab/searchPlanBuilder.js` — `buildSearchPlan()`
- `src/indexlab/buildFieldHistories.js` — next-round memory (finalization only)

## Stage return contract

```js
{
  focusGroups: FocusGroup[],     // for Stage 03 tier-aware query generation
  seedStatus:  SeedStatus|null,  // for Stage 03 seed dispatch
  seedSearchPlan: Schema4|null,  // for finalization (bundles, profile_influence, deltas)
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
- Complete when: query searched + enough URLs scraped + at least 1 new field closed
- Cooldown: `seedCooldownMs` after successful completion
- NeedSet emits: `seed_status` with per-seed `last_status`, `cooldown_until_ms`,
  `new_fields_closed_last_run`

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
- `computeNeedSetFn` throws → logs `needset_computation_failed`, returns early with all nulls
- `buildSearchPlanningContextFn` throws → logs `search_planning_context_failed`, returns early
- `buildSearchPlanFn` throws → logs `schema4_computation_failed` (defensive — real function
  has internal catch and should never throw)

Previously a single try/catch misattributed all failures as `schema4_computation_failed`.

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
| `previousFieldHistories` | In-memory carry-forward from prior round | Partial — frontierDb `queries` covers some |
| `fieldOrder` | Static config: category authoring schema | No (and doesn't need to be) |
| `queryExecutionHistory` | **DB**: `frontierDb.buildQueryExecutionHistory()` | Yes |

Future SSOT migration requires extending the DB schema to persist provenance evidence arrays,
field search history (evidence_classes_tried, no_value_attempts), and identity intermediate
state.

## Internal logic

`computeNeedSet()`:
1. Collect field universe from `fieldOrder`, provenance keys, and rule keys
2. Normalize required levels to `identity | critical | required | expected | optional`
3. Normalize search hints into `query_terms`, `domain_hints`, `preferred_content_types`
4. Derive field state: `covered | missing | weak | conflict` → map to Schema 2 state
5. Compute reasons: `missing`, `conflict`, `low_conf`, `min_refs_fail`, `publish_gate_block`
6. Build per-field history from `previousFieldHistories` + current evidence
7. Build V4 search packs: `normalized_key`, `all_aliases`, `alias_shards`, `availability`,
   `difficulty`, `repeat_count`, `search_intent` (per-key, not per-group)
8. Compute `sorted_unresolved_keys` (availability → difficulty → repeat → need_score →
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
9. `pass_seed` — seed signals for Stage 03
10. `tier_allocation` — budget-aware slot distribution

`buildSearchPlan()` (LLM):
- Annotates groups with `reason_active`, `planner_confidence`
- Does NOT generate queries — `search_plan_handoff.queries` is always empty
- Returns `panel` for GUI display (bundles, profile_influence, deltas)

## Events emitted

1. `needset_computed` (scope: `schema2_preview`) — before LLM call. Fields, summary,
   blockers, planner_seed, deltas. Bundles and profile_influence are empty.
2. `needset_computed` (scope: `schema4_planner`) — after LLM call, only when panel exists.
   Includes Schema 4 panel data (bundles, profile_influence, deltas) plus Schema 2 fields.
3. `schema4_handoff_ready` — when handoff has queries (currently always empty).

## Important invariants

- NeedSet and Brand Resolver run in parallel via `Promise.all` — neither depends on the other
- Every field in `fieldOrder`, provenance, or rules appears in `fields[]`
- Round 0 history is zeroed; later rounds carry forward via `previousFieldHistories`
- `need_score` is zero for covered fields
- `search_intent` is per-key (from `exact_match_required`), not per-group
- `group_query_count` counts Tier 2 broad searches only, NOT per-key retries
- `group_search_worthy` uses `group_query_count`, not `group_key_retry_count`
- Phase is productivity-based AND budget-aware
- Seed completion requires `new_fields_closed >= 1`
- `passA_specs_seed` derives from `seedStatus.specs_seed.is_needed`, not round number
- `tier_allocation` mirrors Search Profile's priority order (seeds → groups → keys)
- `configInt` is now clamped to registry `min`/`max` with NaN fallback to registry default
- `bestTierSeen` returns `null` (not `Infinity`) when all evidence tiers >= 99
- `computeDeltas` null-guards entries before accessing `.field_key`/`.state`

## What it feeds next

- **Stage 03 Search Profile**: `focusGroups` + `seedStatus` — determines which tier to
  operate in via `determineQueryModes()`, fires tier builders
- **Finalization**: `seedSearchPlan` — bundles, profile_influence, deltas, and
  `search_plan_handoff.queries` for `enrichNeedSetFieldHistories()`
- **Next round**: `previousFieldHistories` extracted from `fields[].history` by
  `buildPreviousFieldHistories()` in `runUntilComplete.js`

## Schema files in this folder

- `01-needset-input.json` — input contracts with data origin map
- `01-needset-output.json` — stage return + FocusGroup shape + SeedStatus shape + Schema 2 + Schema 4
