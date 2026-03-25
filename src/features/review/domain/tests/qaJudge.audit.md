# QA Judge Audit

Scope: `src/features/review/domain/tests/qaJudge.test.js`

Disposition:

| Original block | Bucket | Why | Replacement / destination | Final disposition |
| --- | --- | --- | --- | --- |
| `P03 judge: returns error when category missing` | KEEP | Input-validation contract for required identifiers. | `qaJudge.errorContracts.test.js` | Preserved |
| `P03 judge: returns error when spec not found` | KEEP | Missing-artifact contract for QA inspection. | `qaJudge.errorContracts.test.js` | Preserved |
| `P03 judge: audits complete product spec` | KEEP | Summary-count and unknown-field contract for a populated spec. | `qaJudge.summaryContracts.test.js` | Preserved |
| `P03 judge: detects fields without provenance` | KEEP | Evidence-audit contract for missing provenance entries. | `qaJudge.evidenceContracts.test.js` | Preserved |
| `P03 judge: detects provenance without source URL` | KEEP | Evidence-audit contract for incomplete provenance rows. | `qaJudge.evidenceContracts.test.js` | Preserved |
| `P03 judge: all unknown fields produce 0 coverage` | KEEP | Coverage-summary contract when every field is unknown. | `qaJudge.summaryContracts.test.js` | Preserved |
| `P03 judge: handles spec without nested fields key` | KEEP | Payload-shape compatibility contract for top-level spec fields. | `qaJudge.shapeContracts.test.js` | Preserved |

Proof log:

| Step | Result |
| --- | --- |
| Targeted QA-judge tests | `node --test src/features/review/domain/tests/qaJudge.errorContracts.test.js src/features/review/domain/tests/qaJudge.summaryContracts.test.js src/features/review/domain/tests/qaJudge.evidenceContracts.test.js src/features/review/domain/tests/qaJudge.shapeContracts.test.js` passed |
| Surrounding review domain tests | `node --test src/features/review/domain/tests/*.test.js` passed |
| Full suite | `npm test` passed |
