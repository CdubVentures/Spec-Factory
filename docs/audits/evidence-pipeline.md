# Evidence Pipeline Audit

Date: 2026-04-27
Worst severity: **LOW** — pipeline is healthy; the only user-visible gap is that 404'd evidence URLs aren't visually marked in the Review drawer.

## Pipeline summary

- 10-kind enum (`direct_quote`, `structured_metadata`, `byline_timestamp`, `artifact_metadata`, `visual_inspection`, `lab_measurement`, `comparative_rebadge`, `inferred_reasoning`, `absence_of_evidence`, `identity_only`).
- Backend zod: `EVIDENCE_KIND_VALUES` in `src/core/finder/evidencePromptFragment.js:31–42`.
- Frontend type union: `EVIDENCE_KIND_VALUES` in `tools/gui-react/src/shared/ui/icons/evidenceKindRegistry.ts:6–16`.
- Both lists test-locked separately.

## Producer coverage

| Finder | `includeEvidenceKind` | Schema | Notes |
|---|---|---|---|
| RDF | ✓ | `evidenceRefsExtendedSchema` | + URL HEAD-check |
| SKU | ✓ | `evidenceRefsExtendedSchema` | + URL HEAD-check |
| KF | ✗ | base | Intentional — tier-3 lightweight |
| CEF | ✗ | base | Intentional — "exists?" not "value?" |
| PIF | ✗ | base | Intentional — image URL is the evidence |

## Confidence / concrete-gate / publish gate

Single SSOT: `src/features/publisher/publish/evidenceGate.js::evaluateFieldBuckets`. Used by:
- Publisher auto-publish (`publishCandidate.js:122`) with `publishConfidenceThreshold` + `min_evidence_refs`.
- Concrete-gate / passenger exclusion (`keyConcreteEvidence.js:34`) with `passengerExcludeAtConfidence` + `passengerExcludeMinEvidence`.
- Frontend `/summary` route (`keyFinderRoutes.js:371`) for `concrete_evidence` boolean.

No duplication; client and server compute from the same evaluator.

## Diamond / tier rendering

Single SSOT: `tools/gui-react/src/pages/overview/confidenceDiamondTiers.ts:11–15`. Used by SKU/RDF Overview diamonds, KF `ConfidenceRing`, finder panels.
Tier labels: `tools/gui-react/src/shared/ui/finder/evidenceTierLabels.ts:14–26`.

## Replace-semantics

`submitCandidate.js:213` — `specDb.replaceFieldCandidateEvidence(candidateId, metadata.evidence_refs)`. Cascade FK on `field_candidate_evidence` drops old rows. UI sees fresh evidence on next query.
`submitCandidate.js:216–250` — Gate-1 inconsistency rejection (low confidence + high evidence → hard reject + cascade-delete; signals broken model calibration).

## URL HEAD-check

`submitCandidate.js:131–183` via `batchHeadCheck`:
- `accepted = 0` only on 404/410 (page is dead).
- 401/403/429/5xx/network-error get benefit of doubt (`accepted = 1`).
`fieldCandidateEvidenceStore.js:70` — `countSubstantiveByCandidateId` filters on `accepted = 1` and `evidence_kind != 'identity_only'`.

## Identified gaps

### G1. Hallucinated/404 evidence not surfaced in UI — LOW
**Files:** `tools/gui-react/src/features/review/**` Review drawer evidence list.
`accepted = 0` is recorded but never rendered. User can't tell which URLs failed verification.

**Fix shape:** in the evidence row, conditionally apply a strikethrough / warning badge / tooltip ("Failed verification: 404") when `accepted === 0`. ~30 min.

### G2. No cross-system enum-sync test — LOW
Backend and frontend `EVIDENCE_KIND_VALUES` are separately test-locked but not compared in CI.

**Fix shape:** optional one-shot script that reads both arrays and asserts they match. CI guard.

### G3. Hardcoded `evidence_kind != 'identity_only'` in SQL — INFO
`src/db/specDbStatements.js` — single hardcoded literal. Acceptable: it's a permanent contract invariant (identity-only refs aren't substantive). Worth a one-line WHY comment so future readers don't think it's accidental drift.

## Confirmed-good patterns

- Opt-in extended shape (`includeEvidenceKind: true`) keeps simple finders simple.
- Single SSOT for bucket evaluation reused across publish, concrete-gate, summary route.
- Cascade FK on `field_candidate_evidence` enforces replace-semantics atomically.
- 280-char cap on `supporting_evidence` enforced in zod (`evidencePromptFragment.js:54`).
- Prompt registry guidance for evidence kinds in `globalPromptRegistry.js:67–97`, editable per project rule.

## Recommended fix order

1. **G1** — visual indicator for `accepted = 0`. Trivial, user-facing.
2. **G3** — add WHY comment for the lone hardcoded literal.
3. **G2** — defer; existing test coverage and source control catches drift.
