# evidenceEnforcementDefault.test.js Audit

Scope: `src/engine/tests/evidenceEnforcementDefault.test.js`

Policy:
- Preserve only distinct runtime-gate evidence behavior that is not already protected by `runtimeGate.core`, `runtimeGate.evidenceRequired`, or `runtimeGate.minRefs`.
- Retire wrapper tests that just restate the same global-enforcement, opt-out, or change-record contracts through a second near-identical authority fixture.
- Keep the single stage-precedence contract that proves normalize failures short-circuit evidence auditing.

## Global Evidence Enforcement Overlap

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `A.1 enforce: field with value but no evidence provenance is zeroed out` | RETIRE | Duplicates the global `enforceEvidence=true` failure coverage already held by `src/engine/tests/runtimeGate.core.test.js` and `src/engine/tests/runtimeGate.evidenceRequired.test.js`. | None | Deleted |
| `A.1 enforce: strict enforcement via runtimeGate accepts complete provenance (BUG FIXED)` | RETIRE | Duplicates the global strict-pass contract already covered by `src/engine/tests/runtimeGate.evidenceRequired.test.js`. | None | Deleted |
| `A.1 enforce: weight preserved, sensor zeroed - mixed evidence (BUG FIXED)` | RETIRE | It only combines already-covered global pass and fail branches into one wrapper fixture. | None | Deleted |
| `A.1 enforce off: fields without evidence pass when enforceEvidence=false and per-field off` | RETIRE | Duplicates the per-field opt-out contract already covered by `src/engine/tests/runtimeGate.evidenceRequired.test.js` and `src/engine/tests/runtimeGate.minRefs.test.js`. | None | Deleted |
| `A.1 enforce: changes list records before/after for evidence failures` | RETIRE | Duplicates the evidence-stage change-record contract already covered by `src/engine/tests/runtimeGate.evidenceRequired.test.js` and `src/engine/tests/runtimeGate.minRefs.test.js`. | None | Deleted |

## Stage Precedence Contract

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `A.1 enforce: normalization failures happen before evidence check` | KEEP | Distinct runtime ordering contract: normalize failures must short-circuit evidence auditing and evidence-stage failures. | `src/engine/tests/runtimeGateEvidencePrecedence.test.js` | Preserved |

## Proof

- Targeted replacement tests: `node --test src/engine/tests/runtimeGateEvidencePrecedence.test.js`
- Surrounding engine tests: `node --test src/engine/tests/*.test.js`
- Full suite: `npm test`
