# Component Review Payload Metadata Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.payloadMetadata.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `component payload inherits constraints from field rules, not DB row` | KEEP | Protects rule-authored metadata precedence over DB-row metadata. | `componentReviewDataLaneState.constraintsMetadata.test.js` | Preserved |
| `component payload includes enum_values and enum_policy from field rules` | KEEP | Protects enum metadata hydration from field rules. | `componentReviewDataLaneState.enumMetadata.test.js` | Preserved |
| `component payload strips review-disabled constraints and enum metadata from field rules` | KEEP | Protects review consumer-gate stripping of metadata. | `componentReviewDataLaneState.consumerGateMetadata.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted payload-metadata tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.constraintsMetadata.test.js src/features/review/domain/tests/componentReviewDataLaneState.enumMetadata.test.js src/features/review/domain/tests/componentReviewDataLaneState.consumerGateMetadata.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | Latest `npm test` fails outside this scope in `src/shared/tests/settingsRegistryCompleteness.test.js` |
