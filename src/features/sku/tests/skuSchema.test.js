/**
 * skuSchema — Zod response validation tests.
 *
 * SKF opts into the extended evidence shape (supporting_evidence ≤280 chars +
 * evidence_kind enum). Schema is permissive about kind mix — the "at least one
 * substantive ref" rule is enforced by the publisher gate, not here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { skuFinderResponseSchema } from '../skuSchema.js';

describe('skuFinderResponseSchema', () => {
  it('accepts a full valid response with extended evidence_refs', () => {
    const parsed = skuFinderResponseSchema.parse({
      sku: 'G502-HERO-BLACK',
      confidence: 90,
      unknown_reason: '',
      evidence_refs: [{
        url: 'https://mfr.example.com/g502-black',
        tier: 'tier1',
        confidence: 95,
        supporting_evidence: 'Part Number: G502-HERO-BLACK',
        evidence_kind: 'direct_quote',
      }],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });
    assert.equal(parsed.sku, 'G502-HERO-BLACK');
    assert.equal(parsed.confidence, 90);
    assert.equal(parsed.evidence_refs.length, 1);
    assert.equal(parsed.evidence_refs[0].evidence_kind, 'direct_quote');
    assert.equal(parsed.evidence_refs[0].supporting_evidence, 'Part Number: G502-HERO-BLACK');
  });

  it('accepts "unk" as sku with unknown_reason', () => {
    const parsed = skuFinderResponseSchema.parse({
      sku: 'unk',
      confidence: 0,
      unknown_reason: 'Manufacturer does not publish variant-specific MPNs',
      evidence_refs: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });
    assert.equal(parsed.sku, 'unk');
    assert.equal(parsed.unknown_reason, 'Manufacturer does not publish variant-specific MPNs');
  });

  it('defaults missing evidence_refs to empty array', () => {
    const parsed = skuFinderResponseSchema.parse({ sku: 'CH-931D101-NA', confidence: 60 });
    assert.deepEqual(parsed.evidence_refs, []);
  });

  it('defaults missing discovery_log to empty', () => {
    const parsed = skuFinderResponseSchema.parse({ sku: 'RZ01-03280100-R3U1', confidence: 50 });
    assert.deepEqual(parsed.discovery_log, { urls_checked: [], queries_run: [], notes: [] });
  });

  it('rejects overall confidence outside 0-100', () => {
    assert.throws(() => skuFinderResponseSchema.parse({ sku: 'X', confidence: 150 }));
    assert.throws(() => skuFinderResponseSchema.parse({ sku: 'X', confidence: -10 }));
  });

  it('rejects non-integer overall confidence', () => {
    assert.throws(() => skuFinderResponseSchema.parse({ sku: 'X', confidence: 85.5 }));
  });

  it('defaults per-source confidence to 0 when omitted', () => {
    const parsed = skuFinderResponseSchema.parse({
      sku: 'X', confidence: 50,
      evidence_refs: [{ url: 'https://example.com', tier: 'tier1' }],
    });
    assert.equal(parsed.evidence_refs[0].confidence, 0);
  });

  it('rejects per-source confidence outside 0-100', () => {
    assert.throws(() => skuFinderResponseSchema.parse({
      sku: 'X', confidence: 50,
      evidence_refs: [{ url: 'u', tier: 'tier1', confidence: 101 }],
    }));
  });

  it('accepts any tier string (classification metadata, no enum enforcement)', () => {
    const parsed = skuFinderResponseSchema.parse({
      sku: 'X', confidence: 50,
      evidence_refs: [{ url: 'u', tier: 'tier5', confidence: 40 }],
    });
    assert.equal(parsed.evidence_refs[0].tier, 'tier5');
  });
});

describe('skuFinderResponseSchema — extended evidence shape', () => {
  it('parses evidence_refs with supporting_evidence + all 10 evidence_kind values', () => {
    const kinds = [
      'direct_quote', 'structured_metadata', 'byline_timestamp', 'artifact_metadata',
      'visual_inspection', 'lab_measurement', 'comparative_rebadge', 'inferred_reasoning',
      'absence_of_evidence', 'identity_only',
    ];
    for (const kind of kinds) {
      const parsed = skuFinderResponseSchema.parse({
        sku: 'X-123',
        confidence: 85,
        evidence_refs: [{
          url: 'https://example.com',
          tier: 'tier1',
          confidence: 80,
          supporting_evidence: kind === 'identity_only' ? '' : 'supporting quote here',
          evidence_kind: kind,
        }],
      });
      assert.equal(parsed.evidence_refs[0].evidence_kind, kind);
    }
  });

  it('parses legacy payload without evidence_kind (pre-upgrade rebuild tolerance)', () => {
    const parsed = skuFinderResponseSchema.parse({
      sku: 'X-LEGACY',
      confidence: 90,
      evidence_refs: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
    });
    assert.equal(parsed.evidence_refs.length, 1);
    assert.equal(parsed.evidence_refs[0].evidence_kind, undefined);
    assert.equal(parsed.evidence_refs[0].supporting_evidence, '');
  });

  it('rejects an unknown evidence_kind string', () => {
    assert.throws(() => skuFinderResponseSchema.parse({
      sku: 'X',
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
    assert.throws(() => skuFinderResponseSchema.parse({
      sku: 'X',
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

  it('accepts supporting_evidence at exactly 280 chars', () => {
    const parsed = skuFinderResponseSchema.parse({
      sku: 'X',
      confidence: 90,
      evidence_refs: [{
        url: 'https://mfr.example.com',
        tier: 'tier1',
        confidence: 95,
        supporting_evidence: 'x'.repeat(280),
        evidence_kind: 'direct_quote',
      }],
    });
    assert.equal(parsed.evidence_refs[0].supporting_evidence.length, 280);
  });
});
