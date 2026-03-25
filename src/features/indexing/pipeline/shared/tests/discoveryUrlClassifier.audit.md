# discoveryUrlClassifier.test.js Audit

Scope: `src/features/indexing/pipeline/shared/tests/discoveryUrlClassifier.test.js`

Policy:
- Preserve identity, doc-kind, path, relevance, and classification contracts.
- Collapse case-by-case helper permutations into table-driven tests by helper family.
- Retire raw constant-membership tests when downstream function behavior already proves the constants matter.

## Identity and Doc-Kind Helpers

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `computeIdentityMatchLevel: returns none for empty input` | KEEP | Distinct empty-input contract. | `discoveryUrlClassifier.identityContracts.test.js` | Preserved |
| `computeIdentityMatchLevel: strong when brand+model+variant all match` | COLLAPSE | Same identity-match family as case-insensitive strong match. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into identity-match table |
| `computeIdentityMatchLevel: matches case-insensitively across title text` | COLLAPSE | Same identity-match family as strong/partial/weak matching. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into identity-match table |
| `computeIdentityMatchLevel: partial when brand+model match but no variant` | COLLAPSE | Same identity-match family as strong and weak match levels. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into identity-match table |
| `computeIdentityMatchLevel: weak when only brand matches` | COLLAPSE | Same identity-match family as strong and partial match levels. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into identity-match table |
| `detectVariantGuardHit: returns false for empty input` | COLLAPSE | Same variant-guard family as target-variant skip handling. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into variant-guard contract test |
| `detectVariantGuardHit: detects guard term in title` | KEEP | Distinct non-target variant detection contract. | `discoveryUrlClassifier.identityContracts.test.js` | Preserved |
| `detectVariantGuardHit: skips target variant` | KEEP | Distinct target-variant bypass contract. | `discoveryUrlClassifier.identityContracts.test.js` | Preserved |
| `detectMultiModelHint: returns false for empty input` | COLLAPSE | Same negative-detection family as false positives and single-product titles. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into multi-model false-case matrix |
| `detectMultiModelHint: detects vs pattern` | COLLAPSE | Same positive-detection family as top-N, best-N, and comparison matches. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into multi-model positive-case matrix |
| `detectMultiModelHint: detects top N pattern` | COLLAPSE | Same positive-detection family as vs/best/comparison matches. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into multi-model positive-case matrix |
| `detectMultiModelHint: detects best N mice pattern` | COLLAPSE | Same positive-detection family as vs/top/comparison matches. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into multi-model positive-case matrix |
| `detectMultiModelHint: detects comparison pattern` | COLLAPSE | Same positive-detection family as vs/top/best matches. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into multi-model positive-case matrix |
| `detectMultiModelHint: does not match "vs" inside other words` | COLLAPSE | Same negative-detection family as empty input and single-product titles. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into multi-model false-case matrix |
| `detectMultiModelHint: false for single product` | COLLAPSE | Same negative-detection family as empty input and false-positive guard. | `discoveryUrlClassifier.identityContracts.test.js` | Merged into multi-model false-case matrix |
| `guessDocKind: {…} → manual_pdf/spec_pdf/...` cases | KEEP | Core doc-kind classification surface. | `discoveryUrlClassifier.docKindContracts.test.js` | Preserved as a single table-driven contract |
| `normalizeDocHint: normalizes whitespace and hyphens to underscores` | KEEP | Distinct doc-hint normalization contract. | `discoveryUrlClassifier.docKindContracts.test.js` | Preserved |
| `docHintMatchesDocKind: exact match` | COLLAPSE | Same doc-hint matching family as mapped cross-matches. | `discoveryUrlClassifier.docKindContracts.test.js` | Merged into hint-match contract test |
| `docHintMatchesDocKind: cross-match via map` | COLLAPSE | Same doc-hint matching family as exact and invalid cases. | `discoveryUrlClassifier.docKindContracts.test.js` | Merged into hint-match contract test |
| `docHintMatchesDocKind: returns false for empty/unknown` | COLLAPSE | Same doc-hint matching family as exact and mapped cases. | `discoveryUrlClassifier.docKindContracts.test.js` | Merged into hint-match contract test |

