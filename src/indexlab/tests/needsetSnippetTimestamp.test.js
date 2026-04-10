import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNeedSet } from '../../features/indexing/pipeline/needSet/needsetEngine.js';

// Minimal helper to build field rules and provenance for testing
function buildTestInput({ fieldKey, value, confidence, evidenceRows, requiredLevel = 'required' }) {
  return {
    runId: 'test-run',
    category: 'mouse',
    productId: 'test-product',
    fieldOrder: [fieldKey],
    provenance: {
      [fieldKey]: {
        value,
        confidence,
        pass_target: 0.8,
        meets_pass_target: confidence >= 0.8,
        evidence: evidenceRows
      }
    },
    fieldRules: {
      [fieldKey]: {
        required_level: requiredLevel,
        evidence: { min_evidence_refs: 1, tier_preference: [1, 2] }
      }
    },
    now: '2026-03-09T12:00:00.000Z'
  };
}

test('missing field appears in rows with state=missing', () => {
  const input = buildTestInput({
    fieldKey: 'weight',
    value: null,
    confidence: null,
    evidenceRows: [
      { retrieved_at: '2026-03-08T10:00:00.000Z', tier: 1, url: 'https://a.com' }
    ]
  });

  const result = computeNeedSet(input);
  const row = result.rows.find((r) => r.field_key === 'weight');
  assert.ok(row, 'weight should be in rows (missing value)');
  assert.equal(row.state, 'missing');
});

test('rows contain required_level and priority_bucket', () => {
  const input = buildTestInput({
    fieldKey: 'sensor',
    value: null,
    confidence: null,
    evidenceRows: []
  });

  const result = computeNeedSet(input);
  const row = result.rows.find((r) => r.field_key === 'sensor');
  assert.ok(row);
  assert.equal(row.required_level, 'required');
  assert.equal(row.priority_bucket, 'core');
});

test('weak confidence field appears in rows with state=weak', () => {
  const input = buildTestInput({
    fieldKey: 'buttons',
    value: '5',
    confidence: 0.3,
    evidenceRows: [
      { retrieved_at: '2026-03-08T12:00:00.000Z', tier: 1, url: 'https://a.com' }
    ]
  });

  const result = computeNeedSet(input);
  const row = result.rows.find((r) => r.field_key === 'buttons');
  assert.ok(row, 'buttons should be in rows (weak confidence)');
  assert.equal(row.state, 'weak');
});

test('covered field does NOT appear in rows', () => {
  const input = buildTestInput({
    fieldKey: 'shape',
    value: 'ergonomic',
    confidence: 0.9,
    evidenceRows: [
      { retrieved_at: '2026-03-08T12:00:00.000Z', tier: 1, url: 'https://a.com' }
    ]
  });

  const result = computeNeedSet(input);
  const row = result.rows.find((r) => r.field_key === 'shape');
  assert.equal(row, undefined, 'covered field should not appear in rows');
});

test('optional field gets priority_bucket=optional', () => {
  const input = buildTestInput({
    fieldKey: 'cable',
    value: null,
    confidence: null,
    requiredLevel: 'optional',
    evidenceRows: []
  });

  const result = computeNeedSet(input);
  const row = result.rows.find((r) => r.field_key === 'cable');
  assert.ok(row);
  assert.equal(row.priority_bucket, 'optional');
});

test('total_fields reflects all evaluated fields', () => {
  const input = buildTestInput({
    fieldKey: 'dpi',
    value: null,
    confidence: null,
    evidenceRows: []
  });

  const result = computeNeedSet(input);
  assert.equal(result.total_fields, 1);
});
