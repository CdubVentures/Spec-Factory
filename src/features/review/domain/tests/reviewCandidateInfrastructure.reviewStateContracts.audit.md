# Review Candidate Infrastructure Review-State Contracts Audit

Scope: `src/features/review/domain/tests/reviewCandidateInfrastructure.reviewStateContracts.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `isSharedLanePending returns expected states` | KEEP | Shared-lane pending-state contract used by component and enum review surfaces. | `reviewCandidateInfrastructure.sharedLanePending.test.js` | Preserved |
| `normalizeCandidateSharedReviewStatus handles synthetic, review rows, and source tokens` | KEEP | Shared-review status normalization contract. | `reviewCandidateInfrastructure.sharedReviewStatus.test.js` | Preserved |
| `isReviewItemCandidateVisible hides dismissed, ignored, and rejected rows` | KEEP | Candidate visibility filter contract for hydrated review rows. | `reviewCandidateInfrastructure.candidateVisibility.test.js` | Preserved |
| `hasActionableCandidate requires non-synthetic candidates with known values and ids` | KEEP | Protects actionable-candidate gating. | `reviewCandidateInfrastructure.actionableCandidate.test.js` | Preserved |
| `shouldIncludeEnumValueEntry filters unlinked pending pipeline entries` | KEEP | Guards enum-entry filtering for pending pipeline values. | `reviewCandidateInfrastructure.enumEntryInclusion.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-state tests | `node --test src/features/review/domain/tests/reviewCandidateInfrastructure.sharedLanePending.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.sharedReviewStatus.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.candidateVisibility.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.actionableCandidate.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.enumEntryInclusion.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
