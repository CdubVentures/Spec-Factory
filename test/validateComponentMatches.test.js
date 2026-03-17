import test from 'node:test';
import assert from 'node:assert/strict';
import { validateComponentMatches } from '../src/features/indexing/validation/validateComponentMatches.js';

// ---------------------------------------------------------------------------
// Gap 1B: onUsage forwarding contract
// ---------------------------------------------------------------------------

test('validateComponentMatches accepts onUsage param without error', async () => {
  const usageCalls = [];
  const result = await validateComponentMatches({
    items: [{ review_id: 'r1', raw_query: 'test', component_type: 'sensor' }],
    componentDBs: {},
    config: {},
    logger: null,
    budgetGuard: null,
    costRates: { llmCostInputPer1M: 1, llmCostOutputPer1M: 2, llmCostCachedInputPer1M: 0.5 },
    onUsage: (row) => usageCalls.push(row),
  });

  // LLM not called (no API key), but function should accept onUsage cleanly
  assert.equal(result.enabled, false);
});

// ---------------------------------------------------------------------------
// Baseline: existing behavior preserved
// ---------------------------------------------------------------------------

test('validateComponentMatches returns empty when no items', async () => {
  const result = await validateComponentMatches({
    items: [],
    componentDBs: {},
    config: { llmApiKey: 'key', llmValidateApiKey: 'key' },
  });
  assert.equal(result.enabled, false);
  assert.deepEqual(result.decisions, []);
});
