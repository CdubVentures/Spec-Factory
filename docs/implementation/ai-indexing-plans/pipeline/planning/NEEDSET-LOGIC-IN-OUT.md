# NeedSet Logic In And Out

Validated against live code on 2026-03-18.

## What this stage is

NeedSet is the Stage 01 discovery boundary. The core Schema 2 gap model still comes from `computeNeedSet()`, but the live stage wrapper now owns the whole Schema 2 -> Schema 3 -> Schema 4 handoff:

- Schema 2 via `computeNeedSet()`
- Schema 3 via `buildSearchPlanningContext()`
- Schema 4 via `buildSearchPlan()`

Primary owners:

- `src/features/indexing/discovery/stages/needSet.js`
- `src/indexlab/needsetEngine.js`
- `src/indexlab/searchPlanningContext.js`
- `src/indexlab/searchPlanBuilder.js`
- `src/indexlab/buildFieldHistories.js` for next-round memory only

`buildFieldHistories()` is part of the same round-memory story, but it runs later in finalization and prepares the next round's `previousFieldHistories`. It is not called from inside `computeNeedSet()`.

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
- stage services: `computeNeedSetFn`, `buildSearchPlanningContextFn`, `buildSearchPlanFn`

`buildFieldHistories()` later consumes:

- `previousFieldHistories`
- completed-round `provenance`
- completed-round planner queries
- duplicate suppression counts

## Live logic

`computeNeedSet()` currently does this:

1. Collect the field universe from `fieldOrder`, provenance keys, and rule keys.
2. Normalize required level to `identity | critical | required | expected | optional`.
3. Normalize search hints into:
   - `query_terms`
   - `domain_hints`
   - `preferred_content_types`
   - `tooltip_md`
   - `aliases`
4. Derive internal field state as `covered | missing | weak | conflict`, then map the public Schema 2 state to `accepted | unknown | weak | conflict`.
5. Compute the emitted reasons:
   - `missing`
   - `conflict`
   - `low_conf`
   - `min_refs_fail`
   - `publish_gate_block`
6. Build per-field history from `previousFieldHistories` plus current evidence.
7. Compute unresolved-field bundles, `rows`, `profile_mix`, `focus_fields`, `summary`, `blockers`, and `planner_seed`.

`runNeedSet()` then:

1. calls `buildSearchPlanningContext()` on the Schema 2 output
2. emits `needset_computed` with `scope: "schema2_preview"` before the Schema 4 LLM call
3. calls `buildSearchPlan()`
4. emits `needset_computed` again with `scope: "schema4_planner"` when `schema4.panel` exists
5. attaches `_planner`, `_learning`, and `_panel` to `searchPlanHandoff` when queries exist
6. emits `schema4_handoff_ready` when the handoff is non-empty

Important correction: the code does not currently emit `tier_pref_unmet`. That comment exists as a future note, not live behavior.

## Important invariants

- Canonical stage order is NeedSet first, Brand Resolver second.
- Every field seen in `fieldOrder`, provenance, or rules is present in `fields[]`.
- Round 0 history is zeroed. Later rounds carry forward `existing_queries`, `domains_tried`, host/evidence classes, and counters.
- `need_score` is zero for covered fields and weighted by required level plus reason count for unresolved fields.
- `identityContext` affects the top-level `identity` block. Brand Resolver does not mutate NeedSet identity directly.
- GUI visibility does not wait for Schema 4: the preview `needset_computed` event is emitted before the Schema 4 LLM call.

## Outputs out

`computeNeedSet()` returns `schema_version: "needset_output.v2"` and includes both Schema 2 blocks and backward-compat fields.

Primary blocks:

- `round`
- `round_mode`
- `identity`
- `fields`
- `planner_seed`
- `summary`
- `blockers`

Backward-compat blocks still emitted:

- `run_id`
- `category`
- `product_id`
- `generated_at`
- `total_fields`
- `focus_fields`
- `bundles`
- `profile_mix`
- `rows`
- `debug`

Each `fields[]` entry includes:

- identity and grouping: `field_key`, `label`, `group_key`, `required_level`
- normalized hints: `idx.min_evidence_refs`, `idx.query_terms`, `idx.domain_hints`, `idx.preferred_content_types`, `idx.tooltip_md`, `idx.aliases`
- evidence state: `state`, `value`, `confidence`, `effective_confidence`, `refs_found`, `min_refs`, `best_tier_seen`, `pass_target`, `meets_pass_target`, `exact_match_required`
- planning state: `need_score`, `reasons`, `history`

`runNeedSet()` returns an in-memory stage payload:

- `schema2`
- `schema3`
- `seedSchema4`
- `searchPlanHandoff`
- `focusGroups`

`planner_seed` currently includes:

- `missing_critical_fields`
- `unresolved_fields`
- `existing_queries`
- `current_product_identity` with `category`, `brand`, `model`

## Side effects and persistence

- `computeNeedSet()` has no storage writes.
- No standalone `needset.json` artifact is written by this stage in the current seed-planning path.
- `runNeedSet()` emits:
  - preview `needset_computed`
  - optional Schema 4 `needset_computed`
  - optional `schema4_handoff_ready`

## What it feeds next

NeedSet feeds:

- Stage 02 Brand Resolver only by pipeline sequencing
- Stage 03 Search Profile through `focusGroups`
- Stage 04 Search Planner through `searchPlanHandoff`
- later-round anti-repeat behavior through `previousFieldHistories`

`buildFieldHistories()` closes the loop after the round finishes. That is the path that remembers dead-end queries, exhausted domains, and duplicate suppression for the next NeedSet.
