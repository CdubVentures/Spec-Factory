/**
 * createScalarFinderEditorialSchemas — editorial schema factory tests.
 *
 * Locks the Zod shapes returned for { candidateSchema, runSchema, getResponseSchema }
 * given an LLM response schema. Every scalar field finder's GET response shares
 * this shape — the candidate carries variant identity + publisher enrichment,
 * the run wraps it with model/timing metadata + extended response envelope.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createScalarFinderSchema } from '../createScalarFinderSchema.js';
import { createScalarFinderEditorialSchemas } from '../createScalarFinderEditorialSchemas.js';

function makeSchemas(valueKey = 'release_date', valueType = 'date', includeEvidenceKind = false) {
  const llm = createScalarFinderSchema({ valueKey, valueType, includeEvidenceKind });
  return { llm, ...createScalarFinderEditorialSchemas({ llmResponseSchema: llm, includeEvidenceKind }) };
}

function baseCandidate(extras = {}) {
  return {
    variant_id: 'v_black',
    variant_key: 'color:black',
    variant_label: 'Black',
    variant_type: 'color',
    value: '2024-03-15',
    confidence: 90,
    unknown_reason: '',
    sources: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
    ran_at: '2024-03-15T10:00:00Z',
    ...extras,
  };
}

function baseRun(extras = {}) {
  return {
    run_number: 1,
    ran_at: '2024-03-15T10:00:00Z',
    model: 'gpt-5-nano',
    fallback_used: false,
    selected: { candidates: [baseCandidate()] },
    prompt: { system: 'sys', user: 'usr' },
    response: {
      release_date: '2024-03-15',
      confidence: 90,
      unknown_reason: '',
      evidence_refs: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      variant_id: 'v_black',
      variant_key: 'color:black',
      variant_label: 'Black',
    },
    ...extras,
  };
}

function baseGetResponse(extras = {}) {
  return {
    product_id: 'p1',
    category: 'mouse',
    run_count: 1,
    last_ran_at: '2024-03-15T10:00:00Z',
    candidates: [baseCandidate()],
    candidate_count: 1,
    published_value: '',
    published_confidence: null,
    selected: { candidates: [baseCandidate()] },
    runs: [baseRun()],
    ...extras,
  };
}

describe('createScalarFinderEditorialSchemas — candidateSchema', () => {
  it('parses a minimal candidate', () => {
    const { candidateSchema } = makeSchemas();
    const parsed = candidateSchema.parse(baseCandidate());
    assert.equal(parsed.variant_key, 'color:black');
    assert.equal(parsed.value, '2024-03-15');
  });

  it('accepts null variant_id (item-default / scalar case)', () => {
    const { candidateSchema } = makeSchemas();
    const parsed = candidateSchema.parse(baseCandidate({ variant_id: null }));
    assert.equal(parsed.variant_id, null);
  });

  it('accepts rejected_by_gate + rejection_reasons when present', () => {
    const { candidateSchema } = makeSchemas();
    const parsed = candidateSchema.parse(baseCandidate({
      rejected_by_gate: true,
      rejection_reasons: [{ reason_code: 'below_evidence_refs', detail: 'none' }],
    }));
    assert.equal(parsed.rejected_by_gate, true);
    assert.equal(parsed.rejection_reasons[0].reason_code, 'below_evidence_refs');
  });

  it('accepts publisher_error when present', () => {
    const { candidateSchema } = makeSchemas();
    const parsed = candidateSchema.parse(baseCandidate({ publisher_error: 'db offline' }));
    assert.equal(parsed.publisher_error, 'db offline');
  });

  it('accepts publisher_candidates enrichment from field_candidates', () => {
    const { candidateSchema } = makeSchemas();
    const parsed = candidateSchema.parse(baseCandidate({
      publisher_candidates: [{
        candidate_id: 7,
        source_id: 'release_date_finder',
        source_type: 'feature',
        model: 'gpt-5-nano',
        value: '2024-03-15',
        confidence: 90,
        status: 'accepted',
        submitted_at: '2024-03-15T10:00:00Z',
      }],
    }));
    assert.equal(parsed.publisher_candidates[0].candidate_id, 7);
  });

  it('defaults sources to empty array when omitted', () => {
    const { candidateSchema } = makeSchemas();
    const parsed = candidateSchema.parse(baseCandidate({ sources: undefined }));
    assert.deepEqual(parsed.sources, []);
  });

  it('defaults unknown_reason to empty string when omitted', () => {
    const { candidateSchema } = makeSchemas();
    const parsed = candidateSchema.parse(baseCandidate({ unknown_reason: undefined }));
    assert.equal(parsed.unknown_reason, '');
  });
});

describe('createScalarFinderEditorialSchemas — runSchema', () => {
  it('parses a minimal run entry', () => {
    const { runSchema } = makeSchemas();
    const parsed = runSchema.parse(baseRun());
    assert.equal(parsed.run_number, 1);
    assert.equal(parsed.selected.candidates.length, 1);
  });

  it('accepts loop_id on response when loop mode run', () => {
    const { runSchema } = makeSchemas();
    const parsed = runSchema.parse(baseRun({
      response: { ...baseRun().response, loop_id: 'loop-abc-123' },
    }));
    assert.equal(parsed.response.loop_id, 'loop-abc-123');
  });

  it('response has null variant_id (item-default case)', () => {
    const { runSchema } = makeSchemas();
    const parsed = runSchema.parse(baseRun({
      response: { ...baseRun().response, variant_id: null },
    }));
    assert.equal(parsed.response.variant_id, null);
  });

  it('accepts optional effort/access/thinking/web_search metadata', () => {
    const { runSchema } = makeSchemas();
    const parsed = runSchema.parse(baseRun({
      effort_level: 'high',
      access_mode: 'api',
      thinking: true,
      web_search: true,
    }));
    assert.equal(parsed.effort_level, 'high');
    assert.equal(parsed.thinking, true);
  });
});

describe('createScalarFinderEditorialSchemas — getResponseSchema', () => {
  it('parses a full GET payload', () => {
    const { getResponseSchema } = makeSchemas();
    const parsed = getResponseSchema.parse(baseGetResponse());
    assert.equal(parsed.product_id, 'p1');
    assert.equal(parsed.candidates.length, 1);
  });

  it('published_confidence accepts null (nothing published yet)', () => {
    const { getResponseSchema } = makeSchemas();
    const parsed = getResponseSchema.parse(baseGetResponse({ published_confidence: null }));
    assert.equal(parsed.published_confidence, null);
  });

  it('accepts multiple variants + multiple runs', () => {
    const { getResponseSchema } = makeSchemas();
    const parsed = getResponseSchema.parse(baseGetResponse({
      candidates: [
        baseCandidate({ variant_id: 'v_black', variant_key: 'color:black' }),
        baseCandidate({ variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', value: '2024-04-01' }),
      ],
      candidate_count: 2,
      runs: [baseRun({ run_number: 1 }), baseRun({ run_number: 2 })],
      selected: {
        candidates: [
          baseCandidate({ variant_id: 'v_black', variant_key: 'color:black' }),
          baseCandidate({ variant_id: 'v_white', variant_key: 'color:white' }),
        ],
      },
    }));
    assert.equal(parsed.candidate_count, 2);
    assert.equal(parsed.runs.length, 2);
  });
});

describe('createScalarFinderEditorialSchemas — parity with RDF hand-written schemas', () => {
  // WHY: RDF now opts into the extended evidence shape (includeEvidenceKind: true),
  // so parity tests must build factory schemas with the same flag.
  it('candidateSchema matches releaseDateFinderCandidateSchema byte-for-byte on a full payload', async () => {
    const { releaseDateFinderCandidateSchema } = await import('../../../features/release-date/releaseDateSchema.js');
    const { candidateSchema } = makeSchemas('release_date', 'date', true);
    const sample = baseCandidate({
      rejected_by_gate: false,
      publisher_candidates: [{
        candidate_id: 3, source_id: 'release_date_finder', source_type: 'feature',
        model: 'gpt-5-nano', value: '2024-03-15', confidence: 90,
        status: 'accepted', submitted_at: '2024-03-15T10:00:00Z',
      }],
    });
    assert.deepEqual(candidateSchema.parse(sample), releaseDateFinderCandidateSchema.parse(sample));
  });

  it('getResponseSchema matches releaseDateFinderGetResponseSchema byte-for-byte', async () => {
    const { releaseDateFinderGetResponseSchema } = await import('../../../features/release-date/releaseDateSchema.js');
    const { getResponseSchema } = makeSchemas('release_date', 'date', true);
    const sample = baseGetResponse({ candidate_count: 1 });
    assert.deepEqual(getResponseSchema.parse(sample), releaseDateFinderGetResponseSchema.parse(sample));
  });
});

describe('createScalarFinderEditorialSchemas — error paths', () => {
  it('throws without llmResponseSchema', () => {
    assert.throws(() => createScalarFinderEditorialSchemas({}), /llmResponseSchema required/);
  });
});
