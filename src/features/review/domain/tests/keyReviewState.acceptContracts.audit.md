# Key Review State Accept Contracts Audit

Scope: `src/features/review/domain/tests/keyReviewState.acceptContracts.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `applySharedLaneState(accept) updates selected candidate/value and does not auto-confirm` | KEEP | Protects accept-path mutation without implicit confirm. | `keyReviewState.acceptSelectionMutation.test.js` | Preserved |
| `applySharedLaneState(accept) preserves confirmed shared status when selection is unchanged` | KEEP | Protects idempotent accept behavior for already-confirmed rows. | `keyReviewState.acceptIdempotentConfirmState.test.js` | Preserved |
| `applySharedLaneState(accept) reopens shared pending when selection changes` | KEEP | Protects change-sensitive reopen behavior on accept. | `keyReviewState.acceptSelectionChangeReopensPending.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted key-review accept tests | `node --test src/features/review/domain/tests/keyReviewState.acceptSelectionMutation.test.js src/features/review/domain/tests/keyReviewState.acceptIdempotentConfirmState.test.js src/features/review/domain/tests/keyReviewState.acceptSelectionChangeReopensPending.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