## Path and Relevance Helpers

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `isLowSignalDiscoveryPath: root path is low signal` | COLLAPSE | Same low-signal path family as RSS, search, and Amazon search paths. | `discoveryUrlClassifier.pathContracts.test.js` | Merged into low-signal path matrix |
| `isLowSignalDiscoveryPath: RSS/XML paths are low signal` | COLLAPSE | Same low-signal path family as root, search, and Amazon search paths. | `discoveryUrlClassifier.pathContracts.test.js` | Merged into low-signal path matrix |
| `isLowSignalDiscoveryPath: search pages are low signal` | COLLAPSE | Same low-signal path family as root, RSS, and Amazon search paths. | `discoveryUrlClassifier.pathContracts.test.js` | Merged into low-signal path matrix |
| `isLowSignalDiscoveryPath: Amazon search is low signal` | COLLAPSE | Same low-signal path family as root, RSS, and generic search paths. | `discoveryUrlClassifier.pathContracts.test.js` | Merged into low-signal path matrix |
| `isLowSignalDiscoveryPath: product path is not low signal` | KEEP | Distinct high-signal product-path allowance contract. | `discoveryUrlClassifier.pathContracts.test.js` | Preserved |
| `FORUM_SUBDOMAIN_LABELS: expected entries` | RETIRE | Raw constant membership is implementation detail; forum behavior is already proven by subdomain detection. | None | Deleted |
| `isForumLikeManufacturerSubdomain: detects forum subdomains` | KEEP | Distinct forum-like subdomain detection contract. | `discoveryUrlClassifier.pathContracts.test.js` | Preserved |
| `isForumLikeManufacturerSubdomain: ignores non-forum subdomains` | KEEP | Distinct negative forum detection contract. | `discoveryUrlClassifier.pathContracts.test.js` | Preserved |
| `DISCOVERY_PRODUCT_PATH_IGNORE_TOKENS: has expected tokens` | RETIRE | Raw constant membership is implementation detail; token effects are already proven by anchor/signature behavior. | None | Deleted |
| `resolveProductPathAnchor: extracts last meaningful segment` | KEEP | Distinct path-anchor extraction contract. | `discoveryUrlClassifier.pathContracts.test.js` | Preserved |
| `resolveProductPathAnchor: combines when last is ignore token` | KEEP | Distinct ignore-token combination contract. | `discoveryUrlClassifier.pathContracts.test.js` | Preserved |
| `buildProductPathTokenSignature: extracts alpha and numeric sets` | KEEP | Distinct token-signature derivation contract. | `discoveryUrlClassifier.pathContracts.test.js` | Preserved |
| `detectSiblingManufacturerProductPage: returns false for non-manufacturer` | COLLAPSE | Same sibling-page decision family as true sibling and exact-match false cases. | `discoveryUrlClassifier.pathContracts.test.js` | Merged into sibling-page matrix |
| `detectSiblingManufacturerProductPage: detects sibling product` | COLLAPSE | Same sibling-page decision family as non-manufacturer and exact-match false cases. | `discoveryUrlClassifier.pathContracts.test.js` | Merged into sibling-page matrix |
| `detectSiblingManufacturerProductPage: returns false for exact match` | COLLAPSE | Same sibling-page decision family as non-manufacturer and true sibling cases. | `discoveryUrlClassifier.pathContracts.test.js` | Merged into sibling-page matrix |
| `isRelevantSearchResult: plan provider goes through normal relevance checks (no bypass)` | KEEP | Guards the removed plan-provider bypass. | `discoveryUrlClassifier.relevanceContracts.test.js` | Preserved |
| `isRelevantSearchResult: manufacturer role always relevant` | COLLAPSE | Same relevance-decision family as low-signal rejection and matching brand/model acceptance. | `discoveryUrlClassifier.relevanceContracts.test.js` | Merged into relevance contract matrix |
| `isRelevantSearchResult: low signal path is irrelevant` | COLLAPSE | Same relevance-decision family as manufacturer acceptance and matching brand/model acceptance. | `discoveryUrlClassifier.relevanceContracts.test.js` | Merged into relevance contract matrix |
| `isRelevantSearchResult: matching brand+model is relevant` | COLLAPSE | Same relevance-decision family as manufacturer acceptance and low-signal rejection. | `discoveryUrlClassifier.relevanceContracts.test.js` | Merged into relevance contract matrix |
| `collectDomainClassificationSeeds: from search result rows` | KEEP | Distinct primary seed-source and dedupe contract. | `discoveryUrlClassifier.relevanceContracts.test.js` | Preserved |
| `collectDomainClassificationSeeds: falls back to brand resolution` | COLLAPSE | Same fallback-seed family as empty-input behavior. | `discoveryUrlClassifier.relevanceContracts.test.js` | Merged into fallback-seed contract test |
| `collectDomainClassificationSeeds: empty input returns empty` | COLLAPSE | Same fallback-seed family as brand-resolution fallback. | `discoveryUrlClassifier.relevanceContracts.test.js` | Merged into fallback-seed contract test |
| `classifyUrlCandidate: produces expected shape` | KEEP | Public URL-candidate classification contract. | `discoveryUrlClassifier.classificationContracts.test.js` | Preserved |
| `classifyUrlCandidate: returns null for invalid URL` | KEEP | Distinct invalid-URL guard contract. | `discoveryUrlClassifier.classificationContracts.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/features/indexing/pipeline/shared/tests/discoveryUrlClassifier.identityContracts.test.js src/features/indexing/pipeline/shared/tests/discoveryUrlClassifier.docKindContracts.test.js src/features/indexing/pipeline/shared/tests/discoveryUrlClassifier.pathContracts.test.js src/features/indexing/pipeline/shared/tests/discoveryUrlClassifier.relevanceContracts.test.js src/features/indexing/pipeline/shared/tests/discoveryUrlClassifier.classificationContracts.test.js`
- Surrounding shared-pipeline tests: `node --test src/features/indexing/pipeline/shared/tests/*.test.js`
- Full suite: `npm test`
