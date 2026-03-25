# Component Review Candidate Selection Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.candidateSelection.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `component payload defaults non-user slot selection to highest-confidence candidate` | KEEP | Protects selected-value precedence for reviewed component slots. | `componentReviewDataLaneState.highestConfidenceSelection.test.js` | Preserved |
| `component payload synthesizes backing candidate for selected non-user value when candidate id is missing` | KEEP | Protects synthetic backfill when selected non-user values lose their candidate row. | `componentReviewDataLaneState.syntheticCandidateBackfill.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted candidate-selection tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.highestConfidenceSelection.test.js src/features/review/domain/tests/componentReviewDataLaneState.syntheticCandidateBackfill.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
