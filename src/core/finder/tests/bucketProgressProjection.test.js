import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectBucketsForProgress } from '../bucketProgressProjection.js';

describe('projectBucketsForProgress', () => {
  it('returns [] for null/undefined/empty', () => {
    assert.deepEqual(projectBucketsForProgress(null, { required: 2 }), []);
    assert.deepEqual(projectBucketsForProgress(undefined, { required: 2 }), []);
    assert.deepEqual(projectBucketsForProgress([], { required: 2 }), []);
  });

  it('projects a scalar bucket to { fp, label, count, required, qualifies, topConf }', () => {
    const out = projectBucketsForProgress([
      { value_fingerprint: 'paw3395', value: 'PAW3395', pooledCount: 2, qualifies: true, top_confidence: 94, memberIds: [1, 2] },
    ], { required: 2 });
    assert.equal(out.length, 1);
    assert.equal(out[0].fp, 'paw3395');
    assert.equal(out[0].label, 'PAW3395');
    assert.equal(out[0].count, 2);
    assert.equal(out[0].required, 2);
    assert.equal(out[0].qualifies, true);
    assert.equal(out[0].topConf, 94);
  });

  it('truncates labels longer than 24 chars with ellipsis', () => {
    const long = 'a'.repeat(40);
    const out = projectBucketsForProgress([
      { value_fingerprint: 'x', value: long, pooledCount: 0, qualifies: false, top_confidence: 0, memberIds: [] },
    ], { required: 1 });
    assert.ok(out[0].label.length <= 25, `expected <=25 char label, got ${out[0].label.length}`);
    assert.ok(out[0].label.endsWith('…'), 'expected ellipsis');
  });

  it('serializes list values as [a, b, c] (truncated)', () => {
    const out = projectBucketsForProgress([
      { value_fingerprint: 'ab', value: ['Optical', 'Hall Effect'], pooledCount: 1, qualifies: false, top_confidence: 60, memberIds: [1] },
    ], { required: 2 });
    assert.match(out[0].label, /^\[/);
    assert.ok(out[0].label.length <= 25);
  });

  it('handles number scalars', () => {
    const out = projectBucketsForProgress([
      { value_fingerprint: '58', value: 58, pooledCount: 3, qualifies: true, top_confidence: 90, memberIds: [1, 2, 3] },
    ], { required: 2 });
    assert.equal(out[0].label, '58');
  });

  it('topConf can be null', () => {
    const out = projectBucketsForProgress([
      { value_fingerprint: 'x', value: 'X', pooledCount: 0, qualifies: false, top_confidence: null, memberIds: [] },
    ], { required: 1 });
    assert.equal(out[0].topConf, null);
  });

  it('normalizes topConf from 0-1 range to 0-100 for display', () => {
    const out = projectBucketsForProgress([
      { value_fingerprint: 'x', value: 'X', pooledCount: 0, qualifies: false, top_confidence: 0.93, memberIds: [] },
    ], { required: 1 });
    assert.equal(out[0].topConf, 93);
  });

  it('caps output at 7 buckets + trailing +N more chip when more exist', () => {
    const buckets = [];
    for (let i = 0; i < 10; i += 1) {
      buckets.push({
        value_fingerprint: `v${i}`, value: `V${i}`,
        pooledCount: i, qualifies: false, top_confidence: 50 + i,
        memberIds: [i],
      });
    }
    const out = projectBucketsForProgress(buckets, { required: 2 });
    assert.equal(out.length, 8, 'expected 7 buckets + overflow chip');
    const overflow = out[out.length - 1];
    assert.equal(overflow.fp, '__more__');
    assert.equal(overflow.label, '+3 more');
    assert.equal(overflow.qualifies, false);
    assert.equal(overflow.count, 0);
    assert.equal(overflow.required, 0);
    assert.equal(overflow.topConf, null);
  });

  it('does NOT emit overflow chip when exactly 7 buckets', () => {
    const buckets = [];
    for (let i = 0; i < 7; i += 1) {
      buckets.push({
        value_fingerprint: `v${i}`, value: `V${i}`,
        pooledCount: 0, qualifies: false, top_confidence: 50,
        memberIds: [],
      });
    }
    const out = projectBucketsForProgress(buckets, { required: 2 });
    assert.equal(out.length, 7);
    assert.ok(out.every(b => b.fp !== '__more__'));
  });

  it('required defaults to 0 when not provided', () => {
    const out = projectBucketsForProgress([
      { value_fingerprint: 'x', value: 'X', pooledCount: 0, qualifies: false, top_confidence: 90, memberIds: [] },
    ]);
    assert.equal(out[0].required, 0);
  });

  it('preserves insertion order (evaluator sorts by top_confidence DESC)', () => {
    const buckets = [
      { value_fingerprint: 'hi', value: 'HI', pooledCount: 2, qualifies: true, top_confidence: 95, memberIds: [1] },
      { value_fingerprint: 'mid', value: 'MID', pooledCount: 1, qualifies: false, top_confidence: 80, memberIds: [2] },
      { value_fingerprint: 'lo', value: 'LO', pooledCount: 0, qualifies: false, top_confidence: 40, memberIds: [3] },
    ];
    const out = projectBucketsForProgress(buckets, { required: 2 });
    assert.deepEqual(out.map(b => b.fp), ['hi', 'mid', 'lo']);
  });
});
