# Component Review Row Contracts Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.componentRows.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `component payload hydrates __name/__maker accepted_candidate_id from key_review_state` | KEEP | Protects identity-lane hydration from shared key review state. | `componentReviewDataLaneState.identityContracts.test.js` | Preserved |
| `component payload keeps contract-declared property columns when component values are blank` | COLLAPSE | Mixed payload-row and layout-column contracts in one block. | `componentReviewDataLaneState.layoutContracts.test.js` | Preserved as smaller contract tests |
| `component layout item_count matches visible payload rows` | KEEP | Layout summary contract for visible component rows. | `componentReviewDataLaneState.layoutContracts.test.js` | Preserved |
| `component payload does not hydrate queue-only property candidates when linked product candidates drive the slot` | KEEP | Guards candidate-source precedence for linked component slots. | `componentReviewDataLaneState.candidateIsolation.test.js` | Preserved |
| `component payload isolates same-name lanes by maker for linked-product candidate attribution` | KEEP | Guards maker-lane isolation for same-name components. | `componentReviewDataLaneState.candidateIsolation.test.js` | Preserved |
| `component payload keeps a single row per exact component name+maker identity` | KEEP | Prevents duplicate GUI rows for the same component lane. | `componentReviewDataLaneState.identityContracts.test.js` | Preserved |
| `component payload keeps shared pending when AI lane is still pending even after user accept` | KEEP | Protects pending-state precedence when AI review is unresolved. | `componentReviewDataLaneState.pendingLaneState.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted component-row tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.identityContracts.test.js src/features/review/domain/tests/componentReviewDataLaneState.layoutContracts.test.js src/features/review/domain/tests/componentReviewDataLaneState.candidateIsolation.test.js src/features/review/domain/tests/componentReviewDataLaneState.pendingLaneState.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
