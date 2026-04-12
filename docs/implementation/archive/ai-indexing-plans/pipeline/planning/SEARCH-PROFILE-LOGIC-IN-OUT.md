# Search Profile Logic In And Out

Validated against live code on 2026-03-23. Legacy archetype pipeline removed — tier-only is the sole query generation path. P5: cumulative Zod checkpoint validates output at `afterProfile`.

## What this phase is

Search Profile is the deterministic Search Profile phase query-profile layer built by `runSearchProfile()`. It is the **convergence point** of the pipeline -- the first phase that requires output from both NeedSet (focusGroups, seedStatus) and Brand Resolver (brandResolution). NeedSet and Brand Resolver run in parallel via `Promise.all`; after both complete, the orchestrator applies brand promotions and resolves identity/learning context, then feeds everything into Search Profile. See `03-pipeline-context.json` for the full accumulated state at this convergence point. Search Profile then feeds both Search Planner and Query Journey.

Primary owners:

- `src/features/indexing/pipeline/searchProfile/runSearchProfile.js`
- `src/features/indexing/search/queryBuilder.js`
- `src/features/indexing/pipeline/shared/helpers.js`

## Schema files in this folder

- `03-pipeline-context.json` -- the PipelineContext convergence document (replaces the former `03-search-profile-input.json`). Search Profile's input IS the PipelineContext -- the accumulated state from NeedSet+Brand Resolver plus orchestrator glue.
- `03-search-profile-output.json`

## Inputs in

`runSearchProfile()` is built from:

- resolved identity from `job`
- `missingFields`
- learning inputs:
  - merged lexicon
  - learned query templates
  - optional field-yield-by-domain
- optional `brandResolution`
- `config` and derived search-profile caps
- `variables`
- `focusGroups` — from search planning context with V4 extensions (`group_search_worthy`, `normalized_key_queue`, `productivity_score`, `group_description_long`)
- `seedStatus` — from search planning context (`seed_status.specs_seed`, `seed_status.source_seeds`)

## Live logic

`buildSearchProfile()` currently does this:

1. Resolve identity and build deterministic aliases.
2. Build `variant_guard_terms`.
3. Expand `categoryConfig.searchTemplates` into `base_templates`.
4. **Tier dispatch** via `determineQueryModes(seedStatus, focusGroups)`:
   - Returns 3 independent booleans: `runTier1Seeds`, `runTier2Groups`, `runTier3Keys`
   - All three can be true simultaneously (mixed tier mode)
5. **Tier 1** (`buildTier1Queries`): `{brand} {model} {variant} specifications` + `{brand} {model} {variant} {source}` per needed source seed. Tagged `tier: 'seed'`, `hint_source: 'tier1_seed'`.
6. **Tier 2** (`buildTier2Queries`): one broad query per search-worthy group: `{brand} {model} {variant} {label} {group_description_long}`. Sorted by `productivity_score` descending. Tagged `tier: 'group_search'`, `hint_source: 'tier2_group'`, `group_key`.
7. **Tier 3** (`buildTier3Queries`): one query per key from `normalized_key_queue` for non-worthy groups: `{brand} {model} {variant} {key}`. Tagged `tier: 'key_search'`, `hint_source: 'tier3_key'`, `group_key`, `normalized_key`.
8. Dedupe and cap selected queries.
9. Produce support blocks: `field_target_queries`, `doc_hint_queries`, `coverage_analysis`, `hint_source_counts`, field-rule gate/hint counts.

`runSearchProfile()` returns `{ searchProfileBase }` -- the deterministic profile is the sole output.

## Important invariants

