# Component Impact Override-Allowed Cascade Audit

Scope: `src/features/review/domain/tests/componentImpact.overrideAllowedCascade.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `cascadeComponentChange override_allowed marks products stale without pushing values and keeps lowest priority` | KEEP | Protects stale-only propagation and queue-priority behavior under override-allowed mode. | `componentImpact.overrideAllowedStaleOnly.test.js` | Preserved |
| `cascadeComponentChange override_allowed still evaluates constraints` | KEEP | Distinct contract: override-allowed does not push values, but it still surfaces linked-product constraint violations. | `componentImpact.overrideAllowedConstraintEvaluation.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted override-allowed component-impact tests | `node --test src/features/review/domain/tests/componentImpact.overrideAllowedStaleOnly.test.js src/features/review/domain/tests/componentImpact.overrideAllowedConstraintEvaluation.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | Latest `npm test` fails outside this scope in `src/shared/tests/settingsRegistryCompleteness.test.js` |
