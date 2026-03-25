# llmModelDropdownOptions.test.ts Audit

Scope: `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.test.ts`

Policy:
- Preserve the public dropdown-option merge, sort/label, API-key filter, and missing-value fallback contracts.
- Collapse repetitive one-case mapping tests into table-driven family contracts.
- Retire the zero-signal `apiKeyFilter=undefined preserves existing behavior` check because other unfiltered contracts already cover the default path.

| Original test family | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| Empty/flat-only/registry-only merge and label cases | COLLAPSE | Same merge-family contract exercised through many one-case inputs. | `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.mergeContracts.test.ts` | Split out and table-driven |
| Role-filtering include/exclude cases | COLLAPSE | Same role-filter boundary repeated with single-case fixtures. | `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.mergeContracts.test.ts` | Split out and table-driven |
| Sort-order and label-enrichment cases | COLLAPSE | Role, token, cost, and label-formatting priorities were spread across one-case tests. | `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.sortContracts.test.ts` | Split out and table-driven |
| API-key filter and filtered-registry leak prevention cases | COLLAPSE | Same filter-family contract repeated as many one-case checks. | `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.apiKeyFilterContracts.test.ts` | Split out and table-driven |
| `apiKeyFilter=undefined preserves existing behavior (no filtering)` | RETIRE | No standalone contract value beyond the already-preserved unfiltered merge cases. | None | Deleted |
| `ensureValueInOptions` null/fallback cases | COLLAPSE | Same missing-value fallback contract repeated across minimal fixtures. | `tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.ensureValueContracts.test.ts` | Split out and table-driven |

Shared fixture:
- `tools/gui-react/src/features/llm-config/state/__tests__/fixtures/llmModelDropdownFixtures.ts`

## Proof

- Targeted replacement tests: `node --test tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.mergeContracts.test.ts tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.sortContracts.test.ts tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.apiKeyFilterContracts.test.ts tools/gui-react/src/features/llm-config/state/__tests__/llmModelDropdownOptions.ensureValueContracts.test.ts`
- Surrounding llm-config state tests: `node --test tools/gui-react/src/features/llm-config/state/__tests__/*.test.ts`
- Full suite:
  - `npm test` surfaced a pre-existing parallel-run failure in `src/db/tests/runStorageIndex.test.js`
  - `node --test --test-concurrency=1` passed
