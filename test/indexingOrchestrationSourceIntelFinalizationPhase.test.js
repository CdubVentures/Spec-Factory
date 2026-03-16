import test from 'node:test';
import assert from 'node:assert/strict';
import { runSourceIntelFinalizationPhase } from '../src/features/indexing/orchestration/index.js';

test('runSourceIntelFinalizationPhase delegates source-intel persistence and stamps summary payload', async () => {
  const calls = [];
  const summary = {};
  const expectedIntelResult = {
    domainStatsKey: 'runs/r1/domain_stats.json',
    promotionSuggestionsKey: 'runs/r1/promotion_suggestions.json',
    expansionPlanKey: 'runs/r1/expansion_plan.json',
    brandExpansionPlanCount: 3,
  };

  const result = await runSourceIntelFinalizationPhase({
    storage: { id: 'storage' },
    config: { enableIntel: true },
    category: 'mouse',
    productId: 'mouse-product',
    brand: 'Logitech',
    sourceResults: [{ url: 'https://example.com' }],
    provenance: { dpi: [{ url: 'https://example.com' }] },
    categoryConfig: { category: 'mouse' },
    constraintAnalysis: { conflicts: [] },
    summary,
    persistSourceIntelFn: async (payload) => {
      calls.push(payload);
      return expectedIntelResult;
    },
  });

  assert.deepEqual(calls, [{
    storage: { id: 'storage' },
    config: { enableIntel: true },
    category: 'mouse',
    productId: 'mouse-product',
    brand: 'Logitech',
    sourceResults: [{ url: 'https://example.com' }],
    provenance: { dpi: [{ url: 'https://example.com' }] },
    categoryConfig: { category: 'mouse' },
    constraintAnalysis: { conflicts: [] },
  }]);
  assert.deepEqual(summary.source_intel, {
    domain_stats_key: 'runs/r1/domain_stats.json',
    promotion_suggestions_key: 'runs/r1/promotion_suggestions.json',
    expansion_plan_key: 'runs/r1/expansion_plan.json',
    brand_expansion_plan_count: 3,
  });
  assert.equal(result, expectedIntelResult);
});
