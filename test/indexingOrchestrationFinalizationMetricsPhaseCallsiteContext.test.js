import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalizationMetricsPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildFinalizationMetricsPhaseCallsiteContext maps runProduct finalization-metrics callsite inputs to context keys', () => {
  const context = buildFinalizationMetricsPhaseCallsiteContext({
    sourceResults: [{ parserHealth: { health_score: 1 } }],
    fieldOrder: ['weight_g'],
    normalized: { fields: { weight_g: 54 } },
    provenance: { weight_g: { source: 'example' } },
  });

  assert.deepEqual(context.sourceResults, [{ parserHealth: { health_score: 1 } }]);
  assert.deepEqual(context.fieldOrder, ['weight_g']);
  assert.deepEqual(context.normalized, { fields: { weight_g: 54 } });
  assert.deepEqual(context.provenance, { weight_g: { source: 'example' } });
});
