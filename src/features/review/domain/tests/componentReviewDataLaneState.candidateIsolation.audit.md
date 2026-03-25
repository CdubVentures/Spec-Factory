# Component Review Candidate Isolation Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.candidateIsolation.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `component payload does not hydrate queue-only property candidates when linked product candidates drive the slot` | KEEP | Guards candidate-source precedence for linked component slots. | `componentReviewDataLaneState.queueCandidateExclusion.test.js` | Preserved |
| `component payload isolates same-name lanes by maker for linked-product candidate attribution` | KEEP | Guards maker-lane isolation for same-name components. | `componentReviewDataLaneState.makerLaneIsolation.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted candidate-isolation tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.queueCandidateExclusion.test.js src/features/review/domain/tests/componentReviewDataLaneState.makerLaneIsolation.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
