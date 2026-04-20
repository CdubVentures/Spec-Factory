/**
 * Editorial schemas — unit tests.
 *
 * Locks the shape of `publisherCandidateRefSchema`, `rejectionMetadataSchema`,
 * and the re-exported `evidenceRefSchema`. These schemas drive `types.generated.ts`
 * codegen (Phase 3+) so any shape drift must be intentional and reflected here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  publisherCandidateRefSchema,
  rejectionMetadataSchema,
  evidenceRefSchema,
  evidenceRefsSchema,
} from '../editorialSchemas.js';

describe('editorialSchemas — publisherCandidateRefSchema', () => {
  it('parses a minimal valid row (required fields only)', () => {
    const row = {
      candidate_id: 1,
      value: '2024-03-15',
      confidence: 92,
      status: 'resolved',
      submitted_at: '2024-03-15T12:00:00Z',
    };
    const parsed = publisherCandidateRefSchema.parse(row);
    assert.equal(parsed.candidate_id, 1);
    assert.equal(parsed.value, '2024-03-15');
    assert.equal(parsed.source_id, '');
    assert.equal(parsed.source_type, '');
    assert.equal(parsed.model, '');
    assert.equal(parsed.metadata, undefined);
  });

  it('preserves optional metadata record when present', () => {
    const row = {
      candidate_id: 2,
      source_id: 'rdf-p1-r1',
      source_type: 'release_date_finder',
      model: 'claude-sonnet-4-6',
      value: '2024-03-16',
      confidence: 88,
      status: 'published',
      submitted_at: '2024-03-15T12:01:00Z',
      metadata: { variant_key: 'color:black', evidence_refs: [] },
    };
    const parsed = publisherCandidateRefSchema.parse(row);
    assert.deepEqual(parsed.metadata, { variant_key: 'color:black', evidence_refs: [] });
  });

  it('rejects missing candidate_id', () => {
    assert.throws(() => publisherCandidateRefSchema.parse({
      value: 'x', confidence: 0, status: 's', submitted_at: '',
    }));
  });
});

describe('editorialSchemas — rejectionMetadataSchema', () => {
  it('parses reason_code with optional detail', () => {
    const parsed = rejectionMetadataSchema.parse({
      reason_code: 'low_confidence',
      detail: { threshold: 50, actual: 30 },
    });
    assert.equal(parsed.reason_code, 'low_confidence');
    assert.deepEqual(parsed.detail, { threshold: 50, actual: 30 });
  });

  it('treats detail as fully optional (omitted is fine)', () => {
    const parsed = rejectionMetadataSchema.parse({ reason_code: 'missing_identity' });
    assert.equal(parsed.reason_code, 'missing_identity');
    assert.equal(parsed.detail, undefined);
  });

  it('accepts arbitrary detail payloads (opaque to schema)', () => {
    const parsed = rejectionMetadataSchema.parse({
      reason_code: 'x', detail: 'just a string',
    });
    assert.equal(parsed.detail, 'just a string');
  });
});

describe('editorialSchemas — evidenceRefSchema re-export', () => {
  it('re-exports the shared {url, tier, confidence} shape', () => {
    const parsed = evidenceRefSchema.parse({
      url: 'https://example.com', tier: 'tier1', confidence: 95,
    });
    assert.equal(parsed.url, 'https://example.com');
    assert.equal(parsed.tier, 'tier1');
    assert.equal(parsed.confidence, 95);
  });

  it('array form defaults to empty when undefined', () => {
    const parsed = evidenceRefsSchema.parse(undefined);
    assert.deepEqual(parsed, []);
  });
});
