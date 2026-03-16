import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeNeedSet } from '../src/indexlab/needsetEngine.js';

// WHY: computeEvidenceDecay was removed in Phase 12 NeedSet legacy removal.
// decayConfig is no longer accepted by computeNeedSet.
// These tests verify that computeNeedSet ignores obsolete decay params gracefully.

describe('computeNeedSet without decay (legacy removal)', () => {
  const baseFieldOrder = ['weight', 'sensor'];
  const baseFieldRules = {
    weight: { required_level: 'required', min_evidence_refs: 1 },
    sensor: { required_level: 'required', min_evidence_refs: 1 }
  };

  it('covered field stays covered regardless of evidence age (no decay)', () => {
    const provenance = {
      weight: {
        value: '58g',
        confidence: 0.9,
        pass_target: 0.8,
        meets_pass_target: true,
        evidence: [{ url: 'https://example.com', retrieved_at: '2025-03-01T00:00:00.000Z' }]
      },
      sensor: {
        value: 'PAW3950',
        confidence: 0.9,
        pass_target: 0.8,
        meets_pass_target: true,
        evidence: [{ url: 'https://example.com', retrieved_at: '2025-06-14T00:00:00.000Z' }]
      }
    };

    const result = computeNeedSet({
      runId: 'test-run',
      category: 'mouse',
      productId: 'test-mouse',
      fieldOrder: baseFieldOrder,
      provenance,
      fieldRules: baseFieldRules,
      now: '2025-06-15T00:00:00.000Z'
    });

    // Both fields have confidence 0.9 >= pass_target 0.8, so neither should appear in rows
    const weightRow = result.rows.find((r) => r.field_key === 'weight');
    const sensorRow = result.rows.find((r) => r.field_key === 'sensor');
    assert.equal(weightRow, undefined, 'weight should be covered (no decay applied)');
    assert.equal(sensorRow, undefined, 'sensor should be covered');
  });

  it('unknown decayConfig param is ignored gracefully', () => {
    const provenance = {
      weight: {
        value: '58g',
        confidence: 0.9,
        pass_target: 0.8,
        meets_pass_target: true,
        evidence: [{ url: 'https://example.com', retrieved_at: '2025-03-01T00:00:00.000Z' }]
      }
    };

    // Passing obsolete decayConfig should not crash
    const result = computeNeedSet({
      runId: 'test-run',
      category: 'mouse',
      productId: 'test-mouse',
      fieldOrder: ['weight'],
      provenance,
      fieldRules: { weight: { required_level: 'required', min_evidence_refs: 1 } },
      now: '2025-06-15T00:00:00.000Z',
      decayConfig: { decayDays: 14, decayFloor: 0.3 }
    });

    assert.ok(result.total_fields >= 1);
    const weightRow = result.rows.find((r) => r.field_key === 'weight');
    assert.equal(weightRow, undefined, 'weight should still be covered (decayConfig ignored)');
  });

  it('missing value is still flagged regardless of evidence age', () => {
    const provenance = {
      weight: {
        value: 'unk',
        confidence: null,
        pass_target: 0.8,
        meets_pass_target: false,
        evidence: [{ url: 'https://example.com' }]
      }
    };

    const result = computeNeedSet({
      runId: 'test-run',
      category: 'mouse',
      productId: 'test-mouse',
      fieldOrder: ['weight'],
      provenance,
      fieldRules: { weight: { required_level: 'required', min_evidence_refs: 1 } },
      now: '2025-06-15T00:00:00.000Z'
    });

    const weightRow = result.rows.find((r) => r.field_key === 'weight');
    assert.ok(weightRow, 'missing weight should appear in rows');
    assert.equal(weightRow.state, 'missing');
  });
});