- Search Profile always runs when the canonical discovery pipeline runs, even if the search plan is disabled or empty.
- Search Profile is fully deterministic — no LLM calls. Tier dispatch is based on NeedSet signals (`seed_status`, `group_search_worthy`, `normalized_key_queue`).
- `determineQueryModes()` gates which tiers fire. Tiers are independent — all three can be active simultaneously (e.g. Tier 2 for worthy groups + Tier 3 for exhausted groups' keys).
- The legacy archetype pipeline has been removed. Tier-only is the sole query generation path.
- Search Planner consumes Search Profile: `base_templates`, targeted query rows, `coverage_analysis`.
- Search Profile emits `search_profile_generated` with the deterministic query count and row details.
- Search Profile is a deterministic base, not the final query-selection authority. Query Journey still dedupes, ranks, and guards.
- Query Journey preserves the deterministic `query_rows` as `deterministic_query_rows` on `searchProfilePlanned`. The GUI Search Profile panel reads `deterministic_query_rows` to show what this phase actually produced, not LLM-enhanced versions from downstream.

## Outputs out

`buildSearchProfile()` returns a deterministic base object containing:

- `category`
- `identity`
- `variant_guard_terms`
- `identity_aliases`
- `alias_reject_log`
- `query_reject_log`
- `focus_fields`
- `base_templates`
- `query_rows`
- `queries`
- `targeted_queries`
- `field_target_queries`
- `doc_hint_queries`
- `archetype_summary`
- `coverage_analysis`
- `hint_source_counts`
- `field_rule_gate_counts`
- `field_rule_hint_counts_by_field`

`runSearchProfile()` returns:

- `searchProfileBase`

Later, Query Journey turns that into a persisted planned artifact by adding:

- `category`, `product_id`, `run_id`
- `base_model`
- `aliases`
- `generated_at`
- `status: "planned"`
- `provider`
- `llm_queries`
- `query_guard`
- `selected_queries`
- `selected_query_count`
- `brand_resolution`
- optional `search_plan_planner`, `search_plan_learning`, `search_plan_panel`
- artifact keys: `key`, `run_key`, `latest_key`

After Result Processing, `processDiscoveryResults()` rewrites the same payload family to `status: "executed"` and adds:

- `query_stats`
- `discovered_count`
- `approved_count`
- `candidate_count`
- `llm_query_planning`
- `llm_query_model`
- `llm_serp_triage`
- `llm_serp_triage_model`
- `serp_explorer`

## Side effects and persistence

Search Profile generation itself is in-memory only.

The persisted payload family is written later by Query Journey and then rewritten by Result Processing:

- `_discovery/{category}/{runId}.search_profile.json`
- `{category}/{productId}/runs/{runId}/analysis/search_profile.json`
- `{category}/{productId}/latest/search_profile.json`

## What it feeds next

Search Profile feeds:

- Search Planner with `searchProfileBase` containing tier-tagged `query_rows` and `base_templates` (query history). Search Planner enhances query strings via LLM while preserving all tier metadata.
- Query Journey receives the enhanced rows from Search Planner (not directly from Search Profile). Query Journey also reads `variant_guard_terms` and `query_reject_log` from `searchProfileBase`.

The `searchProfileQueryCap` setting is the sole controller for total query count. Search Planner is 1:1 (same row count in/out), so the cap applies at Query Journey.

It also becomes the main discovery review artifact once execution finishes.

### Tier-aware consumption (implemented)

NeedSet tells Search Profile which tier to operate in. Search Profile reads the signals and fires the appropriate builders:

- **Tier 1**: `seed_status.specs_seed.is_needed` and `seed_status.source_seeds[name].is_needed` -> `buildTier1Queries()` emits broad seed queries
- **Tier 2**: `focus_group.group_search_worthy === true` -> `buildTier2Queries()` emits one broad query per worthy group, sorted by `productivity_score`. Uses `group_description_long` as the enriched description.
- **Tier 3**: `focus_group.group_search_worthy === false` with non-empty `normalized_key_queue` -> `buildTier3Queries()` emits one query per key with progressive enrichment based on per-key `repeat_count`:
  - 3a (repeat=0): bare `{product} {key}`
  - 3b (repeat=1): `+ aliases` (cumulative — carried on all subsequent passes)
  - 3c (repeat=2): `+ untried domain hint` (prefers `domain_hints` not in `domains_tried_for_key`)
  - 3d (repeat=3+): `+ untried content type` (prefers `preferred_content_types` not in `content_types_tried_for_key`)
  - `repeat_count` is per-key (how many times that key was searched), not per-round
- **Mixed mode**: Tier 2 + Tier 3 can run simultaneously when some groups are still worth broad searching while others are exhausted.
- **Backward compat**: When `seedStatus` is not passed, the legacy archetype pipeline runs unchanged.

### Budget alignment with NeedSet (new)

NeedSet now pre-computes a `tier_allocation` that mirrors Search Profile's priority order (seeds -> groups -> keys). This means the NeedSet dashboard shows accurate counts of what Search Profile will actually build. Search Profile's own budget-slicing logic (`maxQueryCap`, priority fill) is unchanged — the tier_allocation is a read-ahead estimate for the dashboard, not a binding instruction to Search Profile.
