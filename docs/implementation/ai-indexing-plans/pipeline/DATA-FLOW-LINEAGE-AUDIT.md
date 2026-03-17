# Data Flow Lineage Audit — Stages 1-3

Scope: Runtime start → NeedSet → Planning Context → Brand Resolution → Search Plan (Schema 4 handoff).
Audit date: 2026-03-16. Covers every field at each stage boundary.

## Transformation Tags

| Tag | Meaning |
|-----|---------|
| **passthrough** | Field passes unchanged from input to output |
| **normalized** | Formatting/cleaning (lowercase, trim, dedup) — same semantic value |
| **recomputed** | Value recalculated or derived from other input fields |
| **enriched** | New information added (LLM, catalog metadata, cross-reference) |
| **dropped** | Present in input, absent in output (by design) |

---

## Boundary 1 — Runtime → Schema 2 (NeedSetOutput)

Producer: `needsetEngine.computeNeedSet()`
Source files: `needsetEngine.js:342-604`, `buildFieldHistories.js`

### Run Context

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `round` | **passthrough** | caller param | incremented externally by convergence loop |
| `round_mode` | **passthrough** | caller param `roundMode` | seed / carry_forward / repair |

### Identity Block

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `identity.state` | **recomputed** | `mapIdentityState(identityContext)` | maps lock status → PanelIdentityState enum |
| `identity.source_label_state` | **recomputed** | `deriveSourceLabelState(identityContext)` | matched/possible/different/unknown from confidence+contradictions |
| `identity.confidence` | **normalized** | `identityContext.confidence` | clamped via `toNumber(..., 0)` |
| `identity.manufacturer` | **normalized** | `brand \|\| identityContext.manufacturer` | string coercion + trim |
| `identity.model` | **passthrough** | caller param `model` | |
| `identity.official_domain` | **passthrough** | `identityContext.official_domain` | null when absent |
| `identity.support_domain` | **passthrough** | `identityContext.support_domain` | null when absent |
| `identity.publishable` | **dropped** | — | not relevant for indexing phase |
| `identity.review_required` | **dropped** | — | review phase handles this |

### Settings Block

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| entire `settings` block | **dropped** | — | config flows directly to Schema 3 via `derivePlannerLimits()` — never transits Schema 2 |

### Per-Field Array (`fields[]`)

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `field_key` | **recomputed** | `collectFieldKeys()` | union of fieldOrder + provenance + fieldRules keys |
| `label` | **passthrough** | `rule.display_name \|\| rule.ui?.label` | from field_rules JSON |
| `group_key` | **passthrough** | `rule.group` | from field_rules JSON |
| `idx.required_level` | **normalized** | `normalizeRequiredLevel(rule)` | maps to RequiredLevel enum |
| `idx.min_evidence_refs` | **normalized** | `rule.min_evidence_refs` | `toNumber(..., 0)` |
| `idx.query_terms` | **normalized** | `rule.search_hints.query_terms` | lowercase, trim, dedup via `normalizeStringArray()` |
| `idx.domain_hints` | **normalized** | `rule.search_hints.domain_hints` | canonical host form via `normalizeDomainHints()` |
| `idx.preferred_content_types` | **normalized** | `rule.search_hints.preferred_content_types` | lowercase, trim, dedup |
| `idx.tooltip_md` | **passthrough** | `rule.ui?.tooltip_md` | null when absent |
| `idx.aliases` | **passthrough** | `rule.aliases` | empty array when absent |
| `pass_target` | **normalized** | `prov.pass_target` | `clamp01(toNumber(..., 0.8))` |
| `exact_match_required` | **passthrough** | `rule.contract?.exact_match` | boolean coercion |
| `current.status` | **recomputed** | `mapInternalToSchemaState()` | covered→accepted, missing→unknown |
| `current.value` | **passthrough** | `prov.value` | null when absent |
| `current.confidence` | **normalized** | provenance confidence | `toNumber(..., 0)` |
| `current.effective_confidence` | **normalized** | provenance confidence | `clamp01(toNumber(..., 0))` |
| `current.refs_found` | **recomputed** | `evidence.length \|\| prov.confirmations` | count of evidence entries |
| `current.best_tier_seen` | **recomputed** | `Math.min(evidence[].tier)` | lowest (best) tier across evidence |
| `current.meets_pass_target` | **recomputed** | confidence vs passTarget | boolean gate |
| `current.reasons` | **recomputed** | `deriveFieldReasons()` | array of reason codes from field state |
| `need_score` | **recomputed** | scoring engine | composite priority score |
| `history.existing_queries` | **enriched** | `buildFieldHistories` | union of prev + new queries targeting this field |
| `history.domains_tried` | **enriched** | `buildFieldHistories` | union of prev + evidence rootDomains |
| `history.host_classes_tried` | **enriched** | `classifyHostClass()` | union of prev + classified current evidence |
| `history.evidence_classes_tried` | **enriched** | `classifyEvidenceClass()` | union of prev + classified current evidence |
| `history.query_count` | **enriched** | `buildFieldHistories` | accumulated across rounds |
| `history.urls_examined_count` | **enriched** | `buildFieldHistories` | accumulated across rounds |
| `history.no_value_attempts` | **enriched** | `buildFieldHistories` | incremented when targeted but still unknown |
| `history.duplicate_attempts_suppressed` | **enriched** | `buildFieldHistories` | distributed from round-level count |

