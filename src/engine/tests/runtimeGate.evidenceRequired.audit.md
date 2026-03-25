# runtimeGate.evidenceRequired.test.js Audit

Scope: `src/engine/tests/runtimeGate.evidenceRequired.test.js`

Policy:
- Preserve the public runtime-gate contracts for per-field evidence gating, global `enforceEvidence`, and `respectPerFieldEvidence` opt-out behavior.
- Collapse repeated missing/incomplete/default/mixed wrappers into stronger shared-harness contracts.
- Retire helper-only assertions that do not exercise `applyRuntimeFieldRules`, plus duplicate evidence-stage change-record checks already protected elsewhere.

## Per-Field Gating Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `per-field: evidence_required=true field becomes unk when provenance missing (enforceEvidence=false)` | COLLAPSE | Same per-field gating family as incomplete provenance, default-on, and mixed-field behavior. | `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js` | Merged into per-field gating contract |
| `per-field: evidence_required=true field becomes unk when provenance incomplete (enforceEvidence=false)` | COLLAPSE | Same per-field gating family as missing provenance and default-on behavior. | `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js` | Merged into per-field gating contract |
| `per-field: evidence_required=false field is NOT checked when enforceEvidence=false)` | COLLAPSE | Same per-field gating family as default-on and mixed-field behavior. | `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js` | Merged into per-field gating contract |
| `default: respectPerFieldEvidence defaults to true (per-field enforcement active)` | COLLAPSE | Same per-field gating family as missing provenance and non-required-field bypass. | `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js` | Merged into per-field gating contract |
| `mixed: only evidence_required=true fields without provenance fail` | COLLAPSE | Same per-field gating family as missing provenance and non-required-field bypass. | `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js` | Merged into per-field gating contract |
| `per-field: unk values are skipped even when evidence_required=true` | COLLAPSE | Same opt-out/boundary family as per-field evidence suppression. | `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js` | Merged into opt-out boundary contract |
| `opt-out: respectPerFieldEvidence=false skips per-field evidence checks` | COLLAPSE | Same opt-out/boundary family as skipped-unknown behavior. | `src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js` | Merged into opt-out boundary contract |

## Global Enforcement Contracts

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `backwards-compat: enforceEvidence=true checks all fields regardless of evidence_required` | COLLAPSE | Same global-enforcement family as the good-provenance and opt-out-override wrappers. | `src/engine/tests/runtimeGateEvidenceGlobalContracts.test.js` | Merged into global enforcement contract |
| `backwards-compat: enforceEvidence=true with good provenance passes all fields` | COLLAPSE | Same global-enforcement family as the fail-path wrapper. | `src/engine/tests/runtimeGateEvidenceGlobalContracts.test.js` | Merged into global enforcement contract |
| `opt-out: respectPerFieldEvidence=false does NOT suppress global enforceEvidence=true` | COLLAPSE | Same global-enforcement family as the fail-path wrapper. | `src/engine/tests/runtimeGateEvidenceGlobalContracts.test.js` | Merged into global enforcement contract |

## Retired Wrappers

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `edge: field with no rule definition is not evidence-checked in per-field mode` | RETIRE | It only inspects `engine.getFieldRule` and does not exercise runtime-gate behavior. | None | Deleted |
| `changes: evidence failures produce correct change records` | RETIRE | Duplicate evidence-stage change-record coverage already exists in `src/engine/tests/runtimeGate.minRefs.test.js`. | None | Deleted |

## Proof

- Targeted replacement tests: `node --test src/engine/tests/runtimeGateEvidencePerFieldContracts.test.js src/engine/tests/runtimeGateEvidenceGlobalContracts.test.js`
- Surrounding engine tests: `node --test src/engine/tests/*.test.js`
- Full suite: `npm test`
