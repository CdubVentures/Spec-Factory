# Variance Evaluator Audit

Scope: `src/features/review/domain/tests/varianceEvaluator.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `null policy → compliant` | COLLAPSE | Same bypass-policy contract as the undefined and empty-string cases. | `varianceEvaluator.policyBypass.test.js` | Merged into table-driven bypass test |
| `undefined policy → compliant` | COLLAPSE | Same bypass-policy contract as the null and empty-string cases. | `varianceEvaluator.policyBypass.test.js` | Merged into table-driven bypass test |
| `empty string policy → compliant` | COLLAPSE | Same bypass-policy contract as the null and undefined cases. | `varianceEvaluator.policyBypass.test.js` | Merged into table-driven bypass test |
| `override_allowed → compliant regardless of values` | COLLAPSE | Same bypass-policy family as missing policies; preserved in the same focused file. | `varianceEvaluator.policyBypass.test.js` | Merged into table-driven bypass test |
| `authoritative exact string match (case-insensitive)` | COLLAPSE | Same authoritative success contract family as numeric normalization and trailing-unit normalization. | `varianceEvaluator.authoritative.test.js` | Merged into authoritative success matrix |
| `authoritative numeric match with comma formatting ("26,000" vs 26000)` | COLLAPSE | Same authoritative success contract family as string and unit-normalized matches. | `varianceEvaluator.authoritative.test.js` | Merged into authoritative success matrix |
| `authoritative numeric match with identical values` | COLLAPSE | Same authoritative success contract family as string and comma-normalized matches. | `varianceEvaluator.authoritative.test.js` | Merged into authoritative success matrix |
| `authoritative mismatch → violation with details` | KEEP | Distinct authoritative string-mismatch violation contract. | `varianceEvaluator.authoritative.test.js` | Preserved |
| `authoritative numeric mismatch → violation` | KEEP | Distinct authoritative numeric-mismatch violation contract. | `varianceEvaluator.authoritative.test.js` | Preserved |
| `upper_bound: at bound → compliant` | COLLAPSE | Same upper-bound contract family as below-bound and comma-normalized acceptance. | `varianceEvaluator.bounds.test.js` | Merged into focused upper-bound test |
| `upper_bound: below bound → compliant` | COLLAPSE | Same upper-bound contract family as at-bound and comma-normalized acceptance. | `varianceEvaluator.bounds.test.js` | Merged into focused upper-bound test |
| `upper_bound: above bound → violation` | KEEP | Distinct upper-bound violation contract. | `varianceEvaluator.bounds.test.js` | Preserved |
| `upper_bound: comma-formatted → parsed correctly` | COLLAPSE | Same upper-bound acceptance family as at-bound and below-bound cases. | `varianceEvaluator.bounds.test.js` | Merged into focused upper-bound test |
| `lower_bound: at bound → compliant` | COLLAPSE | Same lower-bound acceptance family as above-bound. | `varianceEvaluator.bounds.test.js` | Merged into focused lower-bound test |
| `lower_bound: above bound → compliant` | COLLAPSE | Same lower-bound acceptance family as at-bound. | `varianceEvaluator.bounds.test.js` | Merged into focused lower-bound test |
| `lower_bound: below bound → violation` | KEEP | Distinct lower-bound violation contract. | `varianceEvaluator.bounds.test.js` | Preserved |
| `range: within 10% (default) → compliant` | COLLAPSE | Same range-tolerance family as exact-boundary and custom-tolerance acceptance. | `varianceEvaluator.bounds.test.js` | Merged into focused range test |
| `range: exactly at boundary → compliant` | COLLAPSE | Same range-tolerance family as within-default tolerance. | `varianceEvaluator.bounds.test.js` | Merged into focused range test |
| `range: outside 10% → violation` | KEEP | Distinct range violation contract with details. | `varianceEvaluator.bounds.test.js` | Preserved |
| `range: below range → violation` | KEEP | Distinct lower-side range violation contract. | `varianceEvaluator.bounds.test.js` | Preserved |
| `range: custom tolerance` | KEEP | Distinct custom-tolerance contract. | `varianceEvaluator.bounds.test.js` | Preserved |
| `upper_bound with non-numeric values → skip (compliant)` | COLLAPSE | Same non-numeric skip contract as lower-bound and range numeric policies. | `varianceEvaluator.bounds.test.js` | Merged into numeric-skip matrix |
| `lower_bound with non-numeric values → skip (compliant)` | COLLAPSE | Same non-numeric skip contract as upper-bound and range numeric policies. | `varianceEvaluator.bounds.test.js` | Merged into numeric-skip matrix |
| `range with non-numeric values → skip (compliant)` | COLLAPSE | Same non-numeric skip contract as upper-bound and lower-bound numeric policies. | `varianceEvaluator.bounds.test.js` | Merged into numeric-skip matrix |
| `null dbValue → skip (compliant)` | COLLAPSE | Same missing-value skip contract as null product, `unk`, `n/a`, empty-string, and `unknown` cases. | `varianceEvaluator.policyBypass.test.js` | Merged into missing-value skip matrix |
| `null productValue → skip (compliant)` | COLLAPSE | Same missing-value skip contract family. | `varianceEvaluator.policyBypass.test.js` | Merged into missing-value skip matrix |
| `"unk" dbValue → skip (compliant)` | COLLAPSE | Same missing-value skip contract family. | `varianceEvaluator.policyBypass.test.js` | Merged into missing-value skip matrix |
| `"n/a" productValue → skip (compliant)` | COLLAPSE | Same missing-value skip contract family. | `varianceEvaluator.policyBypass.test.js` | Merged into missing-value skip matrix |
| `empty string productValue → skip (compliant)` | COLLAPSE | Same missing-value skip contract family. | `varianceEvaluator.policyBypass.test.js` | Merged into missing-value skip matrix |
| `"unknown" value → skip (compliant)` | COLLAPSE | Same missing-value skip contract family. | `varianceEvaluator.policyBypass.test.js` | Merged into missing-value skip matrix |
| `unknown policy string → compliant` | KEEP | Unknown-policy skip contract. | `varianceEvaluator.policyBypass.test.js` | Preserved |
| `batch with mixed results` | KEEP | Distinct mixed batch-summary contract. | `varianceEvaluator.batchContracts.test.js` | Preserved |
| `batch with upper_bound policy` | KEEP | Distinct upper-bound batch-summary contract. | `varianceEvaluator.batchContracts.test.js` | Preserved |
| `batch with override_allowed → all compliant regardless of values` | COLLAPSE | Same batch bypass family as null-policy batch. | `varianceEvaluator.batchContracts.test.js` | Merged into bypass-batch test |
| `batch with null policy → all compliant` | COLLAPSE | Same batch bypass family as override-allowed batch. | `varianceEvaluator.batchContracts.test.js` | Merged into bypass-batch test |
| `batch with empty entries → zero counts` | KEEP | Distinct empty-batch contract. | `varianceEvaluator.batchContracts.test.js` | Preserved |
| `authoritative: trailing unit stripped ("26000dpi" vs "26000")` | COLLAPSE | Same authoritative normalization family as string/comma success cases. | `varianceEvaluator.authoritative.test.js` | Merged into authoritative success matrix |
| `range with zero dbValue` | KEEP | Distinct zero-baseline range contract. | `varianceEvaluator.bounds.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted variance-evaluator tests | `node --test src/features/review/domain/tests/varianceEvaluator.policyBypass.test.js src/features/review/domain/tests/varianceEvaluator.authoritative.test.js src/features/review/domain/tests/varianceEvaluator.bounds.test.js src/features/review/domain/tests/varianceEvaluator.batchContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
