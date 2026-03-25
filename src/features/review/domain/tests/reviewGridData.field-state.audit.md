# Review Grid Data Field State Audit

Scope:

- `src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.fieldState.contradictionContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.fieldState.characterization.test.js`
- `src/features/review/domain/tests/reviewGridData.lightweightPayloadContracts.test.js`
- `src/features/review/domain/tests/reviewGridData.productArtifactsContracts.test.js`
- `src/features/review/contracts/tests/reviewFieldContract.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `buildFieldState backfills selected candidate/source when selected value has no explicit candidates` | KEEP | Protects fallback selection hydration when provenance supplies the only selected value. | `reviewGridData.fieldState.selectionContracts.test.js` | Preserved |
| `buildFieldState enforces scalar slot shape and selects top actionable candidate` | KEEP | Protects scalar-slot candidate filtering and best-candidate selection. | `reviewGridData.fieldState.selectionContracts.test.js` | Preserved |
| `buildFieldState normalizes list slot values and keeps candidate count when candidates are omitted` | KEEP | Protects list-slot rendering and lightweight candidate omission behavior. | `reviewGridData.fieldState.listContracts.test.js` | Preserved |
| `buildFieldState propagates constraint_conflict from constraint_analysis contradictions (GAP-6)` | KEEP | Protects contradiction signaling for standard constraint conflicts. | `reviewGridData.fieldState.contradictionContracts.test.js` | Preserved |
| `buildFieldState propagates compound_range_conflict from constraint_analysis contradictions (GAP-6)` | KEEP | Protects contradiction signaling precedence for compound range conflicts. | `reviewGridData.fieldState.contradictionContracts.test.js` | Preserved |
| `buildFieldState does not apply contract.rounding.decimals - characterization (GAP-8)` | RETIRE | It only locked the current numeric pass-through of one builder path. No field-state contract, route contract, or surrounding review payload test treats grid-layer rounding as a public guarantee. | None. Existing contract coverage remains in `reviewGridData.fieldState.selectionContracts.test.js`, `reviewGridData.fieldState.listContracts.test.js`, `reviewGridData.fieldState.contradictionContracts.test.js`, `reviewGridData.lightweightPayloadContracts.test.js`, `reviewGridData.productArtifactsContracts.test.js`, and `reviewFieldContract.test.js`. | Deleted |

Proof log:

| Step | Result |
| --- | --- |
| Targeted review-grid field-state tests | `node --test src/features/review/domain/tests/reviewGridData.fieldState.selectionContracts.test.js src/features/review/domain/tests/reviewGridData.fieldState.listContracts.test.js src/features/review/domain/tests/reviewGridData.fieldState.contradictionContracts.test.js src/features/review/domain/tests/reviewGridData.lightweightPayloadContracts.test.js src/features/review/domain/tests/reviewGridData.productArtifactsContracts.test.js src/features/review/contracts/tests/reviewFieldContract.test.js` passed, 16/16 |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed, 127/127 |
| Full suite | `npm test` passed, 6503/6503 |
| Live validation | Not required. The retired test did not protect runtime-critical behavior beyond existing review contract coverage. |
