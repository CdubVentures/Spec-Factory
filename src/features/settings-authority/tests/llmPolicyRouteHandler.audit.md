# llmPolicyRouteHandler.test.js Audit

Scope: `src/features/settings-authority/tests/llmPolicyRouteHandler.test.js`

Policy:
- Preserve the `/llm-policy` GET/PUT composite handler contract, including live config assembly, persistence, secret preservation, and broadcast behavior.
- Retire stale `budget.monthlyUsd` fixture noise because the live LLM policy budget group only carries token-cost fields.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `GET /llm-policy returns assembled composite with correct structure` | KEEP | Public handler GET contract. | same file | Preserved |
| `GET /llm-policy returns API keys unmasked (matches /runtime-settings pattern)` | KEEP | Public secret-read contract. | same file | Preserved |
| `PUT then GET round-trip preserves API keys (no secret corruption)` | KEEP | Public secret round-trip contract. | same file | Preserved |
| `PUT /llm-policy applies composite and returns updated policy` | COLLAPSE | The payload included stale `budget.monthlyUsd`, but only the live cost fields matter to the current schema. | same file | Dead monthly-budget fixture field removed |
| `PUT /llm-policy persists flat keys to canonical sections` | COLLAPSE | Same stale budget payload issue as the apply/update test. | same file | Dead monthly-budget fixture field removed |
| `PUT /llm-policy emits data change broadcast` | COLLAPSE | Same stale budget payload issue as the other PUT-path fixtures. | same file | Dead monthly-budget fixture field removed |
| `handler returns false for non-matching route` | KEEP | Public route-miss contract. | same file | Preserved |

## Proof

- Targeted cluster: `node --test src/core/llm/tests/llmPolicySchema.test.js src/features/settings-authority/tests/runtimeSettingsSerializerContract.test.js src/features/settings-authority/tests/llmPolicyRouteHandler.test.js src/publish/tests/publishAnalytics.test.js tools/gui-react/src/features/pipeline-settings/state/__tests__/runtimeSettingsPayloadClamping.test.ts tools/gui-react/src/features/indexing/api/__tests__/indexingRunPayloadContracts.test.js`
- Surrounding settings-authority tests: `node --test src/features/settings-authority/tests/*.test.js`
- Full suite: `npm test`