### Summary & Blockers

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `summary.*` (total, resolved, core_*, secondary_*, optional_*, conflicts) | **recomputed** | aggregation over `fields[]` | 9 counters derived from field states |
| `blockers.*` (missing, weak, conflict, needs_exact_match, search_exhausted) | **recomputed** | aggregation over `fields[]` | search_exhausted uses history feedback |

### Planner Seed

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `planner_seed.missing_critical_fields` | **recomputed** | filter fields where status=unknown AND required_level=critical | |
| `planner_seed.unresolved_fields` | **recomputed** | filter fields where status!=accepted | |
| `planner_seed.existing_queries` | **recomputed** | union of all `fields[].history.existing_queries` | |
| `planner_seed.current_product_identity` | **passthrough** | { category, brand, model } from caller params | |

### Backward-Compat Keys (still emitted, not in Schema 2 spec)

| Field | Tag | Notes |
|-------|-----|-------|
| `run_id`, `category`, `product_id` | **passthrough** | consumed by runtimeBridge |
| `generated_at`, `total_fields` | **recomputed** | consumed by runtimeBridge, buildRunSummary |
| `focus_fields`, `bundles`, `profile_mix` | **recomputed** | consumed by buildNeedSetDispatch, needsetStoryProjection |
| `rows` | **recomputed** | consumed by convergence loop + needsetStoryProjection |
| `deltas` | **recomputed** | no known consumer — candidate for removal |

---

## Boundary 2 — Schema 2 → Schema 3 (SearchPlanningContext)

Producer: `searchPlanningContext.buildSearchPlanningContext()`
Source files: `searchPlanningContext.js:57-377`

### Run Block

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `run.run_id` | **passthrough** | rc.run_id | from run context |
| `run.category` | **passthrough** | rc.category | |
| `run.product_id` | **passthrough** | rc.product_id | |
| `run.brand` | **passthrough** | rc.brand | |
| `run.model` | **passthrough** | rc.model | |
| `run.base_model` | **passthrough** | rc.base_model | |
| `run.aliases` | **passthrough** | rc.aliases | |
| `run.round` | **passthrough** | rc.round | |
| `run.round_mode` | **passthrough** | rc.round_mode | |

### Identity Block

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| entire `identity` block | **passthrough** | Schema 2 `identity` | no transformation |

### NeedSet Projection

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `needset.summary` | **passthrough** | Schema 2 `summary` | |
| `needset.blockers` | **passthrough** | Schema 2 `blockers` | |
| `needset.missing_critical_fields` | **passthrough** | Schema 2 `planner_seed.missing_critical_fields` | consumed by LLM payload |
| `needset.unresolved_fields` | **passthrough** | Schema 2 `planner_seed.unresolved_fields` | not consumed by planner directly |
| `needset.existing_queries` | **passthrough** | Schema 2 `planner_seed.existing_queries` | consumed by LLM + dedup |

