# Review Grid Data Layout Audit

Scope: `src/features/review/domain/tests/reviewGridData.layout.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `buildReviewLayout follows field-studio row order and inherits blank group labels` | KEEP | Protects layout ordering and group-label inheritance. | `reviewGridData.layoutOrdering.test.js` | Preserved |
| `buildReviewLayout strips review-disabled rule paths before deriving field_rule metadata` | KEEP | Protects review consumer-gate stripping in layout metadata. | `reviewGridData.layoutConsumerGate.test.js` | Preserved |
| `buildReviewLayout ignores parse.unit and priority.publish_gate when deriving review field metadata — characterization (GAP-9)` | KEEP | Characterizes current layout metadata behavior until those fields are intentionally consumed. | `reviewGridData.layoutCharacterization.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-grid layout tests | `node --test src/features/review/domain/tests/reviewGridData.layoutOrdering.test.js src/features/review/domain/tests/reviewGridData.layoutConsumerGate.test.js src/features/review/domain/tests/reviewGridData.layoutCharacterization.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | Latest `npm test` fails outside this scope in `src/shared/tests/settingsRegistryCompleteness.test.js` |
