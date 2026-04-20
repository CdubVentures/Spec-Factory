import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fanOutCandidates } from '../candidateFanOut.js';

// ── Helpers ─────────────────────────────────────────────────────────

// Source-centric row (post-Phase-8 schema — the only live shape).
function makeRow(overrides = {}) {
  return {
    id: 42,
    value: '89 g',
    confidence: 95, // integer 0-100 (LLM schema scale)
    status: 'resolved',
    source_id: 'cef-m-001-1',
    source_type: 'cef',
    model: 'gpt-4o',
    submitted_at: '2026-04-10T12:00:00Z',
    metadata_json: { evidence: { url: 'https://razer.com/specs', quote: 'Weight: 89 g' }, method: 'cef' },
    ...overrides,
  };
}

describe('fanOutCandidates', () => {
  // ── Shape ──────────────────────────────────────────────────────────

  it('one row → one candidate card', () => {
    const result = fanOutCandidates([makeRow()]);
    assert.equal(result.length, 1);
    assert.equal(result[0].candidate_id, 'fc_42');
    assert.equal(result[0].value, '89 g');
    assert.equal(result[0].status, 'resolved');
    assert.equal(result[0].source, 'cef');
    assert.equal(result[0].source_id, 'cef-m-001-1');
    assert.equal(result[0].model, 'gpt-4o');
  });

  it('falls back to metadata.source when source_id is missing (defensive)', () => {
    const row = makeRow({ source_id: null, source_type: null, metadata_json: { source: 'legacy' } });
    const result = fanOutCandidates([row]);
    assert.equal(result.length, 1);
    assert.equal(result[0].source_id, 'legacy');
  });

  // ── Score normalization (the drawer's confidence bridge) ──────────

  it('integer 93 normalizes to fraction 0.93 (backend scale → UI scale)', () => {
    const result = fanOutCandidates([makeRow({ id: 100, confidence: 93 })]);
    assert.equal(result[0].score, 0.93);
  });

  it('legacy fraction 0.87 passes through unchanged', () => {
    const result = fanOutCandidates([makeRow({ confidence: 0.87 })]);
    assert.equal(result[0].score, 0.87);
  });

  it('clamps out-of-range integer (> 100) to 1', () => {
    const result = fanOutCandidates([makeRow({ confidence: 150 })]);
    assert.equal(result[0].score, 1);
  });

  it('clamps negative confidence to 0', () => {
    const result = fanOutCandidates([makeRow({ confidence: -0.3 })]);
    assert.equal(result[0].score, 0);
  });

  it('treats NaN confidence as 0', () => {
    const result = fanOutCandidates([makeRow({ confidence: NaN })]);
    assert.equal(result[0].score, 0);
  });

  // ── Status ─────────────────────────────────────────────────────────

  it('inherits resolved status from the row', () => {
    const result = fanOutCandidates([makeRow({ status: 'resolved' })]);
    assert.equal(result[0].status, 'resolved');
  });

  it('defaults status to candidate when row status is falsy', () => {
    const result = fanOutCandidates([makeRow({ status: null })]);
    assert.equal(result[0].status, 'candidate');
  });

  // ── Evidence + metadata projection ────────────────────────────────

  it('extracts evidence_url from metadata_json.evidence.url', () => {
    const result = fanOutCandidates([makeRow()]);
    assert.equal(result[0].evidence_url, 'https://razer.com/specs');
  });

  it('sets metadata to null when metadata_json is empty', () => {
    const result = fanOutCandidates([makeRow({ metadata_json: {} })]);
    assert.equal(result[0].metadata, null);
  });

  it('passes through non-empty metadata', () => {
    const result = fanOutCandidates([makeRow({ metadata_json: { color_names: { black: 'Black' } } })]);
    assert.deepEqual(result[0].metadata, { color_names: { black: 'Black' } });
  });

  it('exposes backward-compat fields: source_id, evidence object, method', () => {
    const c = fanOutCandidates([makeRow()])[0];
    assert.equal(c.source_id, 'cef-m-001-1');
    assert.ok(c.evidence);
    assert.equal(c.evidence.url, 'https://razer.com/specs');
    assert.equal(c.evidence.quote, 'Weight: 89 g');
    assert.equal(c.evidence.source_id, c.source);
    assert.equal(c.method, 'cef');
  });

  // ── Sort order ─────────────────────────────────────────────────────

  it('sorts rows by score DESC then submitted_at DESC', () => {
    const rows = [
      makeRow({ id: 1, source_id: 'a', confidence: 70, submitted_at: '2026-04-10T12:00:00Z' }),
      makeRow({ id: 2, source_id: 'b', confidence: 95, submitted_at: '2026-04-09T12:00:00Z' }),
      makeRow({ id: 3, source_id: 'c', confidence: 70, submitted_at: '2026-04-11T12:00:00Z' }),
    ];
    const result = fanOutCandidates(rows);
    assert.equal(result[0].source_id, 'b'); // highest score
    assert.equal(result[1].source_id, 'c'); // same score as a, but later date
    assert.equal(result[2].source_id, 'a');
  });

  it('processes multiple rows with mixed scales in a single call', () => {
    const rows = [
      makeRow({ id: 10, confidence: 90, source_id: 'cef-m-1', source_type: 'cef' }),
      makeRow({ id: 20, confidence: 0.55, source_id: 'pipeline-m-1', source_type: 'pipeline' }),
    ];
    const result = fanOutCandidates(rows);
    assert.equal(result.length, 2);
    assert.equal(result[0].score, 0.9); // integer 90 → 0.9, wins
    assert.equal(result[1].score, 0.55);
  });
});
