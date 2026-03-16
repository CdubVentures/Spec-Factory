import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConstraintAnalysisContext } from '../src/features/indexing/orchestration/index.js';

test('buildConstraintAnalysisContext assembles manufacturer conflict stats, endpoint mining, and constraint graph payload', () => {
  const sourceResults = [
    {
      role: 'manufacturer',
      identity: { match: true },
      anchorCheck: { majorConflicts: [{ field: 'shape' }] },
    },
    {
      role: 'manufacturer',
      identity: { match: false },
      anchorCheck: { majorConflicts: [] },
    },
    {
      role: 'review',
      identity: { match: true },
      anchorCheck: { majorConflicts: [{ field: 'weight_g' }] },
    },
  ];
  const runtimeGateResult = {
    failures: [
      {
        field: 'dpi',
        violations: [
          {
            reason_code: 'compound_range_conflict',
            effective_min: 100,
            effective_max: 200,
            actual: 240,
            sources: ['manufacturer'],
          },
          {
            reason_code: 'other',
          },
        ],
      },
      {
        field: 'weight_g',
        violations: [
          {
            reason_code: 'compound_range_conflict',
            effective_min: 50,
            effective_max: 65,
            actual: 70,
            sources: ['review'],
          },
        ],
      },
    ],
  };
  const normalized = {
    fields: {
      dpi: 240,
      weight_g: 70,
    },
  };
  const provenance = {
    dpi: { confidence: 0.9 },
    weight_g: { confidence: 0.7 },
  };
  const criticalFieldSet = new Set(['dpi']);
  const endpointMining = { endpoint_count: 7 };
  const constraintAnalysis = { violations: [{ field: 'dpi' }] };

  const result = buildConstraintAnalysisContext({
    sourceResults,
    runtimeGateResult,
    normalized,
    provenance,
    categoryConfig: { criticalFieldSet },
    aggregateEndpointSignalsFn: (rows, limit) => {
      assert.equal(rows, sourceResults);
      assert.equal(limit, 80);
      return endpointMining;
    },
    evaluateConstraintGraphFn: (payload) => {
      assert.deepEqual(payload, {
        fields: normalized.fields,
        provenance,
        criticalFieldSet,
        crossValidationFailures: [
          {
            field_key: 'dpi',
            reason_code: 'compound_range_conflict',
            effective_min: 100,
            effective_max: 200,
            actual: 240,
            sources: ['manufacturer'],
          },
          {
            field_key: 'weight_g',
            reason_code: 'compound_range_conflict',
            effective_min: 50,
            effective_max: 65,
            actual: 70,
            sources: ['review'],
          },
        ],
      });
      return constraintAnalysis;
    },
  });

  assert.deepEqual(result.manufacturerSources, [sourceResults[0], sourceResults[1]]);
  assert.equal(result.manufacturerMajorConflicts, 1);
  assert.equal(result.endpointMining, endpointMining);
  assert.equal(result.constraintAnalysis, constraintAnalysis);
});