### Planner Limits

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `planner_limits.phase2LlmEnabled` | **recomputed** | runtime config | `derivePlannerLimits()` reads from config directly, NOT Schema 2 |
| `planner_limits.discoveryMaxQueries` | **recomputed** | runtime config | |
| `planner_limits.maxUrlsPerProduct` | **recomputed** | runtime config | |
| `planner_limits.llmModelPlan` | **recomputed** | runtime config | |
| `planner_limits.searchProfileCapMap` | **recomputed** | runtime config | parsed via `parseCapMap()` |
| `planner_limits.searchProvider` | **recomputed** | runtime config | |

### Group Catalog

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `group_catalog[key].*` | **enriched** | `GROUP_DEFAULTS` + `fieldGroupsData` | static metadata per group (label, desc, source_target, content_target, search_intent, host_class). Category-aware overrides via `resolveGroupMeta()`. |

### Focus Groups (the core transformation)

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `focus_groups[].key` | **passthrough** | Schema 2 `fields[].group_key` | renamed from group_key |
| `focus_groups[].label` | **enriched** | group_catalog | inlined from catalog |
| `focus_groups[].desc` | **enriched** | group_catalog | inlined from catalog |
| `focus_groups[].source_target` | **enriched** | group_catalog | inlined from catalog |
| `focus_groups[].content_target` | **enriched** | group_catalog | inlined from catalog |
| `focus_groups[].search_intent` | **enriched** | group_catalog | inlined from catalog |
| `focus_groups[].host_class` | **enriched** | group_catalog | inlined from catalog |
| `focus_groups[].field_keys` | **recomputed** | Schema 2 `fields[]` | grouped by group_key |
| `focus_groups[].satisfied_field_keys` | **recomputed** | Schema 2 `fields[]` | filter: status=accepted |
| `focus_groups[].unresolved_field_keys` | **recomputed** | Schema 2 `fields[]` | filter: status!=accepted, not exhausted |
| `focus_groups[].weak_field_keys` | **recomputed** | Schema 2 `fields[]` | filter: status=weak |
| `focus_groups[].conflict_field_keys` | **recomputed** | Schema 2 `fields[]` | filter: status=conflict |
| `focus_groups[].search_exhausted_field_keys` | **recomputed** | Schema 2 `fields[].history` | no_value_attempts>=3 AND evidence_classes>=3 |
| `focus_groups[].search_exhausted_count` | **recomputed** | count of above | |
| `focus_groups[].core_unresolved_count` | **recomputed** | filter by required_level | |
| `focus_groups[].secondary_unresolved_count` | **recomputed** | filter by required_level | |
| `focus_groups[].optional_unresolved_count` | **recomputed** | filter by required_level | |
| `focus_groups[].exact_match_count` | **recomputed** | filter exact_match_required | |
| `focus_groups[].no_value_attempts` | **recomputed** | max across group fields | aggregated from per-field history |
| `focus_groups[].duplicate_attempts_suppressed` | **recomputed** | sum across group fields | |
| `focus_groups[].urls_examined_count` | **recomputed** | sum across group fields | |
| `focus_groups[].query_count` | **recomputed** | sum across group fields | |
| `focus_groups[].query_terms_union` | **recomputed** | `unionSorted()` from non-accepted fields | per-field idx.query_terms merged |
| `focus_groups[].domain_hints_union` | **recomputed** | `unionSorted()` from non-accepted fields | per-field idx.domain_hints merged |
| `focus_groups[].preferred_content_types_union` | **recomputed** | `unionSorted()` from non-accepted fields | per-field idx.preferred_content_types merged |
| `focus_groups[].existing_queries_union` | **recomputed** | `unionSorted()` from non-accepted fields | per-field history.existing_queries merged |
| `focus_groups[].domains_tried_union` | **recomputed** | `unionSorted()` from non-accepted fields | per-field history.domains_tried merged |
| `focus_groups[].host_classes_tried_union` | **recomputed** | `unionSorted()` from non-accepted fields | per-field history.host_classes_tried merged |
| `focus_groups[].evidence_classes_tried_union` | **recomputed** | `unionSorted()` from non-accepted fields | per-field history.evidence_classes_tried merged |
| `focus_groups[].aliases_union` | **recomputed** | `unionSorted()` from non-accepted fields | per-field idx.aliases merged |
| `focus_groups[].priority` | **recomputed** | unresolved required_levels | core if any critical/required, secondary if any expected, else optional |
| `focus_groups[].phase` | **recomputed** | hasUnresolved + priority + exhaustion | now/next/hold classification |

