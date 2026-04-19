# Publisher Evidence Gate Fix

**Status:** Implemented (Phases 1, 2, 3.1, 3.2 — done; CEF Gate 3 deferred)
**Driver:** CEF audit revealed the publisher never enforced Field Studio's `evidence.min_evidence_refs` — declared in `field_rules.json`, ignored on publish.

---

## Problem (resolved)

Field Studio declares per-field evidence contracts:

```json
"colors": { "evidence": { "min_evidence_refs": 1, "tier_preference": ["tier1","tier2","tier3"] } }
```

`src/engine/runtimeGate.js` enforces these for the indexing rail. The publisher rail (`publishCandidate.js`) did not — every field shipped without an evidence check. Additionally, CEF and RDF discovery URLs never reached `field_candidates` rows, so even adding a publisher gate would have had nothing to count against.

Both gaps are now closed. Evidence rides through the candidate gate, projects to a relational SQL table, and the publisher enforces `min_evidence_refs` before write.

---

## Evidence Model

Universal `{url, tier, confidence}` shape across CEF + RDF (PIF excluded — image URL IS the evidence):

```js
evidence_refs: [
  { url: string, tier: string, confidence: number /* 0-100 */ }
]
```

`tier` is classification metadata only — no publisher gate. `confidence` is **per-source** (how sure the LLM is THIS URL supports the claim). Distinct from the candidate-level confidence.

**Shared module** — `src/core/finder/evidencePromptFragment.js` owns the contract:
- `evidenceRefSchema` / `evidenceRefsSchema` (Zod)
- `EVIDENCE_PROMPT_FRAGMENT` / `buildEvidencePromptBlock({minEvidenceRefs})`

Feature schemas import `evidenceRefsSchema` directly — no local redefinition.

**Tier vocabulary** (6 codes; classification only, no enforcement):
- `tier1` mfr / brand-official / press release
- `tier2` professional testing lab / review lab
- `tier3` authorized retailer / marketplace
- `tier4` community / forum / blog / user-generated
- `tier5` specs aggregator / product database
- `other` anything else

---

## Storage (Dual-State)

JSON SSOT, SQL projection — per CLAUDE.md Dual-State Mandate:

1. **JSON SSOT** — `product.json.candidates[n].metadata.evidence_refs`. Durable; survives DB delete.
2. **SQL projection** — `field_candidate_evidence` (DDL in `src/db/specDbSchema.js:137-152`):

```sql
CREATE TABLE field_candidate_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES field_candidates(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  tier TEXT NOT NULL,
  confidence REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_fce_candidate ON field_candidate_evidence(candidate_id);
CREATE INDEX idx_fce_tier ON field_candidate_evidence(tier);
```

Design notes:
- `candidate_id` FK only — variant scope derives through `field_candidates.variant_id`. No denormalization.
- `ON DELETE CASCADE` with `PRAGMA foreign_keys = ON` (set in `SpecDb` ctor) — evidence drops with the candidate.
- **Rebuild contract** — `rebuildFieldCandidatesFromJson` re-populates both tables from JSON metadata. Deleted-DB rebuild fully supported.
- **Projection points** — `submitCandidate` and `candidateReseed` both call `specDb.replaceFieldCandidateEvidence(candidateId, refs)` (atomic clear-then-insert).
- No `evidence_refs_json` column on `field_candidates` or `variants` — the relational table covers all queries we need.

Indexed query example (tier1 evidence per variant):
```sql
SELECT e.url, e.confidence
FROM field_candidate_evidence e
JOIN field_candidates c ON e.candidate_id = c.id
WHERE c.variant_id = ? AND e.tier = 'tier1'
ORDER BY e.confidence DESC;
```

---

## Publisher Enforcement (Phase 3.1 — DONE)

`src/features/publisher/publish/evidenceGate.js` — pure helper. Reads `fieldRule.evidence.min_evidence_refs` and counts distinct URLs via `specDb.countFieldCandidateEvidenceByCandidateId(candidateId)` (`SELECT COUNT(DISTINCT url) ...`).

```js
export function checkEvidenceGate({ specDb, candidateId, fieldRule }) {
  const required = readMinEvidenceRefs(fieldRule);
  if (required <= 0) return { ok: true, required: 0, actual: 0 };
  const actual = specDb.countFieldCandidateEvidenceByCandidateId(candidateId);
  return { ok: actual >= required, required, actual };
}
```

