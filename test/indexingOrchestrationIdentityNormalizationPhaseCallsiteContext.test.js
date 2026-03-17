import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityNormalizationPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildIdentityNormalizationPhaseCallsiteContext maps runProduct identity-normalization callsite inputs to context keys', () => {
  const buildAbortedNormalizedFn = () => ({ fields: {}, quality: {} });
  const buildValidatedNormalizedFn = () => ({ fields: {}, quality: {} });
  const createEmptyProvenanceFn = () => ({});

  const context = buildIdentityNormalizationPhaseCallsiteContext({
    config: {},
    identityConfidence: 0.8,
    allowHelperProvisionalFill: true,
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    identity: { brand: 'Logitech' },
    sourceSummary: { source_count: 1 },
    fieldOrder: ['shape'],
    consensus: { fields: { shape: 'symmetrical' } },
    categoryConfig: { criticalFieldSet: new Set(['shape']) },
    buildAbortedNormalizedFn,
    buildValidatedNormalizedFn,
    createEmptyProvenanceFn,
    passTargetExemptFields: new Set(['id']),
  });

  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.allowHelperProvisionalFill, true);
  assert.equal(context.buildAbortedNormalizedFn, buildAbortedNormalizedFn);
  assert.equal(context.buildValidatedNormalizedFn, buildValidatedNormalizedFn);
  assert.equal(context.createEmptyProvenanceFn, createEmptyProvenanceFn);
});
