# NeedSet Logic In And Out

Validated against live code on 2026-03-20. round_mode retired. Round-over-round history feedback loop wired.

## What this stage is

NeedSet is the Stage 01 discovery boundary. It assesses what fields are missing, groups them, ranks which groups are easiest/most productive to work on, computes a budget-aware tier allocation, and passes that information upstream. It does not write queries or decide search strategy.

- Schema 2 via `computeNeedSet()` — per-field gap assessment + V4 search packs
- Schema 3 via `buildSearchPlanningContext()` — group-level aggregation, coverage/worthiness ranking, seed status, budget-aware tier allocation
- Schema 4 via `buildSearchPlan()` — LLM call for group-level annotations only (does NOT generate queries)

Primary owners:

- `src/features/indexing/discovery/stages/needSet.js`
- `src/indexlab/needsetEngine.js`
- `src/indexlab/searchPlanningContext.js`
- `src/indexlab/searchPlanBuilder.js`
- `src/indexlab/buildFieldHistories.js` for next-round memory only

`buildFieldHistories()` runs later in finalization and prepares the next round's `previousFieldHistories`. It is not called from inside `computeNeedSet()`.

## Three-Tier Search Model

NeedSet packages data for three downstream query tiers:

### Tier 1 — Broad Seeds
- `{brand} {model} {variant} specifications`
- `{brand} {model} {variant} {source}`
- Complete when: query searched + enough URLs scraped + at least 1 new field closed
- Cooldown: `seedCooldownMs` (default 30 days) after successful completion
- NeedSet emits: `seed_status` with per-seed `last_status`, `cooldown_until_ms`, `new_fields_closed_last_run`

### Tier 2 — Group Searches
- `{brand} {model} {variant} {group} {description}`
- Skip logic: `group_search_worthy` boolean based on coverage ratio, unresolved count, and `group_query_count` (broad group queries, NOT individual key retries)
- NeedSet emits: `group_description_short`, `group_description_long`, `coverage_ratio`, `group_fingerprint_coarse`/`fine`

### Tier 3 — Individual Key Searches (progressive enrichment)
- Progressively enriched per-key based on `repeat_count` (how many times that specific key has been searched, not which round):
  - `repeat_count=0` (3a): `{brand} {model} {variant} {key}` — bare query
  - `repeat_count=1` (3b): `+ {aliases}` — aliases carried forward on all subsequent passes
  - `repeat_count=2` (3c): `+ {untried domain hint}` — prefers domains not in `domains_tried_for_key`
  - `repeat_count=3+` (3d): `+ {untried content type}` — prefers types not in `content_types_tried_for_key`
- Each pass is cumulative — 3c includes aliases from 3b, 3d includes both aliases and domain hints
- NeedSet emits enriched `normalized_key_queue` objects per group with: `normalized_key`, `repeat_count`, `all_aliases`, `alias_shards`, `domain_hints`, `preferred_content_types`, `domains_tried_for_key`, `content_types_tried_for_key`
- `repeat_count` is tracked via `query_count` in `previousFieldHistories`, incremented by `buildFieldHistories()` at finalization based on `target_fields` attribution

NeedSet does NOT write queries. Its job is to say "these groups are easiest/most productive — focus on them now" and pass enriched descriptions and field packs upstream. When those groups are checked off, it surfaces the next batch. Search Profile and Search Planner do the actual query construction.

## Schema files in this folder

- `01-needset-input.json`
- `01-needset-output.json`
- `01-needset-planner-context.json`
- `01-needset-planner-output.json`

## Inputs in

`runNeedSet()` receives stage seams plus the same raw data that eventually feeds `computeNeedSet()`:

- run identity: `runId`, `category`, `productId`
- round metadata: `round`, `roundMode`
- product identity: `brand`, `model`, `baseModel`, `aliases`
- evidence state: `fieldOrder`, `provenance`, `fieldRules`, `fieldReasoning`, `constraintAnalysis`
- identity state: `identityContext`
- prior memory: `previousFieldHistories`
- `queryExecutionHistory` — per-query completion state with structured metadata (`tier`, `group_key`, `normalized_key`, `source_name`). Wired through to `buildSearchPlanningContextFn`. Null on round 0.
- stage services: `computeNeedSetFn`, `buildSearchPlanningContextFn`, `buildSearchPlanFn`

`buildSearchPlanningContext()` also accepts:

- `queryExecutionHistory` — passed through from `runNeedSet`. Used by `deriveSeedStatus()`, `computeGroupQueryCount()`, and `computeTierAllocation()`.
- `config` — reads `searchProfileQueryCap` for budget-aware tier allocation.

`buildFieldHistories()` later consumes:

- `previousFieldHistories`
- completed-round `provenance`
- completed-round planner queries
- duplicate suppression counts

## Live logic

`computeNeedSet()` currently does this:

