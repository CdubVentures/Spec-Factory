# Review Grid Data Payloads Audit

Scope: `src/features/review/domain/tests/reviewGridData.payloads.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `writeProductReviewArtifacts writes review candidates and per-field review queue` | KEEP | Protects artifact emission for product review payloads. | `reviewGridData.productArtifactsContracts.test.js` | Preserved |
| `buildProductReviewPayload can omit candidate payloads for lightweight grid rendering` | KEEP | Protects the lightweight grid payload contract when candidates are intentionally omitted. | `reviewGridData.lightweightPayloadContracts.test.js` | Preserved |
| `buildReviewQueue sorts products by urgency and writeCategoryReviewArtifacts persists queue` | KEEP | Protects queue ordering and persisted category queue artifacts. | `reviewGridData.categoryQueueContracts.test.js` | Preserved |
| `review payload and queue infer readable identity from product_id when normalized identity is missing` | KEEP | Protects user-visible identity fallback for payload and queue rows. | `reviewGridData.identityFallbackContracts.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-grid payload tests | `node --test src/features/review/domain/tests/reviewGridData.productArtifactsContracts.test.js src/features/review/domain/tests/reviewGridData.lightweightPayloadContracts.test.js src/features/review/domain/tests/reviewGridData.categoryQueueContracts.test.js src/features/review/domain/tests/reviewGridData.identityFallbackContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
