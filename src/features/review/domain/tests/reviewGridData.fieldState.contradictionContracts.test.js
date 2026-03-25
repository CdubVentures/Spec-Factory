import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFieldState } from './helpers/reviewGridDataHarness.js';

test('buildFieldState propagates constraint_conflict from constraint_analysis contradictions', () => {
  const state = buildFieldState({
    field: 'weight',
    candidates: {
      weight: [
        { candidate_id: 'cand_w1', value: '59', score: 0.9, source_id: 'pipeline' },
      ],
    },
    normalized: { fields: { weight: 59 } },
    provenance: { weight: { value: 59, confidence: 0.9 } },
    summary: {
      generated_at: '2026-02-22T00:00:00.000Z',
      constraint_analysis: {
        contradictions: [
          { fields: ['weight', 'height'], code: 'constraint_conflict', severity: 'error', rule_id: 'test_rule' },
        ],
      },
    },
    includeCandidates: true,
    category: 'mouse',
    productId: 'mouse-test-constraint',
  });

  assert.ok(
    state.reason_codes.includes('constraint_conflict'),
    `reason_codes should include constraint_conflict, got: [${state.reason_codes.join(', ')}]`,
  );
  assert.ok(
    !state.reason_codes.includes('compound_range_conflict'),
    'should NOT include compound_range_conflict for code=constraint_conflict',
  );
});

test('buildFieldState propagates compound_range_conflict from constraint_analysis contradictions', () => {
  const state = buildFieldState({
    field: 'dpi',
    candidates: {
      dpi: [
        { candidate_id: 'cand_dpi1', value: '30000', score: 0.85, source_id: 'pipeline' },
      ],
    },
    normalized: { fields: { dpi: 30000 } },
    provenance: { dpi: { value: 30000, confidence: 0.85 } },
    summary: {
      generated_at: '2026-02-22T00:00:00.000Z',
      constraint_analysis: {
        contradictions: [
          { fields: ['dpi', 'sensor'], code: 'compound_range_conflict', severity: 'error', rule_id: 'sensor_dpi' },
        ],
      },
    },
    includeCandidates: true,
    category: 'mouse',
    productId: 'mouse-test-compound',
  });

  assert.ok(
    state.reason_codes.includes('compound_range_conflict'),
    `reason_codes should include compound_range_conflict, got: [${state.reason_codes.join(', ')}]`,
  );
  assert.ok(
    !state.reason_codes.includes('constraint_conflict'),
    'compound_range_conflict takes priority over constraint_conflict',
  );
});