### Schema 2 Fields Dropped at This Boundary

| Field | Tag | Notes |
|-------|-----|-------|
| `fields[].current.value` | **dropped** | not needed for planning — only field state matters |
| `fields[].current.confidence` | **dropped** | subsumed by state classification (satisfied/weak/conflict/unknown) |
| `fields[].current.effective_confidence` | **dropped** | subsumed by state classification |
| `fields[].current.refs_found` | **dropped** | subsumed by state classification |
| `fields[].current.best_tier_seen` | **dropped** | not sent to planner |
| `fields[].current.meets_pass_target` | **dropped** | subsumed by state classification |
| `fields[].need_score` | **dropped** | replaced by focus_groups priority/phase |
| `fields[].pass_target` | **dropped** | not needed for planning |
| `fields[].idx.tooltip_md` | **dropped** | UI-only, not planning data |
| `planner_seed` block | **dropped** | replaced by `needset` projection with same data |

### Other

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `field_priority_map` | **recomputed** | Schema 2 `fields[]` | Map of field_key → required_level for Schema 4 bundle derivation |
| `learning` | **passthrough** | external learning stores | dead_query_hashes, dead_domains for anti-garbage |
| `previous_round_fields` | **passthrough** | previous round state | for delta computation in Schema 4 |

---

## Boundary 2b — Brand Resolution (parallel sidecar)

Producer: `brandResolver.resolveBrandDomain()`
Source files: `brandResolver.js:1-64`, `discoveryLlmAdapters.js:65-86`
Call site: `searchDiscovery.js:169-187`

### Input

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `brand` | **passthrough** | identity lock via searchDiscovery | trimmed into brandKey |
| `category` | **passthrough** | job.category | trimmed into categoryKey |

### Output

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `officialDomain` | **enriched** | cache OR LLM (role=triage) | normalized: lowercased, trimmed |
| `supportDomain` | **enriched** | cache OR LLM | normalized: lowercased, trimmed |
| `aliases` | **enriched** | cache OR LLM | normalized: lowercased, trimmed, filtered empty |
| `confidence` | **enriched** | cache (stored) OR hardcoded 0.8 (LLM hit) | not in original correction-note spec — extra |
| `reasoning` | **enriched** | LLM response OR [] (cache hit) | not in original correction-note spec — extra |

### Gating

| Gate | Condition | Effect |
|------|-----------|--------|
| missing brand | `brand` is empty | skip, status=skipped, skip_reason='no_brand_in_identity_lock' |
| no triage API key | `!hasLlmRouteApiKey(config, 'triage')` | callLlmFn=null → cache-only resolution |
| cache hit | `storage.getBrandDomain()` returns row | return cached values immediately, skip LLM |
| LLM disabled | callLlmFn=null AND no cache | return empty output |
| LLM error | exception during LLM call | return empty output |

### Downstream Consumers of Brand Resolution

| Consumer | Fields Used | Transform |
|----------|-------------|-----------|
| search_profile_hints | officialDomain, aliases | **passthrough** → used as `brandResolutionHints` in query building |
| manufacturer_auto_promote | officialDomain, supportDomain | **recomputed** → promote matching hosts to tier 1 in source registry |
| telemetry | all fields | **passthrough** → logged to run events |

---

## Boundary 3 — Schema 3 + Brand → Schema 4 (NeedSetPlannerOutput)

Producer: `searchPlanBuilder.buildSearchPlan()`
Source files: `searchPlanBuilder.js:130-261`

