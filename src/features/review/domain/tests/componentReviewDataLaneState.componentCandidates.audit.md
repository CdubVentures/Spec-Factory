# Component Review Candidate Contracts Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.componentCandidates.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `component payload defaults non-user slot selection to highest-confidence candidate` | KEEP | Protects selected-value precedence for reviewed component slots. | `componentReviewDataLaneState.highestConfidenceSelection.test.js` | Preserved |
| `component payload keeps candidate evidence visible after shared lane confirm` | KEEP | Protects evidence visibility after shared-lane confirmation. | `componentReviewDataLaneState.candidateEvidence.test.js` | Preserved |
| `component payload synthesizes backing candidate for selected non-user value when candidate id is missing` | KEEP | Protects synthetic backfill when selected non-user values lose their candidate row. | `componentReviewDataLaneState.syntheticCandidateBackfill.test.js` | Preserved |
| `component payload aggregates candidates from ALL linked products for EVERY slot type` | KEEP | Strong aggregation contract for name, maker, and property lanes across linked products. | `componentReviewDataLaneState.candidateAggregation.test.js` | Preserved |
| `candidate_count equals candidates.length for every slot in component payload` | COLLAPSE | Weaker duplicate of the stronger multi-product aggregation contract, which already proves count alignment on every slot family. | `componentReviewDataLaneState.candidateAggregation.test.js` | Merged into stronger aggregation contract |

Proof log:

| Step | Result |
| --- | --- |
| Targeted component-candidate tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.highestConfidenceSelection.test.js src/features/review/domain/tests/componentReviewDataLaneState.syntheticCandidateBackfill.test.js src/features/review/domain/tests/componentReviewDataLaneState.candidateEvidence.test.js src/features/review/domain/tests/componentReviewDataLaneState.candidateAggregation.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
