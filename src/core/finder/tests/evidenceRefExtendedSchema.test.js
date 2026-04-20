// WHY: MACRO-RED for the evidence-upgrade extended shape. RDF + scalar
// producers opt in via evidenceRefExtendedSchema; CEF + PIF + carousel
// stay on the base evidenceRefSchema. Locks the 10-value enum, the
// 280-char supporting_evidence cap, and the identity_only empty-string
// invariant (identity_only refs must carry "" for supporting_evidence).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceRefExtendedSchema,
  evidenceRefsExtendedSchema,
  EVIDENCE_KIND_VALUES,
} from '../evidencePromptFragment.js';

const ALL_KINDS = [
  'direct_quote',
  'structured_metadata',
  'byline_timestamp',
  'artifact_metadata',
  'visual_inspection',
  'lab_measurement',
  'comparative_rebadge',
  'inferred_reasoning',
  'absence_of_evidence',
  'identity_only',
];

describe('EVIDENCE_KIND_VALUES', () => {
  it('exports exactly the 10 locked kinds in the documented order', () => {
    assert.deepEqual(EVIDENCE_KIND_VALUES, ALL_KINDS);
  });
});

describe('evidenceRefExtendedSchema', () => {
  it('accepts a well-formed extended ref', () => {
    const parsed = evidenceRefExtendedSchema.parse({
      url: 'https://corsair.com/x',
      tier: 'tier1',
      confidence: 93,
      supporting_evidence: 'As of 04/19/2024, You can now get the M75 AIR in your choice of Black, Grey, or White!',
      evidence_kind: 'direct_quote',
    });
    assert.equal(parsed.evidence_kind, 'direct_quote');
    assert.equal(parsed.supporting_evidence.startsWith('As of 04/19/2024'), true);
  });

  it('accepts every one of the 10 enum values', () => {
    for (const kind of ALL_KINDS) {
      const parsed = evidenceRefExtendedSchema.parse({
        url: 'https://x.com',
        tier: 'tier1',
        confidence: 80,
        supporting_evidence: kind === 'identity_only' ? '' : 'some supporting text',
        evidence_kind: kind,
      });
      assert.equal(parsed.evidence_kind, kind);
    }
  });

  it('rejects an unknown evidence_kind', () => {
    assert.throws(() =>
      evidenceRefExtendedSchema.parse({
        url: 'https://x.com',
        tier: 'tier1',
        confidence: 80,
        supporting_evidence: 'text',
        evidence_kind: 'made_up_kind',
      }),
    );
  });

  it('rejects supporting_evidence > 280 chars', () => {
    const tooLong = 'x'.repeat(281);
    assert.throws(() =>
      evidenceRefExtendedSchema.parse({
        url: 'https://x.com',
        tier: 'tier1',
        confidence: 80,
        supporting_evidence: tooLong,
        evidence_kind: 'direct_quote',
      }),
    );
  });

  it('accepts supporting_evidence exactly 280 chars', () => {
    const boundary = 'x'.repeat(280);
    const parsed = evidenceRefExtendedSchema.parse({
      url: 'https://x.com',
      tier: 'tier1',
      confidence: 80,
      supporting_evidence: boundary,
      evidence_kind: 'direct_quote',
    });
    assert.equal(parsed.supporting_evidence.length, 280);
  });

  it('accepts empty-string supporting_evidence when evidence_kind is identity_only', () => {
    const parsed = evidenceRefExtendedSchema.parse({
      url: 'https://corsair.com/us/en/p/white-sku',
      tier: 'tier1',
      confidence: 60,
      supporting_evidence: '',
      evidence_kind: 'identity_only',
    });
    assert.equal(parsed.supporting_evidence, '');
    assert.equal(parsed.evidence_kind, 'identity_only');
  });

  it('defaults supporting_evidence to empty string when omitted', () => {
    const parsed = evidenceRefExtendedSchema.parse({
      url: 'https://x.com',
      tier: 'tier1',
      confidence: 80,
      evidence_kind: 'identity_only',
    });
    assert.equal(parsed.supporting_evidence, '');
  });

  it('accepts missing evidence_kind (legacy tolerance for pre-upgrade rows)', () => {
    // WHY: forward LLM contract is enforced by the evidenceKindGuidance prompt,
    // not the schema. Legacy product.json rows rebuilt pre-upgrade have NULL
    // evidence_kind — they must parse cleanly or the read path breaks.
    const parsed = evidenceRefExtendedSchema.parse({
      url: 'https://x.com',
      tier: 'tier1',
      confidence: 80,
      supporting_evidence: 'text',
    });
    assert.equal(parsed.evidence_kind, undefined);
  });

  it('inherits base-schema invariants (rejects missing url)', () => {
    assert.throws(() =>
      evidenceRefExtendedSchema.parse({
        tier: 'tier1',
        confidence: 80,
        supporting_evidence: 'text',
        evidence_kind: 'direct_quote',
      }),
    );
  });

  it('inherits base-schema invariants (rejects confidence outside 0-100)', () => {
    assert.throws(() =>
      evidenceRefExtendedSchema.parse({
        url: 'https://x.com',
        tier: 'tier1',
        confidence: 150,
        supporting_evidence: 'text',
        evidence_kind: 'direct_quote',
      }),
    );
  });
});

describe('evidenceRefsExtendedSchema', () => {
  it('defaults to empty array when omitted', () => {
    assert.deepEqual(evidenceRefsExtendedSchema.parse(undefined), []);
  });

  it('parses an array of extended refs with mixed kinds', () => {
    const refs = evidenceRefsExtendedSchema.parse([
      { url: 'u1', tier: 'tier1', confidence: 90, supporting_evidence: 'quote', evidence_kind: 'direct_quote' },
      { url: 'u2', tier: 'tier1', confidence: 60, supporting_evidence: '', evidence_kind: 'identity_only' },
    ]);
    assert.equal(refs.length, 2);
    assert.equal(refs[0].evidence_kind, 'direct_quote');
    assert.equal(refs[1].evidence_kind, 'identity_only');
  });

  it('rejects an array where any ref is malformed', () => {
    assert.throws(() =>
      evidenceRefsExtendedSchema.parse([
        { url: 'u1', tier: 'tier1', confidence: 90, supporting_evidence: 'quote', evidence_kind: 'direct_quote' },
        { url: 'u2', tier: 'tier1', confidence: 60, supporting_evidence: '', evidence_kind: 'bogus_kind' },
      ]),
    );
  });
});
