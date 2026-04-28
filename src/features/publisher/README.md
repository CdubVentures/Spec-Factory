## Purpose

Single gate for all field data entering the product record. No field value reaches `item_field_state` or `product.json fields[]` without passing through this pipeline. Sub-modules: `validation/` (12-step pure deterministic checks + discovery enum merge), `candidate-gate/` (source validate + persist), `publish/` (resolve + cross-validate + publish). Component identity linking happens only after both the component name and brand are published; it is not a validation gate.

## Public API (The Contract)

```js
// src/features/publisher/index.js
export { submitCandidate } from './candidate-gate/submitCandidate.js';
export { normalizeConfidence } from './publish/publishCandidate.js';
export { buildSourceId }   from './candidate-gate/buildSourceId.js';
export { validateField }   from './validation/validateField.js';
export { validateRecord }  from './validation/validateRecord.js';
export { mergeDiscoveredEnums }  from './validation/mergeDiscoveredEnums.js';
export { buildDiscoveredEnumMap } from './buildDiscoveredEnumMap.js';
export { persistDiscoveredValue } from './persistDiscoveredValues.js';
export { rebuildFieldCandidatesFromJson } from './candidateReseed.js';
export { republishField }  from './publish/republishField.js';
export { clearPublishedField } from './publish/clearPublishedField.js';
```

## Dependencies

- **Allowed:** `src/shared/`
- **Forbidden:** `src/engine/*`, `src/features/*`, `src/db/*` (candidate-gate and publisher access DB through injected dependencies, never direct imports)

## Domain Invariants

1. No field value reaches `item_field_state` or `product.json fields[]` without passing validation.
2. Validation is deterministic and pure — same input always produces same output. No LLM anywhere in the publisher path.
3. Field Studio rules are the sole source of truth for what is valid.
4. Two-phase write: validated candidates first (per-source), resolved winners second (per-product).
5. Source-centric candidates: one SQL row per extraction event, keyed by (`source_id`, `variant_id`). UNIQUE uses `variant_id_key = COALESCE(variant_id, '')` so a feature can dual-write the same `source_id` under a variant AND the scalar (NULL) without conflict. Lookup is variant-aware via `getFieldCandidateBySourceIdAndVariant` so callers (notably `submitCandidate`) get the correct row back. Rows are immutable after insert (only `status` changes). No `sources_json` accumulation.
6. **`publishConfidenceThreshold` is the single source of truth for confidence gating.** Per-finder local `minConfidence` / `belowConfidence` gates are forbidden — finders submit everything with a real value + evidence, and the publisher decides. Candidate `confidence` passed to `submitCandidate` comes from the LLM's own overall value-level rating, calibrated at prompt time by the shared `src/core/finder/valueConfidencePromptFragment.js` rubric. Finders must NOT override the LLM's number with `max(evidence_refs.confidence)` or any other post-hoc derivation — trust the LLM's honest rating against the cited evidence (PIF excepted: images don't flow through the candidate gate).
7. **Threshold changes cascade automatically.** `configRuntimeSettingsHandler.js` detects `publishConfidenceThreshold` in the PUT patch and invokes `reconcileThreshold` per category — flips `field_candidates.status` in SQL, rewrites `product.json.fields[]`, rebuilds `linked_candidates[]`. Resolved SQL manual overrides (`source_type === 'manual_override'` or `metadata_json.source === 'manual_override'`) are skipped. Per-category `publisher-reconcile` WS events fire so GUI queries invalidate. No manual Publisher Reconcile button click required.
8. **`linked_candidates[]` is the publisher's audit trail** of every value-matching, above-threshold candidate at publish time (scalar: exact match, list: set_union overlap). Persisted to `product.json.fields[fk].linked_candidates` and per-variant at `product.json.variant_fields[vid][fk].linked_candidates`. The review drawer does not read this — it uses the equivalent `status === 'resolved'` filter client-side.
9. **Variant-backed fields read from variants, not from candidates.** `GET /publisher/:category/published/:productId` derives `fields.colors` and `fields.editions` from the `variants` SQL table via `computePublishedArraysFromVariants` (`src/features/color-edition/index.js`), with `source: 'variant_registry'`. Field-level `confidence` is computed via `aggregateCefFieldConfidence` — `min()` across active variants' CEF-source `field_candidates` rows — never stamped as `1.0`. Edition combos cascade into colors natively. Other fields still derive from `field_candidates.status='resolved'`. After delete-all-runs (which strips CEF candidates but leaves variants), variant-backed published state survives; field-level confidence falls to `0` in that case (no candidates = no honest rating).
10. **Evidence projection** (`field_candidate_evidence`): `metadata.evidence_refs` on each candidate is JSON SSOT; the table is a SQL read projection populated by `submitCandidate` (`replaceFieldCandidateEvidence`) and rebuilt by `candidateReseed` for any product with `metadata.evidence_refs`. FK `candidate_id REFERENCES field_candidates(id) ON DELETE CASCADE` means every path that deletes a `field_candidates` row (candidate delete, source delete, run delete, variant-FK cascade) automatically sweeps the projected evidence rows. No manual cleanup in deletion code.
11. **Component identity links are publisher side effects.** A product-level component key (`enum.source = component_db.<key>`) plus its `<component>_brand` projection must both publish before `component_identity` and `item_component_links` are updated. Variant-scoped component publishes never create component links.
12. **Publish is dual-gated.** Every publish path (`publishCandidate`, `reconcileThreshold` loosening, `republishField`) runs the confidence gate AND the evidence gate. Evidence gate: `fieldRule.evidence.min_evidence_refs` checked against `specDb.countFieldCandidateEvidenceByCandidateId(candidateId)` (`COUNT(DISTINCT url)` — duplicates do not inflate). No-op when `min_evidence_refs <= 0`. On failure: status `below_evidence_refs` with `{required, actual}`, persisted to `metadata_json.publish_result`, no JSON write. Pure helper: `src/features/publisher/publish/evidenceGate.js`. Retired knob: `evidence.required` (tautological with `min_evidence_refs >= 1`); `evidence.tier_preference` is still consumed by `deriveEvidenceTierMinimum` and is not part of any publisher gate.
