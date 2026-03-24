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
| `ensureTrackedStateCandidateInvariant mutates state with candidates` | KEEP | Core tracked-state invariant contract. | `reviewCandidateInfrastructure.invariants.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant synthesizes missing accepted candidate` | KEEP | Guards selected-candidate synthesis. | `reviewCandidateInfrastructure.invariants.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant user-driven path preserves selected` | KEEP | Guards user-driven override behavior. | `reviewCandidateInfrastructure.invariants.test.js` | Preserved |
| `ensureTrackedStateCandidateInvariant is no-op for non-object` | COLLAPSE | Defensive guard duplicated across both invariant helpers. | `reviewCandidateInfrastructure.invariants.test.js` | Merged into combined non-object guard test |
| `ensureEnumValueCandidateInvariant mutates entry with candidates` | KEEP | Core enum-entry invariant contract. | `reviewCandidateInfrastructure.invariants.test.js` | Preserved |
| `ensureEnumValueCandidateInvariant user-driven path` | KEEP | Guards enum user-override behavior. | `reviewCandidateInfrastructure.invariants.test.js` | Preserved |
| `ensureEnumValueCandidateInvariant is no-op for non-object` | COLLAPSE | Same defensive guard as the tracked-state no-op test. | `reviewCandidateInfrastructure.invariants.test.js` | Merged into combined non-object guard test |
| `isSharedLanePending returns expected states` | KEEP | Shared-lane pending-state contract used by component and enum review surfaces. | `reviewCandidateInfrastructure.reviewStateContracts.test.js` | Preserved |
| `toSpecDbCandidate builds candidate from row` | KEEP | SpecDb candidate conversion contract. | `reviewCandidateInfrastructure.specDbContracts.test.js` | Preserved |
| `toSpecDbCandidate uses fallback id` | COLLAPSE | Same conversion contract family as the main SpecDb candidate test. | `reviewCandidateInfrastructure.specDbContracts.test.js` | Merged into stronger conversion test |
| `appendAllSpecDbCandidates deduplicates and skips empty values` | KEEP | Prevents duplicate/empty candidate hydration. | `reviewCandidateInfrastructure.specDbContracts.test.js` | Preserved |
| `normalizeCandidateSharedReviewStatus handles synthetic, review rows, and source tokens` | KEEP | Shared-review status normalization contract. | `reviewCandidateInfrastructure.reviewStateContracts.test.js` | Preserved |
| `isReviewItemCandidateVisible hides dismissed/ignored/rejected` | KEEP | Candidate visibility filter contract for hydrated review rows. | `reviewCandidateInfrastructure.reviewStateContracts.test.js` | Preserved |
| `hasActionableCandidate requires non-synthetic with known value` | KEEP | Protects actionable-candidate gating. | `reviewCandidateInfrastructure.reviewStateContracts.test.js` | Preserved |
| `shouldIncludeEnumValueEntry filters unlinked pipeline pending entries` | KEEP | Guards enum-entry filtering for pending pipeline values. | `reviewCandidateInfrastructure.reviewStateContracts.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted candidate-infrastructure tests | Pending |
| Surrounding review domain tests | Pending |
| Full suite | `npm test` passed |
