# publishAnalytics.test.js Audit

Scope: `src/publish/tests/publishAnalytics.test.js`

Policy:
- Preserve publish analytics contracts for ledger totals, model/provider aggregation, source health, and accuracy trend behavior.
- Retire stale monthly-budget assertions because `buildLlmMetrics` no longer exposes the retired `budget` surface.
- Keep the empty-ledger shape check strong by asserting the live top-level counters and the absence of the removed budget group.

| Original test | Bucket | Reason | Replacement | Disposition |
| --- | --- | --- | --- | --- |
| `buildLlmMetrics: empty ledger` | COLLAPSE | The test still pinned the removed `budget` group even though the live LLM metrics contract is totals plus aggregations only. | same file | Preserved with stale `budget` assertion retired and explicit absence check added |
| `buildLlmMetrics: budget exceeded` | RETIRE | Deprecated fallback logic for retired monthly-budget config no longer protects a live publish contract. | same file | Already removed in dirty tree; no replacement kept |

## Proof

- Targeted publish analytics tests: `node --test src/publish/tests/publishAnalytics.test.js`
- Full suite: `npm test`
