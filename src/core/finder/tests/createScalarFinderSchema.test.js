/**
 * createScalarFinderSchema — LLM response schema factory tests.
 *
 * Locks the Zod shape produced for any scalar field finder (release_date, sku,
 * msrp, discontinued, upc, ...). The returned schema must round-trip every field
 * RDF's hand-written releaseDateFinderResponseSchema currently accepts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createScalarFinderSchema } from '../createScalarFinderSchema.js';

describe('createScalarFinderSchema — shape', () => {
  it('produces a Zod schema with the declared valueKey', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    const parsed = schema.parse({
      release_date: '2024-03-15',
      confidence: 90,
      unknown_reason: '',
      evidence_refs: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    });
    assert.equal(parsed.release_date, '2024-03-15');
  });

  it('carries a different valueKey when requested (sku)', () => {
    const schema = createScalarFinderSchema({ valueKey: 'sku', valueType: 'string' });
    const parsed = schema.parse({ sku: 'ABC-123', confidence: 80 });
    assert.equal(parsed.sku, 'ABC-123');
  });

  it('accepts "unk" as the value for any valueType', () => {
    for (const valueType of ['date', 'string', 'int']) {
      const schema = createScalarFinderSchema({ valueKey: 'v', valueType });
      const parsed = schema.parse({ v: 'unk', confidence: 0, unknown_reason: 'no signal' });
      assert.equal(parsed.v, 'unk', `valueType=${valueType}`);
    }
  });

  it('string valueType accepts arbitrary strings', () => {
    const schema = createScalarFinderSchema({ valueKey: 'sku', valueType: 'string' });
    assert.doesNotThrow(() => schema.parse({ sku: 'WIDGET-42', confidence: 50 }));
  });

  it('int valueType accepts non-negative integers', () => {
    const schema = createScalarFinderSchema({ valueKey: 'msrp', valueType: 'int' });
    const parsed = schema.parse({ msrp: 149, confidence: 75 });
    assert.equal(parsed.msrp, 149);
  });

  it('int valueType accepts 0', () => {
    const schema = createScalarFinderSchema({ valueKey: 'msrp', valueType: 'int' });
    assert.doesNotThrow(() => schema.parse({ msrp: 0, confidence: 50 }));
  });
});

describe('createScalarFinderSchema — shared confidence / evidence / discovery', () => {
  it('clamps confidence to 0-100 integer (reject over 100)', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    assert.throws(() => schema.parse({ release_date: '2024-03-15', confidence: 150 }));
  });

  it('rejects confidence below 0', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    assert.throws(() => schema.parse({ release_date: '2024-03-15', confidence: -5 }));
  });

  it('rejects non-integer confidence', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    assert.throws(() => schema.parse({ release_date: '2024-03-15', confidence: 85.5 }));
  });

  it('defaults missing evidence_refs to empty array', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    const parsed = schema.parse({ release_date: '2024-03', confidence: 60 });
    assert.deepEqual(parsed.evidence_refs, []);
  });

  it('defaults missing discovery_log to empty structure', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    const parsed = schema.parse({ release_date: '2024', confidence: 50 });
    assert.deepEqual(parsed.discovery_log, { urls_checked: [], queries_run: [], notes: [] });
  });

  it('defaults missing unknown_reason to empty string', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    const parsed = schema.parse({ release_date: '2024', confidence: 50 });
    assert.equal(parsed.unknown_reason, '');
  });

  it('preserves evidence_refs shape (url, tier, confidence)', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    const parsed = schema.parse({
      release_date: '2024-03-15',
      confidence: 90,
      evidence_refs: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
    });
    assert.equal(parsed.evidence_refs[0].url, 'https://mfr.example.com');
    assert.equal(parsed.evidence_refs[0].tier, 'tier1');
    assert.equal(parsed.evidence_refs[0].confidence, 95);
  });

  it('defaults per-source evidence confidence to 0 when omitted', () => {
    const schema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date' });
    const parsed = schema.parse({
      release_date: '2024',
      confidence: 50,
      evidence_refs: [{ url: 'u', tier: 'tier1' }],
    });
    assert.equal(parsed.evidence_refs[0].confidence, 0);
  });
});

describe('createScalarFinderSchema — valueRegex refinement', () => {
  it('accepts value matching the regex', () => {
    const schema = createScalarFinderSchema({
      valueKey: 'sku', valueType: 'string', valueRegex: '^[A-Z]{3}-\\d{3}$',
    });
    assert.doesNotThrow(() => schema.parse({ sku: 'ABC-123', confidence: 50 }));
  });

  it('rejects value that fails the regex', () => {
    const schema = createScalarFinderSchema({
      valueKey: 'sku', valueType: 'string', valueRegex: '^[A-Z]{3}-\\d{3}$',
    });
    assert.throws(() => schema.parse({ sku: 'abc-123', confidence: 50 }));
  });

  it('accepts "unk" literal even when regex is declared', () => {
    const schema = createScalarFinderSchema({
      valueKey: 'sku', valueType: 'string', valueRegex: '^[A-Z]{3}-\\d{3}$',
    });
    assert.doesNotThrow(() => schema.parse({ sku: 'unk', confidence: 0, unknown_reason: 'no sku' }));
  });
});

describe('createScalarFinderSchema — error paths', () => {
  it('throws without valueKey', () => {
    assert.throws(() => createScalarFinderSchema({}), /valueKey required/);
  });

  it('throws on unknown valueType', () => {
    assert.throws(
      () => createScalarFinderSchema({ valueKey: 'x', valueType: 'blob' }),
      /unknown valueType/,
    );
  });

  it('defaults valueType to "string" when omitted', () => {
    const schema = createScalarFinderSchema({ valueKey: 'name' });
    assert.doesNotThrow(() => schema.parse({ name: 'whatever', confidence: 50 }));
  });
});

describe('createScalarFinderSchema — parity with RDF hand-written schema', () => {
  it('produces the same observable parse behavior as releaseDateFinderResponseSchema', async () => {
    // WHY: RDF now opts into the extended evidence shape via includeEvidenceKind.
    // The factory parity test must pass the same flag to remain apples-to-apples.
    const { releaseDateFinderResponseSchema } = await import('../../../features/release-date/releaseDateSchema.js');
    const factorySchema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date', includeEvidenceKind: true });
    const sample = {
      release_date: '2024-03-15',
      confidence: 90,
      unknown_reason: '',
      evidence_refs: [{ url: 'https://example.com', tier: 'tier1', confidence: 95 }],
      discovery_log: { urls_checked: ['https://a.com'], queries_run: ['q1'], notes: ['n1'] },
    };
    assert.deepEqual(factorySchema.parse(sample), releaseDateFinderResponseSchema.parse(sample));
  });

  it('factory default evidence_refs matches RDF default', async () => {
    const { releaseDateFinderResponseSchema } = await import('../../../features/release-date/releaseDateSchema.js');
    const factorySchema = createScalarFinderSchema({ valueKey: 'release_date', valueType: 'date', includeEvidenceKind: true });
    const minimal = { release_date: '2024', confidence: 50 };
    assert.deepEqual(factorySchema.parse(minimal), releaseDateFinderResponseSchema.parse(minimal));
  });
});
