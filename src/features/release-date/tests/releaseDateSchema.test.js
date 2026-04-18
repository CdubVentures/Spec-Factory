/**
 * releaseDateSchema — Zod response validation tests.
 *
 * WHY: Universal evidence shape from the shared module — {url, tier, confidence}.
 * Legacy wide shape ({source_url, source_page, source_type, tier, excerpt}) has
 * been dropped. Candidate-level confidence on the response root is distinct
 * from per-source confidence inside each evidence_refs entry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { releaseDateFinderResponseSchema } from '../releaseDateSchema.js';

describe('releaseDateFinderResponseSchema', () => {
  it('accepts a full valid response with evidence_refs', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15',
      confidence: 90,
      unknown_reason: '',
      evidence_refs: [{
        url: 'https://mfr.example.com/press',
        tier: 'tier1',
        confidence: 95,
      }],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });
    assert.equal(parsed.release_date, '2024-03-15');
    assert.equal(parsed.confidence, 90);
    assert.equal(parsed.evidence_refs.length, 1);
    assert.equal(parsed.evidence_refs[0].url, 'https://mfr.example.com/press');
    assert.equal(parsed.evidence_refs[0].tier, 'tier1');
    assert.equal(parsed.evidence_refs[0].confidence, 95);
  });

  it('accepts "unk" as release_date', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: 'unk',
      confidence: 0,
      unknown_reason: 'No sources cite a launch date',
      evidence_refs: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });
    assert.equal(parsed.release_date, 'unk');
  });

  it('defaults missing evidence_refs to empty array', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024-03',
      confidence: 60,
    });
    assert.deepEqual(parsed.evidence_refs, []);
  });

  it('defaults missing discovery_log to empty', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024',
      confidence: 50,
    });
    assert.deepEqual(parsed.discovery_log, { urls_checked: [], queries_run: [], notes: [] });
  });

  it('rejects overall confidence outside 0-100', () => {
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15', confidence: 150,
    }));
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15', confidence: -10,
    }));
  });

  it('rejects non-integer overall confidence', () => {
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15', confidence: 85.5,
    }));
  });

  it('defaults per-source confidence to 0 when omitted', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024',
      confidence: 50,
      evidence_refs: [{ url: 'https://example.com', tier: 'tier1' }],
    });
    assert.equal(parsed.evidence_refs[0].confidence, 0);
  });

  it('rejects per-source confidence outside 0-100', () => {
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024', confidence: 50,
      evidence_refs: [{ url: 'u', tier: 'tier1', confidence: 101 }],
    }));
  });

  it('accepts any tier string (no enum enforcement — classification metadata)', () => {
    // Per plan: no runtime enum on tier; LLM classifies, we collect.
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024',
      confidence: 50,
      evidence_refs: [{ url: 'u', tier: 'tier5', confidence: 40 }],
    });
    assert.equal(parsed.evidence_refs[0].tier, 'tier5');
  });

  it('legacy `evidence` field is no longer recognized (renamed to evidence_refs)', () => {
    // Old key — Zod strips unknown fields silently, so parse succeeds but
    // the legacy field does not surface.
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15',
      confidence: 90,
      evidence: [{ source_url: 'x', tier: 'tier1' }],
    });
    assert.deepEqual(parsed.evidence_refs, []);
    assert.equal(parsed.evidence, undefined);
  });
});
