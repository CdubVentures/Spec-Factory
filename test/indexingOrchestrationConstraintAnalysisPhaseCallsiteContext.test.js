import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConstraintAnalysisPhaseCallsiteContext } from '../src/features/indexing/orchestration/index.js';

test('buildConstraintAnalysisPhaseCallsiteContext maps runProduct constraint-analysis callsite inputs to context keys', () => {
  const aggregateEndpointSignalsFn = () => ({ endpoint_count: 1 });
  const evaluateConstraintGraphFn = () => ({ violations: [] });

  const context = buildConstraintAnalysisPhaseCallsiteContext({
    sourceResults: [{ role: 'manufacturer' }],
    runtimeGateResult: { failures: [] },
    normalized: { fields: { dpi: 240 } },
    provenance: { dpi: { source: 'a' } },
    categoryConfig: { criticalFieldSet: new Set(['dpi']) },
    aggregateEndpointSignalsFn,
    evaluateConstraintGraphFn,
  });

  assert.deepEqual(context.sourceResults, [{ role: 'manufacturer' }]);
  assert.deepEqual(context.runtimeGateResult, { failures: [] });
  assert.deepEqual(context.normalized, { fields: { dpi: 240 } });
  assert.deepEqual(context.provenance, { dpi: { source: 'a' } });
  assert.equal(context.aggregateEndpointSignalsFn, aggregateEndpointSignalsFn);
  assert.equal(context.evaluateConstraintGraphFn, evaluateConstraintGraphFn);
});
