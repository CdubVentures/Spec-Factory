# Component Review Enum Payload Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.enumPayload.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `enum payload keeps pending when AI shared lane is pending even if user accepted` | KEEP | Protects enum payload review-state propagation when AI shared confirmation still gates readiness. | `componentReviewDataLaneState.enumPayload.sharedState.test.js` | Preserved |
| `enum payload synthesizes backing candidate when selected non-manual value has no candidate row` | KEEP | Protects fallback candidate hydration for authoritative enum selections. | `componentReviewDataLaneState.enumPayload.candidateContracts.test.js` | Preserved |
| `enum payload hides pending pipeline values without linked products` | KEEP | Protects visibility filtering for unlinked pending enum values. | `componentReviewDataLaneState.enumPayload.visibilityContracts.test.js` | Preserved |
| `enum payload requires SpecDb authority when building review payloads` | KEEP | Guards the explicit `specdb_not_ready` contract. | `componentReviewDataLaneState.enumPayload.guardContracts.test.js` | Preserved |
| `edge case - enum values with different casing are stored as distinct rows` | RETIRE | SpecDb row-storage behavior is not an enum review payload contract, and this file should not protect raw list-value persistence semantics. | None | Deleted |

Proof log:

| Step | Result |
| --- | --- |
| Targeted enum-payload tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.enumPayload.sharedState.test.js src/features/review/domain/tests/componentReviewDataLaneState.enumPayload.candidateContracts.test.js src/features/review/domain/tests/componentReviewDataLaneState.enumPayload.visibilityContracts.test.js src/features/review/domain/tests/componentReviewDataLaneState.enumPayload.guardContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
