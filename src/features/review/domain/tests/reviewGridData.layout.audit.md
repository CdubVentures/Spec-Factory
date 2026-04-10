# Review Grid Data Layout Audit

Scope: `src/features/review/domain/tests/reviewGridData.layout.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `buildReviewLayout follows field-studio row order and inherits blank group labels` | KEEP | Protects layout ordering and group-label inheritance. | `reviewGridData.layoutOrdering.test.js` | Preserved |
| `buildReviewLayout strips review-disabled rule paths before deriving field_rule metadata` | KEEP | Protects review consumer-gate stripping in layout metadata. | `reviewGridData.layoutConsumerGate.test.js` | Preserved |
| `buildReviewLayout ignores parse.unit and priority.publish_gate when deriving review field metadata - characterization (GAP-9)` | RETIRE | It only pinned what the layout builder currently ignores from field rules. That is implementation detail, not a review contract. Note: `priority.publish_gate` fully retired 2026-04-10 — now derived from `required_level`. | `reviewGridData.layoutOrdering.test.js`, `reviewGridData.layoutConsumerGate.test.js` | Deleted |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-grid layout tests | `node --test src/features/review/domain/tests/reviewGridData.layoutOrdering.test.js src/features/review/domain/tests/reviewGridData.layoutConsumerGate.test.js` passed (`2/2`) on 2026-03-24 |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed (`126/126`) on 2026-03-24 |
| Full suite | `npm test` passed (`6389/6389`) on 2026-03-24 |
