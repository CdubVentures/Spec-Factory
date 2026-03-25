# Review Candidate Infrastructure Audit

Scope: `src/features/review/domain/tests/reviewCandidateInfrastructure.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `valueToken normalizes scalars and objects` | KEEP | Protects canonical value-token normalization used across candidate matching and invariants. | `reviewCandidateInfrastructure.valueContracts.test.js` | Preserved |
| `hasKnownValue rejects unknowns` | KEEP | Protects candidate/value gating for review payloads. | `reviewCandidateInfrastructure.valueContracts.test.js` | Preserved |
| `clamp01 clamps to [0,1] with fallback` | RETIRE | Duplicate of shared primitive coverage in `src/shared/tests/primitives.test.js`; the review domain only re-exports it and does not need a second contract test. | None | Deleted |
| `normalizeSourceToken maps source aliases` | KEEP | Protects source-token normalization used for candidate attribution. | `reviewCandidateInfrastructure.sourceContracts.test.js` | Preserved |
| `sourceLabelFromToken returns display labels` | KEEP | Protects human-readable source labeling. | `reviewCandidateInfrastructure.sourceContracts.test.js` | Preserved |
| `sourceMethodFromToken returns method strings` | KEEP | Protects source-method derivation for synthetic/specdb candidates. | `reviewCandidateInfrastructure.sourceContracts.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant mutates state with candidates` | KEEP | Core tracked-state invariant contract. | `reviewCandidateInfrastructure.trackedInvariantContracts.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant synthesizes missing accepted candidate` | KEEP | Guards selected-candidate synthesis. | `reviewCandidateInfrastructure.trackedInvariantContracts.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant user-driven path preserves selected` | KEEP | Guards user-driven override behavior. | `reviewCandidateInfrastructure.trackedInvariantContracts.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant is no-op for non-object` | RETIRE | Defensive invalid-input tolerance is not a review-domain contract boundary. | None | Deleted |
| `ensureEnumValueCandidateInvariant mutates entry with candidates` | KEEP | Core enum-entry invariant contract. | `reviewCandidateInfrastructure.enumInvariantContracts.test.js` | Preserved |
| `ensureEnumValueCandidateInvariant user-driven path` | KEEP | Guards enum user-override behavior. | `reviewCandidateInfrastructure.enumInvariantContracts.test.js` | Preserved |
| `ensureEnumValueCandidateInvariant is no-op for non-object` | RETIRE | Same invalid-input guard as the tracked-state no-op case; not a product contract. | None | Deleted |
| `isSharedLanePending returns expected states` | KEEP | Shared-lane pending-state contract used by component and enum review surfaces. | `reviewCandidateInfrastructure.sharedLanePending.test.js` | Preserved |
| `toSpecDbCandidate builds candidate from row` | KEEP | SpecDb candidate conversion contract. | `reviewCandidateInfrastructure.specDbContracts.test.js` | Preserved |
| `toSpecDbCandidate uses fallback id` | COLLAPSE | Same conversion contract family as the main SpecDb candidate test. | `reviewCandidateInfrastructure.specDbContracts.test.js` | Merged into stronger conversion test |
| `appendAllSpecDbCandidates deduplicates and skips empty values` | KEEP | Prevents duplicate/empty candidate hydration. | `reviewCandidateInfrastructure.specDbContracts.test.js` | Preserved |
| `normalizeCandidateSharedReviewStatus handles synthetic, review rows, and source tokens` | KEEP | Shared-review status normalization contract. | `reviewCandidateInfrastructure.sharedReviewStatus.test.js` | Preserved |
| `isReviewItemCandidateVisible hides dismissed/ignored/rejected` | KEEP | Candidate visibility filter contract for hydrated review rows. | `reviewCandidateInfrastructure.candidateVisibility.test.js` | Preserved |
| `hasActionableCandidate requires non-synthetic with known value` | KEEP | Protects actionable-candidate gating. | `reviewCandidateInfrastructure.actionableCandidate.test.js` | Preserved |
| `shouldIncludeEnumValueEntry filters unlinked pipeline pending entries` | KEEP | Guards enum-entry filtering for pending pipeline values. | `reviewCandidateInfrastructure.enumEntryInclusion.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted candidate-infrastructure tests | `node --test src/features/review/domain/tests/reviewCandidateInfrastructure.valueContracts.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.sourceContracts.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.specDbContracts.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.trackedInvariantContracts.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.enumInvariantContracts.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.sharedLanePending.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.sharedReviewStatus.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.candidateVisibility.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.actionableCandidate.test.js src/features/review/domain/tests/reviewCandidateInfrastructure.enumEntryInclusion.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
