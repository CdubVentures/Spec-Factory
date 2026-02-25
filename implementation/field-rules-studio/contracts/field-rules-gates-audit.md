# Field Rule Gate Audit (IDX / SEED / REV)

This file inventories every field-rule knob that has consumer badges and records whether it is a gate, whether that gate is wired in code, and whether updates propagate immediately after change/saved.

## Gate execution model (quick)

- Gate assignment source: `tools/gui-react/src/pages/studio/workbench/systemMapping.ts` (`FIELD_SYSTEM_MAP`).
- Gate enforcement: `src/field-rules/consumerGate.js` (`resolveConsumerGate`, `isConsumerEnabled`, `projectFieldRulesForConsumer`).
- On/Off storage: each rule field keeps a `consumers` map, typically in the rule JSON (`field_rules` / `field_studio_map.field_overrides`) as:
  - `consumers.indexlab` (IDX)  
  - `consumers.seed` (SEED)  
  - `consumers.review` (REV; API aliases `idx` and `rev` are normalized).
- Runtime propagation: save / autosave writes rule payload to draft file and emits `field-studio-map-saved`; frontend invalidation maps consume event domains and refresh affected systems.
- Immediate update behavior:
  - Consumer gate toggles (IDX/SEED/REV badges): update persists immediately on click through `field-studio-map`, then propagates via `field-studio-map-saved` invalidation.
  - Other field edits: still propagate on manual save or autosave flush (no live keystroke propagation for non-toggle edits).
- REV state: wired in current code paths (`projectFieldRulesForConsumer(..., 'review')`) and ready for any review features that consume review-projected rules.

## Validation evidence (2026-02-24)

- Gate map parity and tooltip coverage: `test/systemMappingCoverage.test.js` (frontend/backend map parity + complete tooltip coverage).
- Gate enforcement/projection: `test/consumerGate.test.js`, `test/consumerGateProjection.test.js`, `test/seedConsumerGateEnforcement.test.js`.
- Save/event propagation path: `test/studioRoutesPropagation.test.js`, `test/dataAuthorityPropagationMatrix.test.js`.
- Immediate toggle commit wiring: `test/studioConsumerToggleImmediatePropagation.test.js` (Key Navigator + Workbench Drawer badge toggles call shared save path immediately).

## IDX + SEED + REV grouped tables

### IDX group

| Section | Rule key | Gate present? | Gate functioning? | Immediate update on change? | Feed / system |
|---|---|---|---|---|---|
| Contract | `contract.type` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet, seed derivation, review projection |
| Contract | `contract.shape` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet, seed derivation, review projection |
| Contract | `contract.unit` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet, review projection |
| Contract | `contract.unknown_token` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet contract parser behavior |
| Contract | `contract.rounding.decimals` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet contract parser behavior |
| Contract | `contract.rounding.mode` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet contract parser behavior |
| Priority | `priority.required_level` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.availability` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.difficulty` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.effort` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.publish_gate` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet publish controls + review gating |
| Priority | `priority.block_publish_when_unk` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet publish controls + review gating |
| AI Assist | `ai_assist.mode` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet assist flow, seed orchestration, review projection |
| AI Assist | `ai_assist.model_strategy` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet LLM routing, review projection |
| AI Assist | `ai_assist.max_calls` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet LLM routing, review projection |
| AI Assist | `ai_assist.max_tokens` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet LLM routing, review projection |
| AI Assist | `ai_assist.reasoning_note` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet LLM context, review projection |
| Parse | `parse.template` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser defaults, review projection |
| Parse | `parse.unit` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser defaults, review projection |
| Parse | `parse.unit_accepts` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser defaults, review projection |
| Parse | `parse.allow_unitless` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser behavior (NeedSet ingest) |
| Parse | `parse.allow_ranges` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser behavior (NeedSet ingest) |
| Parse | `parse.strict_unit_required` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser behavior (NeedSet ingest) |
| Enum | `enum.policy` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet enum policy, seed mapping, review projection |
| Enum | `enum.source` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet enum policy, seed mapping, review projection |
| Evidence | `evidence.required` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet quality gates, seed evidence policy, review projection |
| Evidence | `evidence.min_evidence_refs` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet quality gates, seed evidence policy, review projection |
| Evidence | `evidence.conflict_policy` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Conflict policy handling, review projection |
| Evidence | `evidence.tier_preference` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Tier-based retrieval behavior, review projection |
| Search | `search_hints.domain_hints` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Search hinting, NeedSet retrieval defaults |
| Search | `search_hints.preferred_content_types` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Search hinting, NeedSet retrieval defaults |
| Search | `search_hints.query_terms` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Search hinting, NeedSet retrieval defaults |
| Constraints | `constraints` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Constraint validation, review projection |
| Deps | `component.type` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Component dependency model, seed mapping, review projection |
| Deps | `aliases` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Alias expansion, seed mapping, review projection |
| Tooltip | `ui.tooltip_md` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | UI tooltip rendering + review projection |

