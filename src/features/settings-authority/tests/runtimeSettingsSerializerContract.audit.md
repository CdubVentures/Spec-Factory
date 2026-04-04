# runtimeSettingsSerializerContract.test.js Audit

Scope: `src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js`

Policy:
- Preserve the runtime settings serializer contract for live PUT-surface keys, numeric fallback behavior, and live reasoning/cost payload parsing.
- Retire `llmMonthlyBudgetUsd` from this surface because it is no longer a runtime settings key.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `runtime settings serializer emits every runtime PUT frontend key` | KEEP | Public serializer surface contract. | same file | Preserved |
| `runtime settings serializer applies fallback baselines and shared token defaults` | KEEP | Public fallback/clamping contract. | same file | Preserved |
| `runtime settings serializer preserves parsed budget and reasoning knobs` | COLLAPSE | The monthly-budget assertion was stale, but the live reasoning, timeout, and cost fields still carry contract value. | same file | Renamed and narrowed to live reasoning/timeout/cost knobs |

## Proof

- Targeted cluster: `node --test src/core/llm/tests/llmPolicySchema.test.js src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js src/features/settings-authority/tests/llmPolicyRouteHandler.test.js tools/gui-react/src/features/pipeline-settings/state/__tests__/runtimeSettingsPayloadClamping.test.ts tools/gui-react/src/features/indexing/api/__tests__/indexingRunPayloadContracts.test.js`
- Surrounding settings-authority tests: `node --test src/features/settings-authority/tests/*.test.js`
- Full suite: `npm test`
