# Component Review Identity Contracts Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.identityContracts.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `component payload hydrates __name/__maker accepted_candidate_id from key_review_state` | KEEP | Protects identity-lane hydration from shared key review state. | `componentReviewDataLaneState.identityAcceptedCandidateHydration.test.js` | Preserved |
| `component payload keeps a single row per exact component name+maker identity` | KEEP | Prevents duplicate GUI rows for the same component lane. | `componentReviewDataLaneState.identityRowDeduplication.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted identity-contract tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.identityAcceptedCandidateHydration.test.js src/features/review/domain/tests/componentReviewDataLaneState.identityRowDeduplication.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | Latest `npm test` fails outside this scope in `src/shared/tests/settingsRegistryCompleteness.test.js` |