Wired into all three publish paths — runs **after** the confidence gate, **before** product.json write:

| Path | File | Behavior on fail |
|---|---|---|
| Direct submit publish | `publish/publishCandidate.js` (scalar + variant-scoped branches) | Returns `below_evidence_refs`, persists `{required, actual}` to `metadata_json.publish_result`, no JSON write |
| Threshold reconcile (loosening) | `publish/reconcileThreshold.js` | Filters best-candidate selection by both gates |
| Republish after delete | `publish/republishField.js` | Filters `aboveThreshold` by both gates; unpublishes if none survives |

Counting rule: per-candidate, distinct URLs. If `min_evidence_refs <= 0` (rule unset or zero) the gate is a no-op.

### Variant-aware lookup (regression fix)

`submitCandidate.js` previously called `getFieldCandidateBySourceId(pid, fk, sid)` — variant-blind. When RDF dual-writes a release_date under both a `variant_id` AND the scalar (`variant_id NULL`), the same `source_id` produces two rows (UNIQUE uses `variant_id_key = COALESCE(variant_id, '')`). The old lookup returned only the first row — the second row's evidence was never projected, and would be wrongly rejected by the new gate.

Fix: new `_getFieldCandidateBySourceIdAndVariant` statement keyed on `variant_id_key = COALESCE(?, '')`. `submitCandidate.js:125` now calls `getFieldCandidateBySourceIdAndVariant(pid, fk, sid, normalizedVariantId)`. Regression test in `submitCandidate.test.js` ("projects evidence to the correct row for variant+scalar dual-write").

---

## Knob Retirement (Phase 3.2 — DONE)

- **`evidence.required`** — retired. Tautological: anything submitted to the candidate gate came from a source. `required: true` ≡ `min_evidence_refs >= 1`.
  - Emission removed at `src/ingest/compileFieldRuleBuilder.js:703-714` (explicit `delete nestedEvidence.required`).
  - Defensive strip in `src/field-rules/compiler.js:129` retained for legacy stored data.
  - No frontend surface existed.
  - Contract test: `src/field-rules/tests/fieldRulesCompiler.evidenceRetirement.contract.test.js`.

- **`evidence.tier_preference`** — **NOT retired** in this slice. Still consumed by `src/field-rules/compiler.js:deriveEvidenceTierMinimum` to derive `evidence_tier_minimum` for `getCoreDeepFieldRules`. Retirement deferred to its own slice.

---

## Phase Status

| Phase | Description | Status |
|---|---|---|
| 1 | Evidence storage (table + dual-state projection) | DONE |
| 2.1 | Shared prompt fragment + Zod schema | DONE |
| 2.2 | CEF + RDF prompt + schema convergence (PIF excluded) | DONE |
| 2.3 | CEF evidence flow through `colorEditionFinder.js` | DONE |
| 3.1 | Publisher `min_evidence_refs` gate (3 paths) | DONE |
| 3.2 | Retire `evidence.required` | DONE |
| 3.2b | Retire `evidence.tier_preference` | Deferred |
| CEF Gate 3 | Per-variant evidence filter before variant registry update | Deferred |
| GUI evidence dashboard / SQL-table API | Read from `field_candidate_evidence` for surfaces beyond the drawer | Deferred |

---

## CEF Variant Gating (Open Question — Resolved Direction)

Question: if evidence check fails for a CEF candidate, does `variants.syncFromRegistry + derivePublishedFromVariants` still write the published value?

Resolution direction: **per-variant gating** (CEF Gate 3) — drop unevidenced colors/editions before the registry update. Not yet implemented; tracked as future work.

```
Gate 1 (palette)    → reject entire run if any color is unknown
Gate 2 (identity)   → reject entire run if mappings are invalid
Gate 3 (evidence)   → filter colors/editions whose evidence_refs.length < min_evidence_refs
                     (partial pass: valid ones proceed, failing ones are dropped and logged)
```

CEF colors/editions don't currently go through the publisher's evidence gate — they go through `derivePublishedFromVariants`. Gate 3 enforces the same `min_evidence_refs` rule at the appropriate boundary for the variant-backed data model.