1. Collect the field universe from `fieldOrder`, provenance keys, and rule keys.
2. Normalize required level to `identity | critical | required | expected | optional`.
3. Normalize search hints into `query_terms`, `domain_hints`, `preferred_content_types`, `tooltip_md`, `aliases`.
4. Derive internal field state as `covered | missing | weak | conflict`, then map to Schema 2 state `accepted | unknown | weak | conflict`.
5. Compute emitted reasons: `missing`, `conflict`, `low_conf`, `min_refs_fail`, `publish_gate_block`.
6. Build per-field history from `previousFieldHistories` plus current evidence (includes V4 `query_modes_tried_for_key`).
7. Build V4 per-field search packs: `normalized_key`, `all_aliases`, `alias_shards`, `availability`, `difficulty`, `repeat_count`, `search_intent` (per-key, not per-group — derived from `exact_match_required`).
8. Compute `sorted_unresolved_keys` using V4 ordering (availability -> difficulty -> repeat -> need_score -> required_level).
9. Compute unresolved-field bundles, `rows`, `profile_mix`, `focus_fields`, `summary`, `blockers`, and `planner_seed`.

`buildSearchPlanningContext()` adds V4 group-level extensions:

1. `group_description_short` / `group_description_long` — enriched, longer versions of the catalog `desc` so Search Profile has a better description to use in `{brand} {model} {variant} {group} {description}` queries
2. `coverage_ratio`, `total_field_count`, `resolved_field_count`
3. `group_query_count` (from `queryExecutionHistory`, counts Tier 2 broad searches only) vs `group_key_retry_count` (sum of individual key retries)
4. `group_search_worthy` + `skip_reason` — determines if downstream should emit a Tier 2 group search or skip to Tier 3 keys
5. `group_fingerprint_coarse` (stable = `group_key`) / `group_fingerprint_fine` (changes with unresolved set)
6. `normalized_key_queue` — V4-sorted unresolved keys per group
7. `productivity_score` — per-group ranking score (availability + difficulty + volume + need_score - repeat penalty)
8. `seed_status` — per-seed completion with `last_status`, cooldown, `new_fields_closed`. Derived from `queryExecutionHistory` via `deriveSeedStatus()`. Uses actual completion status, not round number.
9. `pass_seed` — expanded seed signals: `passA_specs_seed`, `passA_source_candidates`, `passA_target_groups`, `passB_group_queue` (search-worthy group keys), `passB_key_queue` (individual keys from non-worthy groups)
10. `tier_allocation` — budget-aware slot distribution via `computeTierAllocation()`

### Budget-aware tier allocation (new)

`computeTierAllocation(seedStatus, focusGroups, queryBudget)` mirrors Search Profile's priority order (seeds first → groups → keys) to pre-compute how many queries go to each tier. The query budget comes from `searchProfileQueryCap` setting (default 10).

Output shape: `{ budget, tier1_seed_count, tier2_group_count, tier3_key_count, tier1_seeds[], tier2_groups[], tier3_keys[], overflow_group_count, overflow_key_count }`

### Budget-aware phase assignment

Phase assignment is productivity-based AND budget-aware:

