import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunSummaryPayloadPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildRunSummaryPayloadPhaseCallsiteContext maps runProduct summary callsite inputs to context keys', () => {
  const context = buildRunSummaryPayloadPhaseCallsiteContext({
    productId: 'mouse-1',
    runId: 'run-1',
    category: 'mouse',
    dedupeMode: 'deterministic_v2',
    helperContext: { stats: { active_total: 1 } },
    hypothesisFollowupRoundsExecuted: 2,
    durationMs: 1000,
    normalizeAmbiguityLevel: () => 'low',
    isHelperSyntheticSource: () => false,
    buildTopEvidenceReferences: () => [],
    nowIso: () => '2026-03-06T00:00:00.000Z',
  });

  assert.equal(context.productId, 'mouse-1');
  assert.equal(context.runId, 'run-1');
  assert.equal(context.category, 'mouse');
  assert.equal(context.dedupeMode, 'deterministic_v2');
  assert.deepEqual(context.helperContext, { stats: { active_total: 1 } });
  assert.equal(context.hypothesisFollowupRoundsExecuted, 2);
  assert.equal(context.durationMs, 1000);
  assert.equal(typeof context.normalizeAmbiguityLevel, 'function');
  assert.equal(typeof context.isHelperSyntheticSource, 'function');
  assert.equal(typeof context.buildTopEvidenceReferences, 'function');
  assert.equal(typeof context.nowIso, 'function');
});
