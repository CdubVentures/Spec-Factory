# Review Component Helpers Audit

Scope: `src/features/review/domain/tests/reviewComponentHelpers.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `parseReviewItemAttributes parses object, JSON string, and rejects invalid` | KEEP | Protects attribute parsing for review items consumed by maker matching and SpecDb hydration. | `reviewComponentHelpers.parsingContracts.test.js` | Preserved |
| `resolveFieldRulesEntries finds fields at multiple nesting levels` | RETIRE | Internal field-container lookup is not a user-visible contract; stronger downstream field-rule behavior is already protected by component-property and enum-review tests. | None | Deleted |
| `componentLaneSlug combines name and maker` | KEEP | Protects stable lane slug generation used in candidate ids and lane addressing. | `reviewComponentHelpers.makerLaneContracts.test.js` | Preserved |
| `isTestModeCategory detects test categories` | RETIRE | The real behavior is the test-mode discovery cap, already protected by `enforceNonDiscoveredRows`; the standalone prefix detector adds no extra contract value. | None | Deleted |
| `discoveredFromSource recognizes pipeline sources` | RETIRE | Source inference is preserved by the stronger `normalizeDiscoveryRows` contract, so the standalone token helper test is redundant. | None | Deleted |
| `normalizeDiscoveryRows normalizes source and infers discovered flag` | KEEP | Protects discovery-source normalization and inferred discovery state. | `reviewComponentHelpers.discoveryContracts.test.js` | Preserved |
| `enforceNonDiscoveredRows caps non-discovered in test mode` | KEEP | Protects the test-mode backlog cap for undiscovered rows. | `reviewComponentHelpers.discoveryContracts.test.js` | Preserved |
| `enforceNonDiscoveredRows passes through in non-test mode` | KEEP | Guards non-test categories from unwanted discovery-state mutation. | `reviewComponentHelpers.discoveryContracts.test.js` | Preserved |
| `resolveDeclaredComponentPropertyColumns extracts property keys from field rules` | KEEP | Protects declared property-column extraction for review component tables. | `reviewComponentHelpers.propertyColumnContracts.test.js` | Preserved |
| `resolveDeclaredComponentPropertyColumns returns empty for missing type` | KEEP | Guards the empty/missing component-type contract. | `reviewComponentHelpers.propertyColumnContracts.test.js` | Preserved |
| `mergePropertyColumns merges and deduplicates columns` | COLLAPSE | Same property-column contract family as the declared-column extraction tests. | `reviewComponentHelpers.propertyColumnContracts.test.js` | Merged into focused property-column contract |
| `makerTokensFromReviewItem extracts maker tokens from attributes and ai_suggested_maker` | KEEP | Protects maker-token extraction used by lane matching. | `reviewComponentHelpers.makerLaneContracts.test.js` | Preserved |
| `makerTokensFromReviewItem returns empty for missing attributes` | COLLAPSE | Same maker-lane contract family as lane matching and token extraction. | `reviewComponentHelpers.makerLaneContracts.test.js` | Merged into stronger maker-lane contract |
| `reviewItemMatchesMakerLane matches by maker token` | KEEP | Protects maker-lane routing for named lanes. | `reviewComponentHelpers.makerLaneContracts.test.js` | Preserved |
| `reviewItemMatchesMakerLane empty maker matches makerless items` | KEEP | Protects makerless-lane routing behavior. | `reviewComponentHelpers.makerLaneContracts.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-component-helper tests | `node --test src/features/review/domain/tests/reviewComponentHelpers.parsingContracts.test.js src/features/review/domain/tests/reviewComponentHelpers.discoveryContracts.test.js src/features/review/domain/tests/reviewComponentHelpers.propertyColumnContracts.test.js src/features/review/domain/tests/reviewComponentHelpers.makerLaneContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
