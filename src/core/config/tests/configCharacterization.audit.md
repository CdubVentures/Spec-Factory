# configCharacterization.test.js Audit

Scope: `src/core/config/tests/configCharacterization.test.js`

Policy:
- Preserve the public `loadConfig()` runtime and LLM surface contracts that still exist on the live config object.
- Retire stale assertions for keys that have been removed from the public config surface.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `config: loadConfig exposes the public runtime and llm contract surface` | COLLAPSE | The assertion for `llmMonthlyBudgetUsd` was stale because that key no longer exists on the public config object. The remaining public-surface assertions still carry contract value. | same file | Dead `llmMonthlyBudgetUsd` assertion removed; live surface checks preserved |
| `config: resolved OpenAI aliases mirror the resolved llm settings` | KEEP | Public alias contract. | same file | Preserved |
| `config: token profile map stays usable for active resolved models` | KEEP | Public token-profile contract. | same file | Preserved |
| `config: token fallback chain resolves to non-negative numbers` | KEEP | Public fallback-token contract. | same file | Preserved |
| `config: explicit overrides win and undefined overrides are ignored` | KEEP | Public override precedence contract. | same file | Preserved |
| `config: retired per-role model and fallback aliases stay off the public surface` | KEEP | Public retirement boundary contract. | same file | Preserved |
| `config: explicit plan and reasoning overrides remain independent` | KEEP | Public override independence contract. | same file | Preserved |
| `config: retired per-role token cap aliases stay off the public surface` | KEEP | Public retirement boundary contract. | same file | Preserved |

## Proof

- Targeted file: `node --test src/core/config/tests/configCharacterization.test.js`
- Surrounding config tests: `node --test src/core/config/tests/*.test.js`
- Full suite: `npm test`
