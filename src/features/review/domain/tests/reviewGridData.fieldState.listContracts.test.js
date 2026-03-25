import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFieldState } from './helpers/reviewGridDataHarness.js';

test('buildFieldState normalizes list slot values and keeps candidate count when candidates are omitted', () => {
  const state = buildFieldState({
    field: 'coating',
    fieldShape: 'list',
    candidates: {
      coating: [
        { candidate_id: 'cand_list_1', value: ['matte', 'matte', 'glossy'], score: 0.85, source_id: 'pipeline' },
      ],
    },
    normalized: { fields: { coating: ['matte', 'glossy'] } },
    provenance: { coating: { confidence: 0.8, source: 'pipeline' } },
    summary: { generated_at: '2026-02-19T00:00:00.000Z' },
    includeCandidates: false,
    category: 'mouse',
    productId: 'mouse-test-list-shape',
  });

  assert.equal(state.selected.value, 'matte, glossy');
  assert.equal(state.candidate_count, 1);
  assert.deepEqual(state.candidates, []);
});