### Run Block

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `run.*` | **passthrough** | Schema 3 `run` | all 9 fields pass unchanged |

### Planner Block

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `planner.mode` | **recomputed** | LLM gate result | llm/disabled/error based on planner_limits + call outcome |
| `planner.model` | **passthrough** | Schema 3 `planner_limits.llmModelPlan` | |
| `planner.planner_complete` | **recomputed** | LLM call outcome | boolean |
| `planner.planner_confidence` | **enriched** | LLM response | 0-1 confidence from LLM JSON |
| `planner.queries_generated` | **recomputed** | post-LLM dedup count | |
| `planner.duplicates_suppressed` | **recomputed** | dedup counter | queries dropped during hash dedup |
| `planner.targeted_exceptions` | **enriched** | LLM response | exceptional queries added outside normal rules |
| `planner.error` | **recomputed** | catch block | null on success, error message on failure |

### Search Plan Handoff

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `search_plan_handoff.queries[].q` | **enriched** | LLM response | raw query text from LLM |
| `search_plan_handoff.queries[].query_hash` | **recomputed** | deterministic hash of q | for cross-round dedup |
| `search_plan_handoff.queries[].family` | **enriched** | LLM response | manufacturer_html/manual_pdf/review_lookup/etc. |
| `search_plan_handoff.queries[].group_key` | **passthrough** | Schema 3 focus_group key | which group this query targets |
| `search_plan_handoff.queries[].target_fields` | **recomputed** | Schema 3 focus_group unresolved_field_keys | fields this query should resolve |
| `search_plan_handoff.queries[].preferred_domains` | **recomputed** | Schema 3 focus_group domain_hints_union | capped to top entries |
| `search_plan_handoff.queries[].exact_match_required` | **recomputed** | Schema 3 focus_group exact_match_count > 0 | |
| `search_plan_handoff.query_hashes` | **recomputed** | flat array of all query_hash values | |
| `search_plan_handoff.total` | **recomputed** | queries.length | |

### Panel Block (for GUI)

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `panel.round` | **passthrough** | Schema 3 `run.round` | |
| `panel.round_mode` | **passthrough** | Schema 3 `run.round_mode` | |
| `panel.identity` | **passthrough** | Schema 3 `identity` | |
| `panel.summary` | **passthrough** | Schema 3 `needset.summary` | |
| `panel.blockers` | **passthrough** | Schema 3 `needset.blockers` | |
| `panel.bundles[].key` | **passthrough** | Schema 3 focus_group key | |
| `panel.bundles[].label` | **passthrough** | Schema 3 focus_group label | |
| `panel.bundles[].desc` | **passthrough** | Schema 3 focus_group desc | |
| `panel.bundles[].priority` | **passthrough** | Schema 3 focus_group priority | |
| `panel.bundles[].phase` | **passthrough** | Schema 3 focus_group phase | |
| `panel.bundles[].source_target` | **passthrough** | Schema 3 focus_group source_target | |
| `panel.bundles[].content_target` | **passthrough** | Schema 3 focus_group content_target | |
| `panel.bundles[].search_intent` | **passthrough** | Schema 3 focus_group search_intent | |
| `panel.bundles[].host_class` | **passthrough** | Schema 3 focus_group host_class | |
| `panel.bundles[].query_family_mix` | **enriched** | LLM response | human-readable strategy per group |
| `panel.bundles[].reason_active` | **enriched** | LLM response | why this group is being searched |
| `panel.bundles[].queries` | **enriched** | LLM response | projected `{ q, family }` per bundle |
| `panel.bundles[].fields` | **recomputed** | Schema 3 focus_group field breakdowns + field_priority_map | `{ key, state, bucket }` per field |
| `panel.profile_influence.*` (14 keys) | **recomputed** | post-LLM aggregation | 7 family counts + duplicates_suppressed + focused_bundles + targeted_exceptions + total_queries + trusted_host_share + docs_manual_share |
| `panel.deltas` | **recomputed** | `computeDeltas(previous_round_fields, current)` | `{ field, from, to }` for state changes. Empty on round 0. |

