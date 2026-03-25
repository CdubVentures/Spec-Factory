# Key Review State Audit

Scope: `src/features/review/domain/tests/keyReviewState.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `applySharedLaneState(confirm) does not change selected candidate/value or clear shared accept` | KEEP | Protects confirm-path stability for existing shared lane selections. | `keyReviewState.confirmPreservesAcceptedSelection.test.js` | Preserved |
| `applySharedLaneState(accept) updates selected candidate/value and does not auto-confirm` | KEEP | Protects accept-path mutation without implicit confirm. | `keyReviewState.acceptSelectionMutation.test.js` | Preserved |
| `applySharedLaneState(accept) preserves confirmed shared status when selection is unchanged` | KEEP | Protects idempotent accept behavior for already-confirmed rows. | `keyReviewState.acceptIdempotentConfirmState.test.js` | Preserved |
| `applySharedLaneState(accept) reopens shared pending when selection changes` | KEEP | Protects change-sensitive reopen behavior on accept. | `keyReviewState.acceptSelectionChangeReopensPending.test.js` | Preserved |
| `applySharedLaneState(confirm) on new row creates state without auto-accept` | KEEP | Protects new-row creation semantics for confirm actions. | `keyReviewState.confirmCreatesSharedState.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted key-review-state tests | `node --test src/features/review/domain/tests/keyReviewState.confirmPreservesAcceptedSelection.test.js src/features/review/domain/tests/keyReviewState.confirmCreatesSharedState.test.js src/features/review/domain/tests/keyReviewState.acceptSelectionMutation.test.js src/features/review/domain/tests/keyReviewState.acceptIdempotentConfirmState.test.js src/features/review/domain/tests/keyReviewState.acceptSelectionChangeReopensPending.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