Function (plain English): Every IDX toggle is a direct ON/OFF gate for IndexLab runtime participation of that field rule part. Turning it OFF prevents that rule chunk from being used in IDX/seed/review consumers; turning it ON includes it. Each toggle is persisted in `consumers.indexlab`, saved immediately on toggle click through `field-studio-map`, and propagated through `field-studio-map-saved` + invalidation refresh.

### SEED group

| Section | Rule key | Gate present? | Gate functioning? | Immediate update on change? | Feed / system |
|---|---|---|---|---|---|
| Contract | `contract.type` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet, seed derivation, review projection |
| Contract | `contract.shape` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet, seed derivation, review projection |
| Priority | `priority.required_level` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.availability` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.difficulty` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.effort` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| AI Assist | `ai_assist.mode` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet assist flow, seed orchestration, review projection |
| Enum | `enum.policy` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet enum policy, seed mapping, review projection |
| Enum | `enum.source` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet enum policy, seed mapping, review projection |
| Evidence | `evidence.required` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet quality gates, seed evidence policy, review projection |
| Evidence | `evidence.min_evidence_refs` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet quality gates, seed evidence policy, review projection |
| Deps | `component.type` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Component dependency model, seed mapping, review projection |
| Deps | `aliases` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Alias expansion, seed mapping, review projection |

Function (plain English): Every SEED toggle controls whether SEED systems consume each field rule part during seed generation and related runtime flows. OFF means SEED ignores that part; ON means it is included. State is stored in `consumers.seed`, persisted immediately on toggle click through `field-studio-map`, and propagated via `field-studio-map-saved` cache refresh.

### REV group

| Section | Rule key | Gate present? | Gate functioning? | Immediate update on change? | Feed / system |
|---|---|---|---|---|---|
| Contract | `contract.type` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet, seed derivation, review projection |
| Contract | `contract.shape` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet, seed derivation, review projection |
| Contract | `contract.unit` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet, review projection |
| Priority | `priority.required_level` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.availability` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.difficulty` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.effort` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet scoring, seed policy, review projection |
| Priority | `priority.publish_gate` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet publish controls + review gating |
| Priority | `priority.block_publish_when_unk` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet publish controls + review gating |
| AI Assist | `ai_assist.mode` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet assist flow, seed orchestration, review projection |
| AI Assist | `ai_assist.model_strategy` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet LLM routing, review projection |
| AI Assist | `ai_assist.max_calls` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet LLM routing, review projection |
| AI Assist | `ai_assist.max_tokens` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet LLM routing, review projection |
| AI Assist | `ai_assist.reasoning_note` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet LLM context, review projection |
| Parse | `parse.template` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser defaults, review projection |
| Parse | `parse.unit` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser defaults, review projection |
| Parse | `parse.unit_accepts` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Parser defaults, review projection |
| Enum | `enum.policy` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet enum policy, seed mapping, review projection |
| Enum | `enum.source` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet enum policy, seed mapping, review projection |
| Enum | `enum.match.strategy` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review-only matching logic/profiles |
| Enum | `enum.match.format_hint` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review-only matching logic/profiles |
| Enum | `enum.match.fuzzy_threshold` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review-only matching logic/profiles |
| Enum | `enum.additional_values` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review-only matching logic/profiles |
| Evidence | `evidence.required` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet quality gates, seed evidence policy, review projection |
| Evidence | `evidence.min_evidence_refs` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | NeedSet quality gates, seed evidence policy, review projection |
| Evidence | `evidence.conflict_policy` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Conflict policy handling, review projection |
| Evidence | `evidence.tier_preference` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Tier-based retrieval behavior, review projection |
| Constraints | `constraints` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Constraint validation, review projection |
| Deps | `component.type` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Component dependency model, seed mapping, review projection |
| Deps | `component.match.fuzzy_threshold` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review matching thresholds (component review paths) |
| Deps | `component.match.name_weight` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review matching weights |
| Deps | `component.match.auto_accept_score` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review auto-accept behavior |
| Deps | `component.match.flag_review_score` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review scoring override |
| Deps | `component.match.property_weight` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Review matching weights |
| Deps | `aliases` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | Alias expansion, seed mapping, review projection |
| Tooltip | `ui.tooltip_md` | Yes | Yes (frontend + backend) | Yes, toggle click persists immediately via `field-studio-map` + `field-studio-map-saved` invalidation | UI tooltip rendering + review projection |

Function (plain English): Every REV toggle gates what review receives from field-rule behavior (including parsing hints, enum matching, scoring, component matching, and AI/evidence checks). OFF blocks review-specific consumption for that part; ON allows it. The gate value is saved in `consumers.review` immediately on toggle click through `field-studio-map` and then applied after `field-studio-map-saved` invalidation refresh.

## Notes

1. Every row has both badge mapping and gate enforcement mapping. If a rule is listed, the gate path is expected to be alive and functionally active.
2. Consumer gate toggles now propagate immediately via direct save on toggle click; other local edits still apply on manual save/autosave flush.
3. REV is already wired into the projection path and event invalidation; it is active for review surfaces, with behavior depending on each consumer's current use of review-projected rules.