### Learning Writeback

| Field | Tag | Source | Notes |
|-------|-----|--------|-------|
| `learning_writeback.query_hashes_generated` | **recomputed** | all query hashes | |
| `learning_writeback.queries_generated` | **recomputed** | all query texts | |
| `learning_writeback.families_used` | **recomputed** | distinct families from queries | sorted set |
| `learning_writeback.domains_targeted` | **recomputed** | distinct preferred_domains | sorted set |
| `learning_writeback.groups_activated` | **recomputed** | distinct group_keys with queries | sorted set |
| `learning_writeback.duplicates_suppressed` | **recomputed** | dedup counter | |

### Schema 3 Fields Dropped at This Boundary

| Field | Tag | Notes |
|-------|-----|-------|
| `planner_limits` | **dropped** | consumed internally by `buildSearchPlan()` gating — not emitted |
| `group_catalog` | **dropped** | metadata already inlined into focus_groups at Schema 3 |
| `focus_groups[].field_keys` | **dropped** | replaced by per-bundle `fields[]` with state+bucket |
| `focus_groups[].satisfied_field_keys` | **dropped** | subsumed by fields[].state |
| `focus_groups[].search_exhausted_*` | **dropped** | phase=hold already communicates this |
| `focus_groups[].all 8 union arrays` | **dropped** | consumed by LLM payload construction, not emitted in output |
| `focus_groups[].no_value_attempts` | **dropped** | consumed by LLM payload, not emitted |
| `focus_groups[].duplicate_attempts_suppressed` | **dropped** | consumed by LLM payload, not emitted |
| `focus_groups[].urls_examined_count` | **dropped** | consumed by LLM payload, not emitted |
| `focus_groups[].query_count` | **dropped** | consumed by LLM payload, not emitted |
| `field_priority_map` | **dropped** | consumed internally for bundle fields[] bucket derivation |
| `learning` | **dropped** | consumed internally for anti-garbage filter (dead_query_hashes, dead_domains) |
| `previous_round_fields` | **dropped** | consumed internally for delta computation |

---

## Stage Matrix Summary

### Field Lifecycle: Runtime → Schema 2 → Schema 3 → Schema 4

| Field Family | Runtime→S2 | S2→S3 | S3→S4 | End State |
|-------------|-----------|-------|-------|-----------|
| **run context** (run_id, category, product_id, brand, model, round, round_mode) | passthrough | passthrough | passthrough | survives all stages |
| **base_model, aliases** | passthrough | passthrough | passthrough (in run block) | survives all stages |
| **identity** (state, manufacturer, confidence, official_domain, support_domain) | recomputed | passthrough | passthrough (in panel) | S2 computes, then passes unchanged |
| **per-field value/confidence/refs** | recomputed from provenance | **dropped** | — | consumed only within NeedSet scoring |
| **per-field state** (accepted/conflict/unknown/weak) | recomputed | recomputed (classified per group) | recomputed (into bundle fields[].state) | re-derived at each boundary |
| **per-field idx hints** (query_terms, domain_hints, content_types) | normalized | recomputed (into group union arrays) | **dropped** (consumed by LLM payload) | normalized in S2, aggregated in S3, consumed in S4 |
| **per-field history** (domains_tried, host_classes_tried, etc.) | enriched from buildFieldHistories | recomputed (into group union arrays) | **dropped** (consumed by LLM payload) | enriched in S2, aggregated in S3, consumed in S4 |
| **summary/blockers** | recomputed | passthrough | passthrough (in panel) | S2 computes, then passes unchanged |
| **planner_seed** | recomputed | passthrough (as `needset` projection) | **dropped** (consumed internally) | repackaged in S3, consumed in S4 |
| **group_catalog metadata** | — | enriched (from GROUP_DEFAULTS) | **dropped** (already inlined into focus_groups) | created in S3, consumed in S3 |
| **focus_groups** | — | recomputed (groupBy + aggregate) | recomputed (into bundles + LLM payload) | created in S3, transformed in S4 |
| **LLM-generated queries** | — | — | enriched (from LLM) | created in S4 |
| **profile_influence** | — | — | recomputed (from query analysis) | created in S4 |
| **learning_writeback** | — | — | recomputed (from query analysis) | created in S4 |
| **deltas** | — | — | recomputed (from previous_round_fields) | created in S4 |