---

## Testing

All shipped behavior is covered. Run:

```bash
node --test \
  src/core/finder/tests/evidencePromptFragment.test.js \
  src/db/tests/fieldCandidateEvidenceStore.test.js \
  src/db/tests/fieldCandidateStore.test.js \
  src/features/publisher/publish/tests/evidenceGate.test.js \
  src/features/publisher/publish/tests/publishCandidate.test.js \
  src/features/publisher/publish/tests/reconcileThreshold.test.js \
  src/features/publisher/publish/tests/republishField.test.js \
  src/features/publisher/candidate-gate/tests/submitCandidate.test.js \
  src/features/publisher/tests/candidateReseed.test.js \
  src/field-rules/tests/fieldRulesCompiler.evidenceRetirement.contract.test.js
```

Key contract tests:
- `publishCandidate rejects with below_evidence_refs when rule requires refs and none are projected`
- `publishCandidate publishes when refs meet min_evidence_refs`
- `evidence gate precedes product.json write — candidate not resolved on failure`
- `submitCandidate projects evidence to the correct row for variant+scalar dual-write` (variant-aware lookup regression)
- `getFieldCandidateBySourceIdAndVariant disambiguates scalar vs variant-scoped rows`
- `compiled evidence block does not contain required key` (retirement proof)

---

## Live Audit Findings (2026-04-18)

Confirmed working on `mouse-76a41560` (33 candidates, 62 evidence rows across tier1/tier2/tier3/tier5):
- CEF (colors, editions): 9–15 refs per candidate, all `published`
- RDF (release_date): 2–4 refs per variant-scoped candidate, all `published`
- One pre-fix orphan: `id=52` (RDF scalar twin) had 3 refs in `metadata_json` but 0 projected — the variant-aware-lookup fix prevents recurrence; backfill script available at `.tmp/backfill_52.mjs` if rehydration desired.

---

## Out of Scope (this slice)

- CEF Gate 3 — per-variant evidence filter before variant registry update
- `evidence.tier_preference` retirement — separate slice
- GUI dashboards reading `field_candidate_evidence` directly (drawer fallback already supported)
- Pipeline (indexing) evidence shape alignment — runtimeGate uses snippet-based provenance; convergence is a separate question
- Manual override evidence shape — review workflow owns this

---

## Follow-up slices (shipped separately)

Work that builds on this evidence plumbing but isn't part of the evidence-gate fix proper:

1. **Drawer unified source display** — `tools/gui-react/src/features/review/selectors/publishedSourceSelectors.ts` consumes `candidate.metadata.evidence_refs` (plus `metadata.evidence_by_variant` for CEF Run 2+) and renders every published field — variant-dependent, variant-generator, non-variant scalar, non-variant list — through a single collapsible-row pattern with per-source confidence chips and URL links. See [../../04-features/review-workbench.md](../../04-features/review-workbench.md).
2. **CEF identity-check projection** — `colorEditionFinder.js:deferredCandidateWrite` writes `metadata.evidence_by_variant = { [variant_key]: [refs] }` from `identityCheckResult.mappings[].evidence_refs` so colors/editions variant rows can show per-variant sources. Run 1 (no identity check) falls back to global `evidence_refs`.
3. **Candidate confidence derivation** — CEF (`colorEditionFinder.js`) and RDF (`releaseDateFinder.js`) now submit `confidence = max(evidence_refs.confidence)` instead of hardcoded/self-rated values. The publisher's `publishConfidenceThreshold` gate sees honest evidence strength.
4. **Auto-reconcile on threshold change** — `configRuntimeSettingsHandler.js` detects `publishConfidenceThreshold` in the PUT patch and auto-fires `reconcileThreshold` for every category. Emits per-category `publisher-reconcile` WS events.
5. **RDF `minConfidence` retirement** — the per-finder `minConfidence` setting, `belowConfidence` flag, and associated UI were removed. `publishConfidenceThreshold` is the single source of truth. Loop satisfaction tightened from "reached publisher" to `publishStatus === 'published'`. See the [No per-finder confidence gate anti-pattern](../../07-patterns/anti-patterns.md#per-finder-confidence-gates-double-gating-the-publisher).
