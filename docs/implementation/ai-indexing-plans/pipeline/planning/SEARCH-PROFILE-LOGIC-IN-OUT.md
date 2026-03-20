# Search Profile Logic In And Out

Validated against live code on 2026-03-20 (NeedSet now provides tier_allocation upstream).

## What this stage is

Search Profile is the deterministic Stage 03 query-profile layer built by `runSearchProfile()`. In the canonical 8-stage pipeline it runs after NeedSet and Brand Resolver, then feeds both Stage 04 Search Planner and Stage 05 Query Journey.

Primary owners:

- `src/features/indexing/discovery/stages/searchProfile.js`
- `src/features/indexing/search/queryBuilder.js`
- `src/features/indexing/search/queryHostPlanScorer.js`
- `src/features/indexing/discovery/domainHintResolver.js`
- `src/features/indexing/discovery/discoveryHelpers.js`

## Schema files in this folder

There is no dedicated numbered JSON schema file just for Search Profile.

Coverage is split across:

- `04-query-journey-output.json`
- the planned/executed `search_profile` artifacts written by runtime code

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
- `focusGroups` — from NeedSet Schema 3 with V4 extensions (`group_search_worthy`, `normalized_key_queue`, `productivity_score`, `group_description_long`)
- `seedStatus` — from NeedSet Schema 3 (`seed_status.specs_seed`, `seed_status.source_seeds`)

Optional host-plan enrichment also uses:

- `categoryConfig.validatedRegistry`
- field-rule-derived host-plan hint tokens
- brand-resolution host hints
- provider capabilities from configured search engines

## Live logic

`buildSearchProfile()` currently does this:

1. Resolve identity and build deterministic aliases.
2. Build `variant_guard_terms`.
3. Expand `categoryConfig.searchTemplates` into `base_templates`.
4. **Tier dispatch** via `determineQueryModes(seedStatus, focusGroups)`:
   - Returns 3 independent booleans: `runTier1Seeds`, `runTier2Groups`, `runTier3Keys`
   - All three can be true simultaneously (mixed tier mode)
   - When `seedStatus` is provided and any tier is active, tier builders run instead of the legacy archetype pipeline
   - When `seedStatus` is absent, falls through to the existing archetype pipeline (backward compat)
5. **Tier 1** (`buildTier1Queries`): `{brand} {model} {variant} specifications` + `{brand} {model} {variant} {source}` per needed source seed. Tagged `tier: 'seed'`, `hint_source: 'tier1_seed'`.
6. **Tier 2** (`buildTier2Queries`): one broad query per search-worthy group: `{brand} {model} {variant} {label} {group_description_long}`. Sorted by `productivity_score` descending. Tagged `tier: 'group_search'`, `hint_source: 'tier2_group'`, `group_key`.
7. **Tier 3** (`buildTier3Queries`): one query per key from `normalized_key_queue` for non-worthy groups: `{brand} {model} {variant} {key}`. Tagged `tier: 'key_search'`, `hint_source: 'tier3_key'`, `group_key`, `normalized_key`.
8. **Legacy path** (when no `seedStatus`): Build deterministic `query_rows` from archetype planner, field-rules, domain hints, aliases, learned templates. Interleave round-robin by target field.
9. Dedupe and cap selected queries.
10. Produce support blocks: `field_target_queries`, `doc_hint_queries`, `archetype_summary`, `coverage_analysis`, `hint_source_counts`, field-rule gate/hint counts.

`runSearchProfile()` then optionally adds:

- `effective_host_plan` through `buildEffectiveHostPlan()`
- `hostPlanQueryRows` through `buildScoredQueryRowsFromHostPlan()`

Those host-plan rows are not part of `buildSearchProfile()` output. They are appended later during Query Journey after a separate guard pass.

## Important invariants

