# serpSelectorLlmAdapter.test.js Audit

Scope: `src/features/indexing/pipeline/resultProcessing/tests/serpSelectorLlmAdapter.test.js`

Policy:
- Preserve routed-LLM call shape, payload serialization, response schema, and usage-context contracts.
- Retire assertions that only pin adapter internals not shared across the routed-LLM adapter family.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `returns a function` | KEEP | Public factory-shape contract. | same file | Preserved |
| `calls callRoutedLlmFn with correct params` | KEEP | Core routed-LLM invocation contract. | same file | Preserved |
| `passes selectorInput as user JSON` | KEEP | Payload serialization contract. | same file | Preserved |
| `passes serpSelectorOutputSchema as jsonSchema` | KEEP | Structured-output schema contract. | same file | Preserved |
| `passes timeoutMs from config` | RETIRE | Timeout resolution belongs to routed-LLM config/routing, and sibling adapters do not expose a direct `timeoutMs` passthrough contract. | None | Deleted |
| `propagates usageContext` | KEEP | Usage-context propagation contract. | same file | Preserved |

## Proof

- Targeted file: `node --test src/features/indexing/pipeline/resultProcessing/tests/serpSelectorLlmAdapter.test.js`
- Surrounding result-processing tests: `node --test src/features/indexing/pipeline/resultProcessing/tests/*.test.js`
- Full suite: `npm test`