- Round 0 (Tier 1 seeds first): all unresolved groups are `next`
- Round 1+: seed slots computed from `seed_status`. Remaining budget (`queryBudget - seedSlots`) limits how many search-worthy groups become `now`. Groups sorted by `productivity_score` descending — only the top N that fit become `now`, rest stay `next`. Non-worthy groups stay `next` (their keys may fire as Tier 3 but the group itself isn't getting a broad search).
- Resolved or all-exhausted groups: `hold`

Productivity score rewards easy-to-find fields (high availability), easy-to-extract fields (low difficulty), more unresolved fields per group (more bang per broad search), and higher need_score. It penalizes groups already searched multiple times. `required_level` only matters as a tie-break through `need_score`.

`runNeedSet()` then:

1. calls `buildSearchPlanningContext()` on the Schema 2 output
2. emits `needset_computed` with `scope: "schema2_preview"` before the Schema 4 LLM call
3. calls `buildSearchPlan()` — LLM assesses groups (`reason_active`, `planner_confidence`) but does NOT generate queries. Query authoring belongs to Search Profile (deterministic tiers) and Search Planner (LLM enrichment).
4. emits `needset_computed` again with `scope: "schema4_planner"` when `schema4.panel` exists. Panel bundles do not carry queries. `profile_influence` shows budget-aware targeting: `targeted_specification`, `targeted_sources`, `targeted_groups`, `targeted_single` (all allocation-based when `tier_allocation` exists), plus `budget`, `allocated`, `overflow_groups`, `overflow_keys`, group phase counts, and `planner_confidence`.
5. `searchPlanHandoff.queries` is always empty — NeedSet does not author queries
6. emits `schema4_handoff_ready` when the handoff metadata is non-empty

## Important invariants

- Canonical stage order is NeedSet first, Brand Resolver second.
- Every field seen in `fieldOrder`, provenance, or rules is present in `fields[]`.
- Round 0 history is zeroed. Later rounds carry forward `existing_queries`, `domains_tried`, host/evidence classes, counters, and `query_modes_tried_for_key`.
- `need_score` is zero for covered fields and weighted by required level plus reason count for unresolved fields.
- `search_intent` is per-key (derived from `exact_match_required`), not per-group. Groups do not have `search_intent` or `host_class`.
- `group_query_count` counts actual Tier 2 broad group searches, NOT the sum of individual key retries. This prevents false exhaustion.
- `group_search_worthy` uses `group_query_count`, not `group_key_retry_count`.
- Phase is productivity-based AND budget-aware: groups ranked by `productivity_score`, only the top N that fit the query budget become `now`. Round 0 → all groups `next` (seeds first).
- Tier escalation is natural: Tier 1 seeds → Tier 2 group searches (groups with `group_search_worthy = true`) → Tier 3 individual keys (remaining fields via `normalized_key_queue`). Groups should be searched before individual keys because broad searches net more results.
- Seed completion requires `new_fields_closed >= 1`. Scraping 10 pages with 0 new fields = failed, no cooldown.
- `queryExecutionHistory` is built from `frontierDb.buildQueryExecutionHistory(productId)` in `runDiscoverySeedPlan` and wired through `runNeedSet` to `buildSearchPlanningContext`. Contains per-query `tier`, `group_key`, `normalized_key`, `status`, `completed_at_ms` from frontier records. Null-safe on round 0 (returns `{ queries: [] }`).
- `previousFieldHistories` is extracted from `roundResult.needSet.fields[].history` by `buildPreviousFieldHistories()` in `runUntilComplete.js` and passed via `roundContext` to the next round. This enables `repeat_count` accumulation, `domains_tried_for_key` tracking, and progressive Tier 3 enrichment across rounds.
- `passA_specs_seed` is derived from `seedStatus.specs_seed.is_needed` (actual completion status), not from round number. Without execution history, specs seed is always needed.
- `tier_allocation` mirrors Search Profile's priority order so the dashboard shows exactly what will execute.
- Frontier DB records tier metadata (`tier`, `group_key`, `normalized_key`, `hint_source`) per query at fire-time via `resolveSelectedQueryRow()` in `discoverySearchExecution.js`.

## Outputs out

`computeNeedSet()` returns `schema_version: "needset_output.v2.1"` and includes Schema 2 blocks, V4 additions, and backward-compat fields.

Primary blocks:

- `round`, `round_mode`
- `identity`
- `fields` (with V4 per-field search packs)
- `planner_seed`
- `sorted_unresolved_keys` (V4: availability -> difficulty -> repeat -> need_score -> required_level)
- `summary`, `blockers`

Each `fields[]` entry includes:

- identity and grouping: `field_key`, `label`, `group_key`, `required_level`
- normalized hints: `idx.min_evidence_refs`, `idx.query_terms`, `idx.domain_hints`, `idx.preferred_content_types`, `idx.tooltip_md`, `idx.aliases`
- evidence state: `state`, `value`, `confidence`, `effective_confidence`, `refs_found`, `min_refs`, `best_tier_seen`, `pass_target`, `meets_pass_target`, `exact_match_required`
- planning state: `need_score`, `reasons`, `history`
- V4 search pack: `normalized_key`, `all_aliases`, `alias_shards`, `availability`, `difficulty`, `repeat_count`, `search_intent` (per-key: `exact_match` or `broad`), `query_modes_tried_for_key`, `domains_tried_for_key`, `content_types_tried_for_key`

`buildSearchPlanningContext()` returns `schema_version: "search_planning_context.v2.1"` with V4 additions:

- Each `focus_groups[]` entry adds: `group_description_short`, `group_description_long`, `total_field_count`, `resolved_field_count`, `coverage_ratio`, `group_query_count`, `group_key_retry_count`, `group_search_worthy`, `skip_reason`, `group_fingerprint_coarse`, `group_fingerprint_fine`, `normalized_key_queue`, `group_search_terms`, `content_type_candidates`, `domains_tried_for_group`, `productivity_score`
- Removed from focus_groups: `search_intent` (now per-key on Schema 2 field entry), `host_class` (removed — not a group-level concept)
- Top-level: `seed_status` (per-seed completion state), `pass_seed` (expanded: `passA_*` + `passB_group_queue` + `passB_key_queue`), `tier_allocation` (budget-aware slot distribution)

Backward-compat blocks still emitted: `run_id`, `category`, `product_id`, `generated_at`, `total_fields`, `focus_fields`, `bundles`, `profile_mix`, `rows`, `debug`.

## Side effects and persistence

- `computeNeedSet()` has no storage writes.
- `runNeedSet()` emits: preview `needset_computed`, optional Schema 4 `needset_computed`, optional `schema4_handoff_ready`.

## What it feeds next

NeedSet feeds:

- Stage 02 Brand Resolver only by pipeline sequencing
- Stage 03 Search Profile through `focusGroups` and `seedStatus` — NeedSet tells Search Profile which tier to operate in via `seed_status` (Tier 1), `group_search_worthy` (Tier 2), and `normalized_key_queue` (Tier 3). Search Profile uses `determineQueryModes()` to read these signals and fires the appropriate tier builders.
- Stage 04 Search Planner through `searchPlanHandoff` (metadata only, no queries)
- later-round anti-repeat behavior through `previousFieldHistories`

`buildFieldHistories()` closes the loop after the round finishes.
