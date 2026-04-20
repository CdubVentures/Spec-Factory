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

describe('releaseDateFinderResponseSchema — extended evidence shape (post-upgrade)', () => {
  it('parses evidence_refs with supporting_evidence + evidence_kind populated', () => {
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024-04-19',
      confidence: 93,
      unknown_reason: '',
      evidence_refs: [
        {
          url: 'https://www.corsair.com/us/el/explorer/gamer/mice/corsair-m75-air',
          tier: 'tier1',
          confidence: 93,
          supporting_evidence: 'As of 04/19/2024, You can now get the M75 AIR in your choice of Black, Grey, or White!',
          evidence_kind: 'direct_quote',
        },
        {
          url: 'https://www.corsair.com/us/en/p/gaming-mouse/ch-931d101-na/white-sku',
          tier: 'tier1',
          confidence: 60,
          supporting_evidence: '',
          evidence_kind: 'identity_only',
        },
      ],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });
    assert.equal(parsed.evidence_refs.length, 2);
    assert.equal(parsed.evidence_refs[0].evidence_kind, 'direct_quote');
    assert.ok(parsed.evidence_refs[0].supporting_evidence.startsWith('As of 04/19/2024'));
    assert.equal(parsed.evidence_refs[1].evidence_kind, 'identity_only');
    assert.equal(parsed.evidence_refs[1].supporting_evidence, '');
  });

  it('parses payload where every ref is identity_only (schema OK, publisher gate rejects later)', () => {
    // WHY: the schema is permissive about kind mix — it validates shape only.
    // The "must have at least one substantive ref" rule is enforced by the
    // publisher gate's substantive-count query, not here.
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024-04-19',
      confidence: 50,
      evidence_refs: [
        { url: 'https://corsair.com/a', tier: 'tier1', confidence: 60, supporting_evidence: '', evidence_kind: 'identity_only' },
        { url: 'https://corsair.com/b', tier: 'tier1', confidence: 55, supporting_evidence: '', evidence_kind: 'identity_only' },
      ],
    });
    assert.equal(parsed.evidence_refs.length, 2);
    for (const ref of parsed.evidence_refs) assert.equal(ref.evidence_kind, 'identity_only');
  });

  it('parses legacy payload without evidence_kind (pre-upgrade rebuild tolerance)', () => {
    // Legacy product.json rebuild path — old runs don't carry evidence_kind;
    // zod treats the field as optional so this still parses cleanly.
    const parsed = releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15',
      confidence: 90,
      evidence_refs: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
    });
    assert.equal(parsed.evidence_refs.length, 1);
    assert.equal(parsed.evidence_refs[0].evidence_kind, undefined);
  });

  it('rejects evidence_refs with an unknown evidence_kind', () => {
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15',
      confidence: 90,
      evidence_refs: [{
        url: 'https://mfr.example.com',
        tier: 'tier1',
        confidence: 95,
        supporting_evidence: 'x',
        evidence_kind: 'totally_made_up',
      }],
    }));
  });

  it('rejects supporting_evidence > 280 chars', () => {
    assert.throws(() => releaseDateFinderResponseSchema.parse({
      release_date: '2024-03-15',
      confidence: 90,
      evidence_refs: [{
        url: 'https://mfr.example.com',
        tier: 'tier1',
        confidence: 95,
        supporting_evidence: 'x'.repeat(281),
        evidence_kind: 'direct_quote',
      }],
    }));
  });
});
