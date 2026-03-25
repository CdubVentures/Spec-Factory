# llmMixDetection.test.ts Audit

Scope: `tools/gui-react/src/features/llm-config/state/__tests__/llmMixDetection.test.ts`

Policy:
- Preserve the public `detectMixIssues`, `resolveRingColor`, and `detectStaleModelIssues` contracts.
- Collapse repeated single-issue checks into table-driven scenario families without weakening the warning/error boundaries.

| Original test family | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `detectMixIssues` positive issue cases | COLLAPSE | Each warning/error family was checked in its own one-case test even though the contract is scenario-driven. | `tools/gui-react/src/features/llm-config/state/__tests__/llmMixDetection.mixIssueContracts.test.ts` | Split out and table-driven |
| `detectMixIssues` negative/absence cases | COLLAPSE | Same “no stronger issue applies” boundary was repeated through multiple small fixtures. | `tools/gui-react/src/features/llm-config/state/__tests__/llmMixDetection.mixIssueContracts.test.ts` | Split out and table-driven |
| `resolveRingColor` severity and dismissal cases | COLLAPSE | Severity precedence and dismissal behavior were spread across many micro-tests. | `tools/gui-react/src/features/llm-config/state/__tests__/llmMixDetection.ringColorContracts.test.ts` | Split out and table-driven |
| `detectStaleModelIssues` warning/suppression cases | COLLAPSE | Same stale-model boundary was repeated with many one-field fixtures. | `tools/gui-react/src/features/llm-config/state/__tests__/llmMixDetection.staleModelContracts.test.ts` | Split out and table-driven |

Shared fixture:
- `tools/gui-react/src/features/llm-config/state/__tests__/fixtures/llmMixDetectionFixtures.ts`

## Proof

- Targeted replacement tests: `node --test tools/gui-react/src/features/llm-config/state/__tests__/llmMixDetection.mixIssueContracts.test.ts tools/gui-react/src/features/llm-config/state/__tests__/llmMixDetection.ringColorContracts.test.ts tools/gui-react/src/features/llm-config/state/__tests__/llmMixDetection.staleModelContracts.test.ts`
- Surrounding llm-config state tests: `node --test tools/gui-react/src/features/llm-config/state/__tests__/*.test.ts`
- Full suite:
  - `npm test` surfaced a pre-existing parallel-run failure in `src/db/tests/runStorageIndex.test.js`
  - `node --test --test-concurrency=1` passed