### Brand Resolution Sidecar

| Field | Origin | Consumed By | Transform |
|-------|--------|-------------|-----------|
| `officialDomain` | cache OR LLM | search_profile_hints, manufacturer_auto_promote | passthrough → hints; recomputed → tier promotion |
| `supportDomain` | cache OR LLM | manufacturer_auto_promote | recomputed → tier promotion |
| `aliases` | cache OR LLM | search_profile_hints | passthrough → used as brand-domain variants |
| `confidence` | cache OR 0.8 | telemetry, panel display | passthrough |
| `reasoning` | LLM OR [] | panel display | passthrough |

---

## Anti-Garbage Intelligence Flow

The pipeline's feedback loop ensures the LLM doesn't repeat failed strategies:

```
buildFieldHistories (round N-1 evidence)
  → Schema 2 fields[].history (per-field memory)
    → Schema 3 focus_groups[].*_union (aggregated per group)
      → Schema 4 LLM payload (sent as anti-garbage context)
        → LLM avoids dead domains, dead queries, exhausted patterns
```

| Signal | Created | Aggregated | Consumed |
|--------|---------|------------|----------|
| `domains_tried` | S2 (buildFieldHistories) | S3 (domains_tried_union) | S4 (LLM payload, capped to 5) |
| `host_classes_tried` | S2 (classifyHostClass) | S3 (host_classes_tried_union) | S4 (LLM payload) |
| `evidence_classes_tried` | S2 (classifyEvidenceClass) | S3 (evidence_classes_tried_union) | S4 (LLM payload) |
| `no_value_attempts` | S2 (buildFieldHistories) | S3 (max across group fields) | S4 (LLM payload) |
| `existing_queries` | S2 (buildFieldHistories) | S3 (existing_queries_union) | S4 (LLM payload + hash dedup) |
| `dead_query_hashes` | external learning store | S3 (learning passthrough) | S4 (pre-LLM anti-garbage filter) |
| `dead_domains` | external learning store | S3 (learning passthrough) | S4 (pre-LLM anti-garbage filter) |

---

## Schema Update Status

All schemas audited — **no updates required** for existing files. Three new contract files added for the Schema 4 search planner:

| Schema | File | Gaps | Status |
|--------|------|------|--------|
| Schema 1 (NeedSetStartInput) | `1/need-set-input.json` | 10 original → 0 remaining | all resolved or dropped by design |
| Schema 2 (NeedSetOutput) | `1/need-set-output.json` | 6 original → 0 material | 7 ghost consumers documented |
| Schema 3 (SearchPlanningContext) | `1/needset-planner-context.json` | 12 original → 0 remaining | all closed |
| Schema 4 (NeedSetPlannerOutput) | `1/needset-planner-output.json` | 16 original → 0 remaining | all closed |
| Brand Resolver Input | `2/brand-resolver-input.json` | 3 original → 0 material | all closed or informational |
| Brand Resolver Output | `2/brand-resolver-output.json` | 4 original → 0 material | 2 extra (confidence, reasoning) |
| Handoff Input | `3/search-plan-handoff-input.json` | 0 | complete |
| Handoff Output | `3/search-plan-handoff-output.json` | 0 | complete |
| **Search Planner Input** | `3/search-planner-input.json` | — | **NEW** — Schema 3 consumption contract with field-level tags |
| **Search Planner Output** | `3/search-planner-output.json` | — | **NEW** — Schema 4 output contract with field-level tags |
| **Search Planner LLM Call** | `3/search-planner-llm-call.json` | — | **NEW** — prompt, payload, response schema, post-processing rules |

### Flow Diagram

`3/02-PROFILE-TO-PLANNER-FLOW.mmd` updated to show both the Schema 4 (NeedSet Planner) path and the old multi-pass path, with the `enableSchema4SearchPlan` gate as the decision point.
