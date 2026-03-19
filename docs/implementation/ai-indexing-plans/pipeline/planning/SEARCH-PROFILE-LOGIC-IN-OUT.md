# Search Profile Logic In And Out

Validated against live code on 2026-03-18.

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
- `focusGroups`

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
4. Build deterministic `query_rows` from:
   - archetype planner rows
   - uncovered hard-field rows
   - field-rule `search_hints`
   - domain-hint soft-bias rows
   - alias-driven rows
   - learned field templates
   - learned brand templates
5. Interleave query rows round-robin by target field.
6. Dedupe and cap selected queries.
7. Produce support blocks such as:
   - `field_target_queries`
   - `doc_hint_queries`
   - `archetype_summary`
   - `coverage_analysis`
   - `hint_source_counts`
   - field-rule gate/hint counts

`runSearchProfile()` then optionally adds:

- `effective_host_plan` through `buildEffectiveHostPlan()`
- `hostPlanQueryRows` through `buildScoredQueryRowsFromHostPlan()`

Those host-plan rows are not part of `buildSearchProfile()` output. They are appended later during Query Journey after a separate guard pass.

## Important invariants

- Search Profile always runs when the canonical discovery pipeline runs, even if Schema 4 is disabled or empty.
- Stage 04 Search Planner does consume Search Profile now:
  - `base_templates`
  - targeted query rows
  - `archetype_summary`
  - `coverage_analysis`
- `effective_host_plan` is optional and can be blocked by registry population rules.
- Search Profile itself does not emit `search_profile_generated`. That event is emitted by Query Journey when the planned artifact is written.
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

- Stage 04 Search Planner with `base_templates`, targeted rows, and archetype/coverage context
- Stage 05 Query Journey with deterministic `query_rows`, `variant_guard_terms`, and optional `effective_host_plan`

It also becomes the main discovery review artifact once execution finishes.
