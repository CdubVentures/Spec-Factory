# Component Review Metadata Test Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.metadata.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `edge case - :: delimiter in component name produces ambiguous identifier` | RETIRE | Implementation-coupled identifier trivia; it documents string-splitting ambiguity rather than a protected runtime contract. | None | Deleted |
| `edge case - safe identifiers have exactly 3 :: delimited parts` | RETIRE | Same implementation detail as above, with no behavioral contract at the review payload boundary. | None | Deleted |
| `edge case - confidence boundary values map to correct colors` | RETIRE | Direct helper-level duplication of the payload-level color contract. The behavior remains protected through component payload assertions. | None | Deleted |
| `edge case - confidence boundaries in component payload slots` | KEEP | User-visible payload color contract. | `componentReviewDataLaneState.varianceMetadata.test.js` | Preserved |
| `resolvePropertyFieldMeta returns variance_policy and constraints from field definition` | KEEP | Field metadata derivation contract. | `componentReviewDataLaneState.fieldMeta.test.js` | Preserved |
| `resolvePropertyFieldMeta returns enum_values and enum_policy for enum fields` | KEEP | Field metadata derivation contract. | `componentReviewDataLaneState.fieldMeta.test.js` | Preserved |
| `resolvePropertyFieldMeta returns null for unknown key` | COLLAPSE | Same helper contract family as the identity-key null case. | `componentReviewDataLaneState.fieldMeta.test.js` | Preserved with merged assertion |
| `resolvePropertyFieldMeta returns null for identity key __name` | COLLAPSE | Same helper contract family as the unknown-key null case. | `componentReviewDataLaneState.fieldMeta.test.js` | Preserved with merged assertion |
| `component payload inherits constraints from field rules, not DB row` | KEEP | Payload metadata contract. | `componentReviewDataLaneState.payloadMetadata.test.js` | Preserved |
| `component payload includes enum_values and enum_policy from field rules` | KEEP | Payload metadata contract. | `componentReviewDataLaneState.payloadMetadata.test.js` | Preserved |
| `component payload strips review-disabled constraints and enum metadata from field rules` | KEEP | Consumer-gated metadata contract. | `componentReviewDataLaneState.payloadMetadata.test.js` | Preserved |
| `override_allowed property skips variance evaluation - no violation flags despite value mismatch` | KEEP | Variance-policy behavior contract. | `componentReviewDataLaneState.varianceMetadata.test.js` | Preserved |
| `authoritative property DOES flag variance violation for same mismatch scenario` | KEEP | Variance-policy behavior contract. | `componentReviewDataLaneState.varianceMetadata.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted component-review metadata tests | Pending |
| Surrounding review domain tests | Pending |
| Full suite | Pending |
