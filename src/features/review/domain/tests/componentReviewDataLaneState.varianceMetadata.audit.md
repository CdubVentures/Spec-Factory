# Component Review Variance Metadata Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.varianceMetadata.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `confidence boundaries are reflected in component payload slot colors` | KEEP | User-visible payload color contract. | `componentReviewDataLaneState.varianceConfidenceColors.test.js` | Preserved |
| `override_allowed properties skip variance violations in component payloads` | KEEP | Variance-policy behavior contract for review payload metadata. | `componentReviewDataLaneState.varianceOverrideAllowedMetadata.test.js` | Preserved |
| `authoritative properties still flag variance violations in component payloads` | KEEP | Variance-policy behavior contract for review payload metadata. | `componentReviewDataLaneState.varianceAuthoritativeMetadata.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted variance-metadata tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.varianceConfidenceColors.test.js src/features/review/domain/tests/componentReviewDataLaneState.varianceOverrideAllowedMetadata.test.js src/features/review/domain/tests/componentReviewDataLaneState.varianceAuthoritativeMetadata.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | Latest `npm test` fails outside this scope in `src/shared/tests/settingsRegistryCompleteness.test.js` |
