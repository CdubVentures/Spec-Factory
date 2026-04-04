# indexingRunPayloadContracts.test.js Audit

Scope: `tools/gui-react/src/features/indexing/api/__tests__/indexingRunPayloadContracts.test.js`

Policy:
- Preserve GUI run-start payload assembly, registry-driven numeric parsing, and runtime payload propagation contracts.
- Retire `llmMonthlyBudgetUsd` from the parsed-values fixture because that key is no longer part of the registry-driven runtime numeric surface.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `deriveIndexingRunStartParsedValues parses runtime numeric settings and falls back to baseline` | COLLAPSE | The monthly-budget parsed key was stale; the real contract is generic parsing of active int/float registry entries. | same file | Repointed to live float key `llmCostInputPer1M` plus `maxPagesPerDomain` |
| `buildIndexingRunStartPayload composes and clamps cross-domain run payload fields` | COLLAPSE | The parsed-values fixture still carried stale `parsedLlmMonthlyBudgetUsd` noise. | same file | Dead parsed monthly-budget fixture field removed |
| `buildIndexingRunStartPayload propagates all runtimeSettingsPayload keys via spread` | KEEP | Public payload-spread contract. | same file | Preserved |

## Proof

- Targeted cluster: `node --test src/core/llm/tests/llmPolicySchema.test.js src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js src/features/settings-authority/tests/llmPolicyRouteHandler.test.js tools/gui-react/src/features/pipeline-settings/state/__tests__/runtimeSettingsPayloadClamping.test.ts tools/gui-react/src/features/indexing/api/__tests__/indexingRunPayloadContracts.test.js`
- Surrounding GUI payload/runtime tests: `node --test tools/gui-react/src/features/indexing/api/__tests__/*.test.js tools/gui-react/src/features/pipeline-settings/state/__tests__/*.test.ts tools/gui-react/src/features/pipeline-settings/state/__tests__/*.test.js`
- Full suite: `npm test`
