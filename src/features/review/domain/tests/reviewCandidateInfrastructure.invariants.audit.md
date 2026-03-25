# Review Candidate Infrastructure Invariants Audit

Scope: `src/features/review/domain/tests/reviewCandidateInfrastructure.invariants.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `ensureTrackedStateCandidateInvariant mutates state with candidates` | KEEP | Core tracked-state invariant contract. | `reviewCandidateInfrastructure.trackedInvariantContracts.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant synthesizes missing accepted candidate` | KEEP | Guards selected-candidate synthesis. | `reviewCandidateInfrastructure.trackedInvariantContracts.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant preserves selected values on user-driven paths` | KEEP | Guards user-driven override behavior. | `reviewCandidateInfrastructure.trackedInvariantContracts.test.js` | Preserved |
| `ensureEnumValueCandidateInvariant mutates entry with candidates` | KEEP | Core enum-entry invariant contract. | `reviewCandidateInfrastructure.enumInvariantContracts.test.js` | Preserved |
| `ensureEnumValueCandidateInvariant preserves selected values on user-driven paths` | KEEP | Guards enum user-override behavior. | `reviewCandidateInfrastructure.enumInvariantContracts.test.js` | Preserved |
| `candidate invariant helpers are no-ops for non-object inputs` | RETIRE | Defensive null-tolerance for invalid helper inputs is not a review-domain contract boundary. | None | Deleted |

Proof log:

| Step | Result |
| --- | --- |
| Targeted invariant tests | `node --test src/features/review/domain/tests/reviewCandidateInfrastructure.trackedInvariantContracts.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.enumInvariantContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
