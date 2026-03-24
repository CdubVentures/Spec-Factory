import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildReviewLayout,
  buildProductReviewPayload,
  buildReviewQueue,
  writeCategoryReviewArtifacts,
  writeProductReviewArtifacts,
  buildFieldState,
  makeStorage,
  writeJson,
  seedCategoryArtifacts,
  seedLatestArtifacts,
  seedQueueState,
} from './helpers/reviewGridDataHarness.js';

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
      ]
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

test('buildFieldState normalizes list slot values and keeps candidate count when candidates are omitted', () => {
  const state = buildFieldState({
    field: 'coating',
    fieldShape: 'list',
    candidates: {
      coating: [
        { candidate_id: 'cand_list_1', value: ['matte', 'matte', 'glossy'], score: 0.85, source_id: 'pipeline' },
      ]
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

test('buildFieldState propagates constraint_conflict from constraint_analysis contradictions (GAP-6)', () => {
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

  assert.ok(state.reason_codes.includes('constraint_conflict'),
    `reason_codes should include constraint_conflict, got: [${state.reason_codes.join(', ')}]`);
  assert.ok(!state.reason_codes.includes('compound_range_conflict'),
    'should NOT include compound_range_conflict for code=constraint_conflict');
});

test('buildFieldState propagates compound_range_conflict from constraint_analysis contradictions (GAP-6)', () => {
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

  assert.ok(state.reason_codes.includes('compound_range_conflict'),
    `reason_codes should include compound_range_conflict, got: [${state.reason_codes.join(', ')}]`);
  assert.ok(!state.reason_codes.includes('constraint_conflict'),
    'compound_range_conflict takes priority over constraint_conflict');
});

test('buildFieldState does not apply contract.rounding.decimals — characterization (GAP-8)', () => {
  const state = buildFieldState({
    field: 'weight',
    candidates: {
      weight: [
        { candidate_id: 'cand_round', value: '67.456', score: 0.92, source_id: 'pipeline' },
      ],
    },
    normalized: { fields: { weight: 67.456 } },
    provenance: { weight: { value: 67.456, confidence: 0.92 } },
    summary: { generated_at: '2026-02-22T00:00:00.000Z' },
    includeCandidates: true,
    category: 'mouse',
    productId: 'mouse-test-rounding',
  });

  assert.equal(state.selected.value, 67.456,
    'value should pass through as-is — contract.rounding is NOT consumed at grid level');
  assert.equal(state.candidates[0].value, '67.456',
    'candidate value should also pass through without rounding');
});
