# Review Override Candidate Contracts Audit

Scope: `src/features/review/domain/tests/reviewOverrideCandidateContracts.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `setOverrideFromCandidate writes helper override entries from review candidates` | KEEP | Protects override payload writes from reviewed candidates. | `reviewOverrideCandidateWriteContracts.test.js` | Preserved |
| `setOverrideFromCandidate accepts synthetic candidates when candidateValue is provided` | KEEP | Protects the synthetic-candidate acceptance path used by review mutation flows. | `reviewOverrideSyntheticCandidateContracts.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted override-candidate tests | `node --test src/features/review/domain/tests/reviewOverrideCandidateWriteContracts.test.js src/features/review/domain/tests/reviewOverrideSyntheticCandidateContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