- Search Profile always runs when the canonical discovery pipeline runs, even if Schema 4 is disabled or empty.
- Search Profile is fully deterministic — no LLM calls. Tier dispatch is based on NeedSet signals (`seed_status`, `group_search_worthy`, `normalized_key_queue`).
- When `seedStatus` is provided, `determineQueryModes()` gates which tiers fire. Tiers are independent — all three can be active simultaneously (e.g. Tier 2 for worthy groups + Tier 3 for exhausted groups' keys).
- When `seedStatus` is absent (backward compat), the legacy archetype pipeline runs unchanged.
- Stage 04 Search Planner consumes Search Profile: `base_templates`, targeted query rows, `archetype_summary`, `coverage_analysis`.
- `effective_host_plan` is optional and can be blocked by registry population rules.
- Search Profile emits `search_profile_generated` with the deterministic query count and row details.
- Search Profile is a deterministic base, not the final query-selection authority. Query Journey still dedupes, ranks, guards, and appends host-plan rows.

## Outputs out

`buildSearchProfile()` returns a deterministic base object containing:

- `category`
- `identity`
- `variant_guard_terms`
- `identity_aliases`
- `alias_reject_log`
- `query_reject_log`
- `negative_terms`
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
- `effectiveHostPlan`
- `hostPlanQueryRows`

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
- `effective_host_plan`
- `brand_resolution`
- optional `schema4_planner`, `schema4_learning`, `schema4_panel`
- artifact keys: `key`, `run_key`, `latest_key`

After SERP triage, `processDiscoveryResults()` rewrites the same payload family to `status: "executed"` and adds:

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

The persisted payload family is written later by Query Journey and then rewritten by SERP triage:

- `_discovery/{category}/{runId}.search_profile.json`
- `{category}/{productId}/runs/{runId}/analysis/search_profile.json`
- `{category}/{productId}/latest/search_profile.json`

## What it feeds next

Search Profile feeds:

- Stage 04 Search Planner with `searchProfileBase` containing tier-tagged `query_rows` and `base_templates` (query history). Search Planner enhances query strings via LLM while preserving all tier metadata.
- Stage 05 Query Journey receives the enhanced rows from Search Planner (not directly from Search Profile). Query Journey also reads `variant_guard_terms` and `query_reject_log` from `searchProfileBase`, and appends optional `hostPlanQueryRows`.

The `searchProfileQueryCap` setting is the sole controller for total query count. Search Planner is 1:1 (same row count in/out), so the cap applies at Query Journey.

It also becomes the main discovery review artifact once execution finishes.

### Tier-aware consumption (implemented)

NeedSet tells Search Profile which tier to operate in. Search Profile reads the signals and fires the appropriate builders:

- **Tier 1**: `seed_status.specs_seed.is_needed` and `seed_status.source_seeds[name].is_needed` → `buildTier1Queries()` emits broad seed queries
- **Tier 2**: `focus_group.group_search_worthy === true` → `buildTier2Queries()` emits one broad query per worthy group, sorted by `productivity_score`. Uses `group_description_long` as the enriched description.
- **Tier 3**: `focus_group.group_search_worthy === false` with non-empty `normalized_key_queue` → `buildTier3Queries()` emits one query per key with progressive enrichment based on per-key `repeat_count`:
  - 3a (repeat=0): bare `{product} {key}`
  - 3b (repeat=1): `+ aliases` (cumulative — carried on all subsequent passes)
  - 3c (repeat=2): `+ untried domain hint` (prefers `domain_hints` not in `domains_tried_for_key`)
  - 3d (repeat=3+): `+ untried content type` (prefers `preferred_content_types` not in `content_types_tried_for_key`)
  - `repeat_count` is per-key (how many times that key was searched), not per-round
- **Mixed mode**: Tier 2 + Tier 3 can run simultaneously when some groups are still worth broad searching while others are exhausted.
- **Backward compat**: When `seedStatus` is not passed, the legacy archetype pipeline runs unchanged.

### Budget alignment with NeedSet (new)

NeedSet now pre-computes a `tier_allocation` that mirrors Search Profile's priority order (seeds → groups → keys). This means the NeedSet dashboard shows accurate counts of what Search Profile will actually build. Search Profile's own budget-slicing logic (`maxQueryCap`, priority fill) is unchanged — the tier_allocation is a read-ahead estimate for the dashboard, not a binding instruction to Search Profile.
