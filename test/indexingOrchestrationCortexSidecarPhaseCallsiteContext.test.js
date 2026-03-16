import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCortexSidecarPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildCortexSidecarPhaseCallsiteContext maps runProduct cortex-sidecar callsite inputs to context keys', () => {
  const context = buildCortexSidecarPhaseCallsiteContext({
    config: { cortexEnabled: true },
    confidence: 0.86,
    criticalFieldsBelowPassTarget: ['weight_g'],
    anchorMajorConflictsCount: 1,
    constraintAnalysis: { contradictionCount: 1 },
    completenessStats: { missingRequiredFields: ['battery_life'] },
    logger: { warn() {} },
  });

  assert.deepEqual(context.config, { cortexEnabled: true });
  assert.equal(context.confidence, 0.86);
  assert.deepEqual(context.criticalFieldsBelowPassTarget, ['weight_g']);
  assert.equal(context.anchorMajorConflictsCount, 1);
  assert.deepEqual(context.constraintAnalysis, { contradictionCount: 1 });
  assert.deepEqual(context.completenessStats, { missingRequiredFields: ['battery_life'] });
  assert.equal(typeof context.logger.warn, 'function');
});
