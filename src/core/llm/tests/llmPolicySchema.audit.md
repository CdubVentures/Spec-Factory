# llmPolicySchema.test.js Audit

Scope: `src/core/llm/tests/llmPolicySchema.test.js`

Policy:
- Preserve the live `assembleLlmPolicy` / `disassembleLlmPolicy` round-trip contract derived from `RUNTIME_SETTINGS_REGISTRY`.
- Retire stale `llmMonthlyBudgetUsd` expectations because that key is no longer part of the LLM policy flat-key surface.
- Restore direct coverage for the live `llmMaxOutputTokensTriage` flat key and the live budget cost fields.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `assembleLlmPolicy + disassembleLlmPolicy round-trip identity` | COLLAPSE | The fixture omitted the live triage token key and still carried retired `llmMonthlyBudgetUsd`. | same file | Fixture updated to cover `llmMaxOutputTokensTriage`; dead monthly-budget key removed |
| `assembleLlmPolicy structures flat keys into groups` | COLLAPSE | The old assertion pinned a retired monthly budget field instead of the live budget cost fields. | same file | Repointed to `costInputPer1M`, `costOutputPer1M`, and `costCachedInputPer1M` |
| `assembleLlmPolicy uses defaults for missing keys` | KEEP | Default assembly contract. | same file | Preserved |
| `disassembleLlmPolicy flattens composite to flat keys` | COLLAPSE | Strengthened to assert a live budget flat key instead of relying on unasserted fixture data. | same file | Preserved and tightened |
| `DEFAULT_LLM_POLICY has correct structure` | KEEP | Public default policy shape contract. | same file | Preserved |
| `LLM_POLICY_FLAT_KEYS contains expected keys` | COLLAPSE | Needed to encode both the live triage key and the retired monthly-budget boundary. | same file | Added explicit live/retired boundary checks |
| `phaseOverrides JSON round-trip preserves nested objects` | KEEP | Public JSON round-trip contract. | same file | Preserved |
| `providerRegistry JSON round-trip preserves array` | KEEP | Public provider-registry round-trip contract. | same file | Preserved |

## Proof

- Targeted cluster: `node --test src/core/llm/tests/llmPolicySchema.test.js src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js src/features/settings-authority/tests/llmPolicyRouteHandler.test.js tools/gui-react/src/features/pipeline-settings/state/__tests__/runtimeSettingsPayloadClamping.test.ts tools/gui-react/src/features/indexing/api/__tests__/indexingRunPayloadContracts.test.js`
- Surrounding core LLM tests: `node --test src/core/llm/tests/*.test.js`
- Full suite: `npm test`
