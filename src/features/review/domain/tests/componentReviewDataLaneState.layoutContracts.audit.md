# Component Review Layout Contracts Audit

Scope: `src/features/review/domain/tests/componentReviewDataLaneState.layoutContracts.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `component payload keeps contract-declared property columns when component values are blank` | KEEP | Protects payload-row projection of contract-declared blank property columns. | `componentReviewDataLaneState.layoutPayloadColumns.test.js` | Preserved |
| `component layout keeps contract-declared property columns when component values are blank` | KEEP | Protects layout projection of contract-declared blank property columns. | `componentReviewDataLaneState.layoutTypeColumns.test.js` | Preserved |
| `component layout item_count matches visible payload rows` | KEEP | Layout summary contract for visible component rows. | `componentReviewDataLaneState.layoutItemCount.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted layout-contract tests | `node --test src/features/review/domain/tests/componentReviewDataLaneState.layoutPayloadColumns.test.js src/features/review/domain/tests/componentReviewDataLaneState.layoutTypeColumns.test.js src/features/review/domain/tests/componentReviewDataLaneState.layoutItemCount.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | Latest `npm test` fails outside this scope in `src/shared/tests/settingsRegistryCompleteness.test.js` |
