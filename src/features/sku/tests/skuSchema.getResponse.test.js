/**
 * SKF GET response schema — parse tests.
 *
 * Locks `skuFinderGetResponseSchema` against realistic payload shapes captured
 * from the SKF route. Extended evidence shape (supporting_evidence +
 * evidence_kind) surfaces on `candidates[].sources[]` too.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { skuFinderGetResponseSchema } from '../skuSchema.js';

const BASE_CANDIDATE = {
  variant_id: 'v_black',
  variant_key: 'color:black',
  variant_label: 'Black',
  variant_type: 'color',
  value: 'G502-HERO-BLACK',
  confidence: 92,
  unknown_reason: '',
  sources: [{
    url: 'https://mfr.example.com/g502-black',
    tier: 'tier1',
    confidence: 95,
    supporting_evidence: 'Part Number: G502-HERO-BLACK',
    evidence_kind: 'direct_quote',
  }],
  ran_at: '2024-03-15T12:00:00Z',
};

const BASE_RUN = {
  run_number: 1,
  ran_at: '2024-03-15T12:00:00Z',
  model: 'claude-sonnet-4-6',
  fallback_used: false,
  selected: { candidates: [BASE_CANDIDATE] },
  prompt: { system: 'sys', user: 'usr' },
  response: {
    sku: 'G502-HERO-BLACK',
    confidence: 92,
    unknown_reason: '',
    evidence_refs: [{
      url: 'https://mfr.example.com/g502-black',
      tier: 'tier1',
      confidence: 95,
      supporting_evidence: 'Part Number: G502-HERO-BLACK',
      evidence_kind: 'direct_quote',
    }],
    discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    started_at: '2024-03-15T12:00:00Z',
    duration_ms: 1000,
    variant_id: 'v_black',
    variant_key: 'color:black',
    variant_label: 'Black',
  },
};

const BASE_RESPONSE = {
  product_id: 'skf-test-001',
  category: 'mouse',
  run_count: 1,
  last_ran_at: '2024-03-15T12:00:00Z',
  candidates: [BASE_CANDIDATE],
  candidate_count: 1,
  published_value: '',
  published_confidence: null,
  selected: { candidates: [BASE_CANDIDATE] },
  runs: [BASE_RUN],
};

describe('skuFinderGetResponseSchema', () => {
  it('parses a minimal happy-path GET response', () => {
    const parsed = skuFinderGetResponseSchema.parse(BASE_RESPONSE);
    assert.equal(parsed.product_id, 'skf-test-001');
    assert.equal(parsed.candidates.length, 1);
    assert.equal(parsed.runs.length, 1);
  });

  it('parses response with empty candidates + zero runs', () => {
    const empty = {
      ...BASE_RESPONSE, run_count: 0, candidates: [], candidate_count: 0,
      selected: { candidates: [] }, runs: [],
    };
    const parsed = skuFinderGetResponseSchema.parse(empty);
    assert.equal(parsed.candidates.length, 0);
    assert.equal(parsed.runs.length, 0);
  });

  it('parses candidate with extended-evidence sources[] (supporting_evidence + evidence_kind)', () => {
    const parsed = skuFinderGetResponseSchema.parse(BASE_RESPONSE);
    assert.equal(parsed.candidates[0].sources[0].evidence_kind, 'direct_quote');
    assert.ok(parsed.candidates[0].sources[0].supporting_evidence.length > 0);
  });

  it('parses legacy candidate sources[] without evidence_kind (rebuild tolerance)', () => {
    const legacy = {
      ...BASE_RESPONSE,
      candidates: [{
        ...BASE_CANDIDATE,
        sources: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
      }],
    };
    const parsed = skuFinderGetResponseSchema.parse(legacy);
    assert.equal(parsed.candidates[0].sources[0].evidence_kind, undefined);
  });

  it('parses candidate with publisher_candidates enrichment', () => {
    const enriched = {
      ...BASE_RESPONSE,
      candidates: [{
        ...BASE_CANDIDATE,
        publisher_candidates: [{
          candidate_id: 1,
          source_id: 'skf-p1-r1',
          source_type: 'sku_finder',
          model: 'claude-sonnet-4-6',
          value: 'G502-HERO-BLACK',
          confidence: 92,
          status: 'published',
          submitted_at: '2024-03-15T12:00:00Z',
          metadata: { variant_key: 'color:black' },
        }],
      }],
    };
    const parsed = skuFinderGetResponseSchema.parse(enriched);
    assert.equal(parsed.candidates[0].publisher_candidates?.[0].status, 'published');
  });

  it('parses rejected candidate (rejected_by_gate + rejection_reasons)', () => {
    const rejected = {
      ...BASE_RESPONSE,
      candidates: [{
        ...BASE_CANDIDATE,
        confidence: 30,
        rejected_by_gate: true,
        rejection_reasons: [{ reason_code: 'low_confidence', detail: { threshold: 50, actual: 30 } }],
      }],
    };
    const parsed = skuFinderGetResponseSchema.parse(rejected);
    assert.equal(parsed.candidates[0].rejected_by_gate, true);
    assert.equal(parsed.candidates[0].rejection_reasons?.[0].reason_code, 'low_confidence');
  });

  it('parses candidate with publisher_error (non-fatal)', () => {
    const withErr = {
      ...BASE_RESPONSE,
      candidates: [{ ...BASE_CANDIDATE, publisher_error: 'network timeout' }],
    };
    const parsed = skuFinderGetResponseSchema.parse(withErr);
    assert.equal(parsed.candidates[0].publisher_error, 'network timeout');
  });

  it('parses unknown-sku candidate with unknown_reason', () => {
    const unknown = {
      ...BASE_RESPONSE,
      candidates: [{
        ...BASE_CANDIDATE,
        value: '',
        confidence: 0,
        unknown_reason: 'manufacturer does not publish variant-specific MPNs',
        sources: [],
      }],
    };
    const parsed = skuFinderGetResponseSchema.parse(unknown);
    assert.equal(parsed.candidates[0].value, '');
    assert.equal(parsed.candidates[0].unknown_reason, 'manufacturer does not publish variant-specific MPNs');
  });

  it('parses run with loop_id (loop mode)', () => {
    const looped = {
      ...BASE_RESPONSE,
      runs: [{ ...BASE_RUN, response: { ...BASE_RUN.response, loop_id: 'loop-1710504000-abc123' } }],
    };
    const parsed = skuFinderGetResponseSchema.parse(looped);
    assert.equal(parsed.runs[0].response.loop_id, 'loop-1710504000-abc123');
  });

  it('parses response with published_value + published_confidence', () => {
    const published = {
      ...BASE_RESPONSE,
      published_value: 'G502-HERO-BLACK',
      published_confidence: 92,
    };
    const parsed = skuFinderGetResponseSchema.parse(published);
    assert.equal(parsed.published_value, 'G502-HERO-BLACK');
    assert.equal(parsed.published_confidence, 92);
  });

  it('accepts variant_id: null (edition variants may have null id)', () => {
    const nullId = {
      ...BASE_RESPONSE,
      candidates: [{ ...BASE_CANDIDATE, variant_id: null }],
    };
    const parsed = skuFinderGetResponseSchema.parse(nullId);
    assert.equal(parsed.candidates[0].variant_id, null);
  });
});
