# runtimeGate.minRefs.test.js Audit

Scope: `src/engine/tests/runtimeGate.minRefs.test.js`

Policy:
- Preserve the public runtime-gate contracts for minimum evidence-ref thresholds, distinct evidence counting, min=0/min=1 boundaries, and quality-before-count precedence.
- Collapse repeated pass/fail variants into stronger table-driven threshold and counting contracts with one harness boot per file.
- Retire wrappers that only restate already-covered opt-out behavior or redundant “greater than threshold still passes” paths.

## Threshold Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `min-refs: min=2 with 1 distinct ref -> fail` | COLLAPSE | Same threshold family as the 2-ref pass case. | `src/engine/tests/runtimeGateMinRefsThresholdContracts.test.js` | Merged into threshold contract |
| `min-refs: min=2 with 2 distinct refs -> pass` | COLLAPSE | Same threshold family as the 1-ref fail case. | `src/engine/tests/runtimeGateMinRefsThresholdContracts.test.js` | Merged into threshold contract |
| `min-refs: min=2 with 3 distinct refs -> pass` | RETIRE | Adds no public behavior beyond the “threshold met” pass contract already proven by the 2-ref case. | None | Deleted |
| `min-refs: count failure produces correct change record` | COLLAPSE | Same threshold-failure family as the 1-ref fail case. | `src/engine/tests/runtimeGateMinRefsThresholdContracts.test.js` | Merged into threshold contract |

## Distinct Counting Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `min-refs: duplicate (url, snippet_id) pairs are deduplicated` | COLLAPSE | Same distinct-counting family as missing-snippet-id boundaries. | `src/engine/tests/runtimeGateMinRefsCountingContracts.test.js` | Merged into distinct counting contract |
| `min-refs: evidence entries without snippet_id are not counted` | COLLAPSE | Same distinct-counting family as duplicate-pair boundaries. | `src/engine/tests/runtimeGateMinRefsCountingContracts.test.js` | Merged into distinct counting contract |
| `min-refs: empty evidence array counts as 0 distinct refs` | RETIRE | Not an observable distinct-count contract in the live gate because quality audit runs first on empty evidence. The real protected behavior is the quality-before-count precedence already preserved separately. | `src/engine/tests/runtimeGateMinRefsBoundaryContracts.test.js` | Deleted |

## Boundary and Precedence Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `min-refs: min=1 only runs quality check, no count check` | COLLAPSE | Same min-ref boundary family as the min=0 and non-required/min>0 boundary cases. | `src/engine/tests/runtimeGateMinRefsBoundaryContracts.test.js` | Merged into boundary contract |
| `min-refs: min=0 -> no evidence checks` | COLLAPSE | Same min-ref boundary family as the min=1 and min>0 boundary cases. evidence_required retired. | `src/engine/tests/runtimeGateMinRefsBoundaryContracts.test.js` | Merged into boundary contract |
| `min-refs: min=2 still enforces quality and count` | COLLAPSE | Same min-ref boundary family as the min=1/min=0 wrappers. evidence_required retired. | `src/engine/tests/runtimeGateMinRefsBoundaryContracts.test.js` | Merged into boundary contract |
| `min-refs: enforceEvidence=true with min=2 and 1 ref -> fail count` | COLLAPSE | Same min-ref boundary family as the non-required/min>0 wrapper. | `src/engine/tests/runtimeGateMinRefsBoundaryContracts.test.js` | Merged into boundary contract |
| `min-refs: quality failure prevents redundant count check` | KEEP | Distinct precedence contract that proves quality failures short-circuit count failures. | `src/engine/tests/runtimeGateMinRefsBoundaryContracts.test.js` | Preserved |
| `min-refs: respectPerFieldEvidence=false skips count check` | RETIRE | Duplicate of the generic per-field evidence opt-out contract already covered by `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js`. | None | Deleted |

## Proof

- Targeted replacement tests: `node --test src/engine/tests/runtimeGateMinRefs*.test.js`
- Surrounding engine tests: `node --test src/engine/tests/*.test.js`
- Full suite: `npm test`
