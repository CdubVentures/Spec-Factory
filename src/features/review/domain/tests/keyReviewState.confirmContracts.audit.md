# Key Review State Confirm Contracts Audit

Scope: `src/features/review/domain/tests/keyReviewState.confirmContracts.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `applySharedLaneState(confirm) does not change selected candidate/value or clear shared accept` | KEEP | Protects confirm-path stability for existing shared lane selections. | `keyReviewState.confirmPreservesAcceptedSelection.test.js` | Preserved |
| `applySharedLaneState(confirm) on new row creates state without auto-accept` | KEEP | Protects new-row creation semantics for confirm actions. | `keyReviewState.confirmCreatesSharedState.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted key-review confirm tests | `node --test src/features/review/domain/tests/keyReviewState.confirmPreservesAcceptedSelection.test.js src/features/review/domain/tests/keyReviewState.confirmCreatesSharedState.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
