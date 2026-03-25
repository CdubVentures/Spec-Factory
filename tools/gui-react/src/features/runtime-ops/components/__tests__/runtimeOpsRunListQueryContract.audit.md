# runtimeOpsRunListQueryContract.test.js Audit

Scope: `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListQueryContract.test.js`

Policy:
- Preserve the runtime-ops run-list query scoping, active fallback-row labeling, loading-state visibility, and identity-missing label contracts.
- Collapse the repeated bundled-module stub stack into a shared harness so the surviving contracts are isolated and parallelizable.
- Retire the duplicate full-label assertion from the loading-state case because the active-fallback label contract already owns that behavior.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `runtime ops page scopes run-list query key and request by category` | KEEP | Distinct query-key and request-shape contract. | `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListQueryScope.test.js` | Preserved |
| `runtime ops page builds active fallback label from live run identity and target storage` | KEEP | Distinct active fallback-row label and storage-state contract. | `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListActiveFallbackLabel.test.js` | Preserved |
| `runtime ops page shows loading status above the picker when live fallback row is present` | COLLAPSE | The old test re-asserted the full fallback label already covered by the active-row contract. The unique contract is the loading status with a still-present fallback row. | `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListLoadingStatus.test.js` | Split out; duplicate label assertion retired |
| `runtime ops page loading fallback row does not duplicate the category when identity is missing` | KEEP | Distinct identity-missing label contract. | `tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListIdentityFallbackLabel.test.js` | Preserved |

Shared harness:
- `tools/gui-react/src/features/runtime-ops/components/__tests__/helpers/runtimeOpsRunListHarness.js`

## Proof

- Targeted replacement tests: `node --test tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListQueryScope.test.js tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListActiveFallbackLabel.test.js tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListLoadingStatus.test.js tools/gui-react/src/features/runtime-ops/components/__tests__/runtimeOpsRunListIdentityFallbackLabel.test.js`
- Surrounding runtime-ops component tests: `node --test tools/gui-react/src/features/runtime-ops/components/__tests__/*.test.js`
- Full suite: `npm test`
