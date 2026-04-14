import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fanOutCandidates } from '../candidateFanOut.js';

// ── Helpers ─────────────────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    id: 42,
    value: '89 g',
    confidence: 0.95,
    status: 'resolved',
    submitted_at: '2026-04-10T12:00:00Z',
    sources_json: [
      { source: 'cef', model: 'gpt-4o', confidence: 0.96, run_id: 'run-1', submitted_at: '2026-04-10T12:00:00Z' },
    ],
    metadata_json: { evidence: { url: 'https://razer.com/specs', quote: 'Weight: 89 g' }, method: 'cef' },
    ...overrides,
  };
}

// ── Fan-out shape ───────────────────────────────────────────────────

describe('fanOutCandidates', () => {
  it('fans 1 row with 1 source into 1 candidate', () => {
    const result = fanOutCandidates([makeRow()]);
    assert.equal(result.length, 1);
    assert.equal(result[0].candidate_id, 'fc_42_0');
    assert.equal(result[0].value, '89 g');
    assert.equal(result[0].status, 'resolved');
  });

  it('fans 1 row with 3 sources into 3 candidates with sequential IDs', () => {
    const row = makeRow({
      sources_json: [
        { source: 'cef', model: 'gpt-4o', confidence: 0.96 },
        { source: 'provenance', model: 'gpt-5.4-low', confidence: 0.88 },
        { source: 'cef', model: 'gemini-2.5-flash', confidence: 0.72 },
      ],
    });
    const result = fanOutCandidates([row]);
    assert.equal(result.length, 3);
    assert.equal(result[0].candidate_id, 'fc_42_0');
    assert.equal(result[1].candidate_id, 'fc_42_1');
    assert.equal(result[2].candidate_id, 'fc_42_2');
  });

  it('emits 1 fallback card when sources_json is empty', () => {
    const row = makeRow({ sources_json: [] });
    const result = fanOutCandidates([row]);
    assert.equal(result.length, 1);
    assert.equal(result[0].candidate_id, 'fc_42');
    assert.equal(result[0].source, '');
    assert.equal(result[0].model, null);
  });

  it('emits 1 fallback card when sources_json is null', () => {
    const row = makeRow({ sources_json: null });
    const result = fanOutCandidates([row]);
    assert.equal(result.length, 1);
    assert.equal(result[0].candidate_id, 'fc_42');
  });

  // ── Score resolution ──────────────────────────────────────────────

  it('uses source-level confidence over row-level confidence', () => {
    const row = makeRow({
      confidence: 0.50,
      sources_json: [{ source: 'cef', confidence: 0.88 }],
    });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].score, 0.88);
  });

  it('falls back to row confidence when source lacks confidence', () => {
    const row = makeRow({
      confidence: 0.75,
      sources_json: [{ source: 'cef' }],
    });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].score, 0.75);
  });

  it('clamps score > 1 to 1', () => {
    const row = makeRow({ sources_json: [{ source: 'cef', confidence: 1.5 }] });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].score, 1);
  });

  it('clamps negative score to 0', () => {
    const row = makeRow({ sources_json: [{ source: 'cef', confidence: -0.3 }] });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].score, 0);
  });

  it('treats NaN confidence as 0', () => {
    const row = makeRow({ confidence: NaN, sources_json: [{ source: 'cef', confidence: NaN }] });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].score, 0);
  });

  // ── Missing fields ────────────────────────────────────────────────

  it('sets model to null when source entry lacks model', () => {
    const row = makeRow({ sources_json: [{ source: 'cef', confidence: 0.9 }] });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].model, null);
  });

  it('sets run_id to null when source entry lacks run_id', () => {
    const row = makeRow({ sources_json: [{ source: 'cef', confidence: 0.9 }] });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].run_id, null);
  });

  it('sets source to empty string when source entry lacks source', () => {
    const row = makeRow({ sources_json: [{ confidence: 0.9 }] });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].source, '');
  });

  // ── Status inheritance ────────────────────────────────────────────

  it('all fanned cards inherit resolved status from parent row', () => {
    const row = makeRow({
      status: 'resolved',
      sources_json: [
        { source: 'a', confidence: 0.9 },
        { source: 'b', confidence: 0.8 },
      ],
    });
    const result = fanOutCandidates([row]);
    assert.ok(result.every((c) => c.status === 'resolved'));
  });

  it('defaults status to candidate when row status is falsy', () => {
    const row = makeRow({ status: null, sources_json: [{ source: 'a', confidence: 0.5 }] });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].status, 'candidate');
  });

  // ── Evidence & metadata ───────────────────────────────────────────

  it('extracts evidence_url from metadata_json.evidence.url', () => {
    const result = fanOutCandidates([makeRow()]);
    assert.equal(result[0].evidence_url, 'https://razer.com/specs');
  });

  it('sets metadata to null when metadata_json is empty', () => {
    const row = makeRow({ metadata_json: {} });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].metadata, null);
  });

  it('passes through non-empty metadata', () => {
    const row = makeRow({ metadata_json: { color_names: { black: 'Black' } } });
    const result = fanOutCandidates([row]);
    assert.deepEqual(result[0].metadata, { color_names: { black: 'Black' } });
  });

  // ── Sort order ────────────────────────────────────────────────────

  it('sorts by score DESC then submitted_at DESC', () => {
    const rows = [
      makeRow({ id: 1, sources_json: [{ source: 'a', confidence: 0.70, submitted_at: '2026-04-10T12:00:00Z' }] }),
      makeRow({ id: 2, sources_json: [{ source: 'b', confidence: 0.95, submitted_at: '2026-04-09T12:00:00Z' }] }),
      makeRow({ id: 3, sources_json: [{ source: 'c', confidence: 0.70, submitted_at: '2026-04-11T12:00:00Z' }] }),
    ];
    const result = fanOutCandidates(rows);
    assert.equal(result[0].source, 'b');  // highest score
    assert.equal(result[1].source, 'c');  // same score as 'a', but later date
    assert.equal(result[2].source, 'a');  // same score as 'c', earlier date
  });

  // ── Multiple rows, global sort ────────────────────────────────────

  it('fans out multiple rows and sorts globally', () => {
    const rows = [
      makeRow({
        id: 10, value: '89 g', status: 'resolved',
        sources_json: [
          { source: 'cef', confidence: 1.0 },
          { source: 'provenance', confidence: 0.88 },
        ],
        metadata_json: {},
      }),
      makeRow({
        id: 20, value: '90 g', status: 'candidate',
        sources_json: [{ source: 'cef', confidence: 0.55 }],
        metadata_json: {},
      }),
    ];
    const result = fanOutCandidates(rows);
    assert.equal(result.length, 3);
    assert.equal(result[0].score, 1.0);
    assert.equal(result[0].candidate_id, 'fc_10_0');
    assert.equal(result[1].score, 0.88);
    assert.equal(result[2].score, 0.55);
    assert.equal(result[2].status, 'candidate');
  });

  // ── Backward compatibility ────────────────────────────────────────

  it('includes backward-compat fields: source_id, evidence object, method', () => {
    const result = fanOutCandidates([makeRow()]);
    const c = result[0];
    // source_id mirrors source
    assert.equal(c.source_id, c.source);
    // evidence object with url, quote, source_id
    assert.ok(c.evidence);
    assert.equal(c.evidence.url, 'https://razer.com/specs');
    assert.equal(c.evidence.quote, 'Weight: 89 g');
    assert.equal(c.evidence.source_id, c.source);
    // method from metadata
    assert.equal(c.method, 'cef');
  });

  // ── submitted_at inheritance ──────────────────────────────────────

  it('uses row submitted_at when source entry lacks it', () => {
    const row = makeRow({
      submitted_at: '2026-04-10T08:00:00Z',
      sources_json: [{ source: 'cef', confidence: 0.9 }],
    });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].submitted_at, '2026-04-10T08:00:00Z');
  });

  it('prefers source-level submitted_at over row-level', () => {
    const row = makeRow({
      submitted_at: '2026-04-10T08:00:00Z',
      sources_json: [{ source: 'cef', confidence: 0.9, submitted_at: '2026-04-11T10:00:00Z' }],
    });
    const result = fanOutCandidates([row]);
    assert.equal(result[0].submitted_at, '2026-04-11T10:00:00Z');
  });

  // ── Source-centric rows (Phase 6) ───────────────────────────────────

  it('source-centric row: 1 row = 1 card, uses row columns directly', () => {
    const row = {
      id: 100,
      value: '58',
      confidence: 0.92,
      status: 'candidate',
      source_id: 'cef-mouse-001-1',
      source_type: 'cef',
      model: 'gemini-2.5-flash',
      submitted_at: '2026-04-10T12:00:00Z',
      metadata_json: { evidence: { url: 'https://razer.com', quote: 'Weight: 58g' } },
    };
    const result = fanOutCandidates([row]);
    assert.equal(result.length, 1);
    assert.equal(result[0].candidate_id, 'fc_100');
    assert.equal(result[0].source, 'cef');
    assert.equal(result[0].source_id, 'cef-mouse-001-1');
    assert.equal(result[0].model, 'gemini-2.5-flash');
    assert.equal(result[0].score, 0.92);
    assert.equal(result[0].evidence_url, 'https://razer.com');
  });

  it('source-centric rows: multiple rows sorted by score DESC', () => {
    const rows = [
      { id: 101, value: '58', confidence: 0.80, status: 'resolved', source_id: 'cef-m-1', source_type: 'cef', model: 'gemini', submitted_at: '2026-04-10T12:00:00Z', metadata_json: {} },
      { id: 102, value: '58', confidence: 0.95, status: 'resolved', source_id: 'pipeline-m-1', source_type: 'pipeline', model: 'gpt-5', submitted_at: '2026-04-09T12:00:00Z', metadata_json: {} },
    ];
    const result = fanOutCandidates(rows);
    assert.equal(result.length, 2);
    assert.equal(result[0].source_id, 'pipeline-m-1'); // higher confidence
    assert.equal(result[1].source_id, 'cef-m-1');
  });

  it('mixed: source-centric + legacy rows processed together', () => {
    const rows = [
      // Source-centric row
      { id: 200, value: '58', confidence: 0.90, status: 'candidate', source_id: 'cef-m-1', source_type: 'cef', model: 'gemini', submitted_at: '2026-04-10T12:00:00Z', metadata_json: {} },
      // Legacy row with sources_json
      makeRow({ id: 201, value: '59', confidence: 0.85, sources_json: [{ source: 'pipeline', confidence: 0.85, model: 'gpt-4o' }] }),
    ];
    const result = fanOutCandidates(rows);
    assert.equal(result.length, 2);
    // Both should be represented
    const ids = result.map(r => r.candidate_id);
    assert.ok(ids.includes('fc_200'));
    assert.ok(ids.includes('fc_201_0'));
  });
});
