import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentityConsensusPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildIdentityConsensusPhaseCallsiteContext maps runProduct identity-consensus callsite inputs to context keys', () => {
  const evaluateIdentityGateFn = () => ({ validated: true });
  const buildIdentityReportFn = () => ({ status: 'ok' });

  const context = buildIdentityConsensusPhaseCallsiteContext({
    sourceResults: [{ url: 'https://example.com' }],
    productId: 'mouse-1',
    runId: 'run-1',
    job: { identityLock: {} },
    categoryConfig: { id: 'mouse-config' },
    fieldOrder: ['shape'],
    anchors: { shape: 'symmetrical' },
    category: 'mouse',
    config: { strict: true },
    runtimeFieldRulesEngine: { id: 'engine' },
    evaluateIdentityGateFn,
    buildIdentityReportFn,
    bestIdentityFromSourcesFn: () => ({}),
    buildIdentityObjectFn: () => ({}),
    buildSourceSummaryFn: () => ({}),
    mergeAnchorConflictListsFn: () => [],
    executeConsensusPhaseFn: () => ({}),
  });

  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.deepEqual(context.fieldOrder, ['shape']);
  assert.equal(context.evaluateIdentityGateFn, evaluateIdentityGateFn);
  assert.equal(context.buildIdentityReportFn, buildIdentityReportFn);
});
