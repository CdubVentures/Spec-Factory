# Review Manual Override Contracts Audit

Scope: `src/features/review/domain/tests/reviewManualOverrideContracts.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `setManualOverride requires evidence.url and evidence.quote` | KEEP | Validation contract for manual override evidence requirements. | `reviewManualOverrideValidation.test.js` | Preserved |
| `setManualOverride writes a canonical manual override candidate id` | KEEP | Persistence and id-shape contract for manual overrides. | `reviewManualOverrideCanonicalId.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted manual-override tests | `node --test src/features/review/domain/tests/reviewManualOverrideValidation.test.js src/features/review/domain/tests/reviewManualOverrideCanonicalId.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
