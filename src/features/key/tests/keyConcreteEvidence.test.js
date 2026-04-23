/**
 * keyConcreteEvidence — boundary contract.
 *
 * Wraps the publisher's deterministic evaluateFieldBuckets with the higher
 * passenger-exclude thresholds (default 95 conf / 3 evd). A field is "concrete"
 * when its bucket would publish under the stricter thresholds — same gate the
 * publisher uses, just tighter. Used by buildPassengers (exclusion) and the
 * summary row builder (display) so UI and runtime can never drift.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isConcreteEvidence } from '../keyConcreteEvidence.js';

function rule(overrides = {}) {
  return {
    contract: { type: 'string', shape: 'scalar' },
    evidence: { min_evidence_refs: 1 }, // NOTE: overridden by requiredOverride at runtime
    ...overrides,
  };
}

function makeSpecDb({ bucketsByFieldKey = {}, pooledByFingerprint = {} } = {}) {
  return {
    listFieldBuckets: ({ fieldKey }) => bucketsByFieldKey[fieldKey] || [],
    countPooledQualifyingEvidenceByFingerprint: ({ fieldKey, fingerprint, minConfidence }) => {
      const key = `${fieldKey}|${fingerprint}|${minConfidence}`;
      return Number(pooledByFingerprint[key] || 0);
    },
  };
}

describe('isConcreteEvidence — disabled-state tolerance', () => {
  it('returns false when excludeConf is 0', () => {
    const specDb = makeSpecDb({
      bucketsByFieldKey: {
        dpi: [{ value_fingerprint: 'fp1', top_confidence: 98, member_ids: [1], value: '1600' }],
      },
      pooledByFingerprint: { 'dpi|fp1|0.95': 5 },
    });
    const result = isConcreteEvidence({
      specDb, productId: 'p1', fieldKey: 'dpi', fieldRule: rule(),
      excludeConf: 0, excludeEvd: 3,
    });
    assert.equal(result, false, 'excludeConf=0 disables the check');
  });

  it('returns false when excludeEvd is 0', () => {
    const specDb = makeSpecDb({
      bucketsByFieldKey: {
        dpi: [{ value_fingerprint: 'fp1', top_confidence: 98, member_ids: [1], value: '1600' }],
      },
      pooledByFingerprint: { 'dpi|fp1|0.95': 5 },
    });
    const result = isConcreteEvidence({
      specDb, productId: 'p1', fieldKey: 'dpi', fieldRule: rule(),
      excludeConf: 95, excludeEvd: 0,
    });
    assert.equal(result, false, 'excludeEvd=0 disables the check');
  });

  it('returns false when specDb lacks listFieldBuckets (legacy stub)', () => {
    const specDb = { /* no listFieldBuckets */ };
    const result = isConcreteEvidence({
      specDb, productId: 'p1', fieldKey: 'dpi', fieldRule: rule(),
      excludeConf: 95, excludeEvd: 3,
    });
    assert.equal(result, false, 'missing listFieldBuckets tolerated, returns false');
  });
});

describe('isConcreteEvidence — evaluator result', () => {
  it('returns true when a bucket qualifies under the stricter thresholds', () => {
    const specDb = makeSpecDb({
      bucketsByFieldKey: {
        dpi: [{
          value_fingerprint: 'fp_1600',
          top_confidence: 98, // 0-100 scale, normalized to 0.98 in evaluator
          member_ids: [1, 2, 3],
          value: '1600',
        }],
      },
      // At minConfidence=0.95, 4 qualifying refs pooled. requiredOverride=3 → gate2 pass.
      pooledByFingerprint: { 'dpi|fp_1600|0.95': 4 },
    });
    const result = isConcreteEvidence({
      specDb, productId: 'p1', fieldKey: 'dpi', fieldRule: rule(),
      excludeConf: 95, excludeEvd: 3,
    });
    assert.equal(result, true);
  });

  it('returns false when bucket top confidence is below excludeConf', () => {
    const specDb = makeSpecDb({
      bucketsByFieldKey: {
        dpi: [{
          value_fingerprint: 'fp_1600',
          top_confidence: 94, // below 95
          member_ids: [1],
          value: '1600',
        }],
      },
      // gate 1 fails → pooled count irrelevant, but evaluator still stubs the
      // call path. Stub returns something just so the mock is defensively complete.
      pooledByFingerprint: { 'dpi|fp_1600|0.95': 10 },
    });
    const result = isConcreteEvidence({
      specDb, productId: 'p1', fieldKey: 'dpi', fieldRule: rule(),
      excludeConf: 95, excludeEvd: 3,
    });
    assert.equal(result, false, 'top_confidence below threshold fails gate 1');
  });

  it('returns false when pooled qualifying count is below excludeEvd', () => {
    const specDb = makeSpecDb({
      bucketsByFieldKey: {
        dpi: [{
          value_fingerprint: 'fp_1600',
          top_confidence: 99,
          member_ids: [1, 2],
          value: '1600',
        }],
      },
      pooledByFingerprint: { 'dpi|fp_1600|0.95': 2 }, // below requirement of 3
    });
    const result = isConcreteEvidence({
      specDb, productId: 'p1', fieldKey: 'dpi', fieldRule: rule(),
      excludeConf: 95, excludeEvd: 3,
    });
    assert.equal(result, false, 'pooled count below requiredOverride fails gate 2');
  });

  it('bucket qualifies under default (0.7 / min_evidence_refs=1) but NOT under stricter thresholds → false', () => {
    // Weakly published bucket: top_confidence=75, pooled=1 at threshold 0.7.
    // Publisher would publish (gate1=true, gate2 trivially pass at min=1).
    // Under stricter 0.95/3 thresholds: gate1 fails (75 < 95).
    const specDb = makeSpecDb({
      bucketsByFieldKey: {
        dpi: [{
          value_fingerprint: 'fp_1600',
          top_confidence: 75,
          member_ids: [1],
          value: '1600',
        }],
      },
      pooledByFingerprint: {
        'dpi|fp_1600|0.95': 0, // nothing qualifies at the stricter per-ref threshold
        'dpi|fp_1600|0.7': 1,  // would qualify under publisher's default
      },
    });
    const result = isConcreteEvidence({
      specDb, productId: 'p1', fieldKey: 'dpi', fieldRule: rule(),
      excludeConf: 95, excludeEvd: 3,
    });
    assert.equal(result, false);
  });

  it('no buckets at all → false', () => {
    const specDb = makeSpecDb({ bucketsByFieldKey: { dpi: [] } });
    const result = isConcreteEvidence({
      specDb, productId: 'p1', fieldKey: 'dpi', fieldRule: rule(),
      excludeConf: 95, excludeEvd: 3,
    });
    assert.equal(result, false);
  });
});
