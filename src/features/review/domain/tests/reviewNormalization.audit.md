# Review Normalization Audit

Scope: `src/features/review/domain/tests/reviewNormalization.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `isObject returns true only for plain objects` | RETIRE | Shared primitive re-export coverage already exists outside the review domain and does not protect review-specific behavior. | None | Deleted |
| `toArray wraps non-arrays and passes arrays through` | RETIRE | Shared primitive re-export coverage already exists outside the review domain and does not protect review-specific behavior. | None | Deleted |
| `normalizeToken trims, lowercases, and handles edge cases` | RETIRE | Shared primitive re-export coverage already exists outside the review domain and does not protect review-specific behavior. | None | Deleted |
| `normalizeFieldKey strips non-alphanumeric-underscore and trims underscores` | KEEP | Review-specific field-key normalization contract. | `reviewNormalization.fieldContracts.test.js` | Preserved |
| `normalizeField strips fields. prefix then normalizes` | KEEP | Review-specific field normalization contract. | `reviewNormalization.fieldContracts.test.js` | Preserved |
| `slugify creates URL-safe slugs` | KEEP | Review-specific slug contract used in candidate and enum helpers. | `reviewNormalization.tokenContracts.test.js` | Preserved |
| `splitCandidateParts splits comma-separated values and deduplicates` | COLLAPSE | Same candidate-part splitting contract family as the recursive-array case. | `reviewNormalization.tokenContracts.test.js` | Merged into focused tokenization test |
| `splitCandidateParts handles arrays recursively` | COLLAPSE | Same candidate-part splitting contract family as the comma-splitting case. | `reviewNormalization.tokenContracts.test.js` | Merged into focused tokenization test |
| `normalizePathToken creates safe path tokens with fallback` | COLLAPSE | Same path-token normalization contract family as the default-fallback case. | `reviewNormalization.tokenContracts.test.js` | Merged into focused tokenization test |
| `normalizePathToken uses default fallback when not specified` | COLLAPSE | Same path-token normalization contract family as the explicit-fallback case. | `reviewNormalization.tokenContracts.test.js` | Merged into focused tokenization test |
| `toFloat parses floats with fallback` | RETIRE | External shared helper coverage; not a review-normalization contract. | None | Deleted |
| `parseDateMs parses ISO dates to milliseconds with fallback` | RETIRE | Mis-scoped duplicate of broader date-parser coverage; review consumers are already exercised by higher-level workflow tests. | None | Deleted |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-normalization tests | `node --test src/features/review/domain/tests/reviewNormalization.fieldContracts.test.js src/features/review/domain/tests/reviewNormalization.tokenContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
