# runtimeSettingsPayloadClamping.test.ts Audit

Scope: `tools/gui-react/src/features/pipeline-settings/state/__tests__/runtimeSettingsPayloadClamping.test.ts`

Policy:
- Preserve fallback-model token clamping behavior in `collectRuntimeSettingsPayload`.
- Retire dead helper input for `llmMonthlyBudgetUsd`, which is no longer part of the runtime settings payload surface.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `clamps plan fallback tokens against fallback model, not primary` | KEEP | Live fallback-model clamping contract. | same file | Preserved |
| `clamps reasoning fallback tokens against fallback model, not primary` | KEEP | Live fallback-model clamping contract. | same file | Preserved |
| `falls back to primary model when no fallback model is configured` | KEEP | Live fallback resolution contract. | same file | Preserved |

Fixture cleanup:
- Removed the unused `llmMonthlyBudgetUsd` helper input because it no longer affects the runtime payload surface under test.

## Proof

- Targeted cluster: `node --test src/core/llm/tests/llmPolicySchema.test.js src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js src/features/settings-authority/tests/llmPolicyRouteHandler.test.js src/publish/tests/publishAnalytics.test.js tools/gui-react/src/features/pipeline-settings/state/__tests__/runtimeSettingsPayloadClamping.test.ts tools/gui-react/src/features/indexing/api/__tests__/indexingRunPayloadContracts.test.js`
- Surrounding GUI payload/runtime tests: `node --test tools/gui-react/src/features/indexing/api/__tests__/*.test.js tools/gui-react/src/features/pipeline-settings/state/__tests__/*.test.ts tools/gui-react/src/features/pipeline-settings/state/__tests__/*.test.js`
- Full suite: `npm test`
