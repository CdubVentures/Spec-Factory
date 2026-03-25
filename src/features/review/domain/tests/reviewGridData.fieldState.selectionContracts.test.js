import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFieldState } from './helpers/reviewGridDataHarness.js';

test('buildFieldState backfills selected candidate/source when selected value has no explicit candidates', () => {
  const state = buildFieldState({
    field: 'sensor',
    candidates: { sensor: [] },
    normalized: { fields: { sensor: 'PAW3950' } },
    provenance: {
      sensor: {
        value: 'PAW3950',
        confidence: 0.91,
        source: 'pipeline',
        evidence: [],
      },
    },
    summary: {
      generated_at: '2026-02-19T00:00:00.000Z',
    },
    includeCandidates: true,
    category: 'mouse',
    productId: 'mouse-test-sensor',
  });

  assert.equal(state.selected.value, 'PAW3950');
  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidate_count, 1);
  assert.equal(state.candidates[0].source_id, 'pipeline');
  assert.equal(state.source, 'Pipeline');
});

test('buildFieldState enforces scalar slot shape and selects top actionable candidate', () => {
  const state = buildFieldState({
    field: 'sensor',
    fieldShape: 'scalar',
    candidates: {
      sensor: [
        { candidate_id: 'cand_bad', value: ['PAW3950', 'PAW3395'], score: 0.95, source_id: 'pipeline' },
        { candidate_id: 'cand_good', value: 'PAW3950', score: 0.9, source_id: 'pipeline' },
      ],
    },
    normalized: { fields: { sensor: { value: 'unk', unknown_reason: 'shape_mismatch' } } },
    provenance: { sensor: { confidence: 0 } },
    summary: { generated_at: '2026-02-19T00:00:00.000Z' },
    includeCandidates: true,
    category: 'mouse',
    productId: 'mouse-test-sensor-shape',
  });

  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0].candidate_id, 'cand_good');
  assert.equal(state.selected.value, 'PAW3950');
  assert.equal(state.selected_candidate_id, 'cand_good');
});
