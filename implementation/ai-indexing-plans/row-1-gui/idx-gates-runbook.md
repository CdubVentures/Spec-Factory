# Tab 3 - Search Profile IDX Gates Runbook

Last updated: 2026-02-25

## Scope
This runbook explains how IDX gates are evaluated and displayed for Prefetch Search Profile (Tab 3), and how to debug wrong gate badge counts.

## Gate keys
IDX gating in prefetch uses these field-rule keys:
- `search_hints.query_terms`
- `search_hints.domain_hints`
- `search_hints.preferred_content_types`

`idx` and `indexlab` are treated as the same consumer system in gate resolution.

## Runtime behavior (source of truth)
Gate evaluation is per field key during query planning:
- File: `src/search/queryBuilder.js`
- Resolver: `resolveConsumerGate(fieldRule, <gateKey>, 'indexlab')`

For each target field:
- If `query_terms` gate is disabled, `search_hints.query_terms` is not used.
- If `domain_hints` gate is disabled, `search_hints.domain_hints` is not used.
- If `preferred_content_types` gate is disabled, `search_hints.preferred_content_types` is not used.

That means disabled gates do not contribute query terms/domain hints/content type suffixes for that field in that run.

## Run artifact fields (what should be stored per run)
`buildSearchProfile` writes both global and per-field gate snapshots:
- `field_rule_gate_counts`
- `field_rule_hint_counts_by_field`

Also present:
- `hint_source_counts` (query-source totals, not per-field IDX gate values)

Important:
- Per-row gate badges must use `field_rule_hint_counts_by_field` by target field.
- `hint_source_counts` must not be used as per-field badge counts.

## Runtime Ops route fallback behavior
Route: `GET /api/v1/indexlab/run/:runId/runtime/prefetch`
- File: `src/api/routes/runtimeOpsRoutes.js`
- If run artifact is missing gate snapshots, route hydrates from field rules files in this order:
1. `helper_files/<category>/_generated/field_rules.json`
2. `helper_files/<category>/_generated/field_rules.runtime.json`

Consequence:
- New runs with stored gate snapshots reflect run-time state.
- Older runs without snapshots can show current field-rules state via fallback.

## UI rendering rules (Tab 3 gate badges)
File: `tools/gui-react/src/pages/runtime-ops/panels/PrefetchSearchProfilePanel.tsx`

Row badge logic:
- Resolve by row primary target field from `field_rule_hint_counts_by_field`.
- Display `OFF` when gate status is disabled.
- Display numeric count when enabled (`0` is gray zero-state).
- Domain gate displays `X/Y` where:
  - `X` = effective domain hints used by runtime domain filtering (host-like entries).
  - `Y` = total configured `search_hints.domain_hints` values for that field.
- Do not show `Source: field_rules.search_hints` in row gate badges.

Status semantics:
- `off`: gate disabled by consumer override.
- `zero`: gate enabled but no values configured.
- `active`: gate enabled and value count > 0.

## Quick debug checklist
1. Check API payload for run:
   - `search_profile.field_rule_hint_counts_by_field`
   - `search_profile.field_rule_gate_counts`
2. If missing, verify server process is running latest code and restart `guiServer`.
3. Ensure GUI bundle is rebuilt (`tools/gui-react/dist`) if panel code changed.
4. Validate one row manually:
   - Row `target_fields[0]` -> `field_rule_hint_counts_by_field[targetField]`
   - Confirm `query_terms/domain_hints/preferred_content_types` values and status.
5. If values mismatch known field-studio/key-navigator data, inspect field-rules payload used for run and consumer overrides (`consumers.idx`/`consumers.indexlab`).

## Expected outcome when toggle is disabled
Per key, per run:
- Disabled gate contributes no values to query planning for that key.
- Badge shows `OFF` (gray), not a positive count.
