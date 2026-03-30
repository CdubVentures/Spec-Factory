import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  inferProductIdFromKey,
  slug,
  hostnameFromUrl,
  firstEvidence,
  stableSpecFieldOrder,
  readOverrideDoc,
  listApprovedOverrideProductIds,
  mergeOverrideValue,
  computeDiffRows,
  coverageFromSpecs,
  resolveFieldConfidence,
  evidenceWarningsForRecord,
  buildUnknowns,
  sourceCountFromProvenance,
  summarizeConfidenceFromMetadata,
  normalizeSpecForCompact,
  toJsonLdProduct,
  toMarkdownRecord,
  buildSpecsWithMetadata
} from '../publishSpecBuilders.js';

test('inferProductIdFromKey extracts product id from path', () => {
  assert.equal(inferProductIdFromKey('output/mouse/published/logitech-g502/current.json'), 'logitech-g502');
  assert.equal(inferProductIdFromKey('no-match'), '');
  assert.equal(inferProductIdFromKey(null), '');
});

test('slug normalizes string to URL-safe slug', () => {
  assert.equal(slug('Logitech G502'), 'logitech-g502');
  assert.equal(slug('--hello--'), 'hello');
  assert.equal(slug(''), '');
  assert.equal(slug(null), '');
});

test('hostnameFromUrl extracts hostname', () => {
  assert.equal(hostnameFromUrl('https://www.example.com/path'), 'www.example.com');
  assert.equal(hostnameFromUrl('invalid'), '');
  assert.equal(hostnameFromUrl(null), '');
});

test('firstEvidence returns first evidence array element', () => {
  const row = { evidence: [{ url: 'a' }, { url: 'b' }] };
  assert.deepEqual(firstEvidence(row), { url: 'a' });
});

test('firstEvidence returns row itself when no evidence array', () => {
  const row = { url: 'direct' };
  assert.deepEqual(firstEvidence(row), { url: 'direct' });
});

test('firstEvidence handles empty evidence array', () => {
  assert.deepEqual(firstEvidence({ evidence: [] }), { evidence: [] });
});

test('stableSpecFieldOrder sorts field keys alphabetically', () => {
  assert.deepEqual(stableSpecFieldOrder({ z: 1, a: 2, m: 3 }), ['a', 'm', 'z']);
  assert.deepEqual(stableSpecFieldOrder({}), []);
});

test('computeDiffRows detects added, removed, changed fields', () => {
  const prev = { weight: 100, dpi: 16000 };
  const next = { weight: 105, sensor: 'hero' };
  const rows = computeDiffRows(prev, next);
  assert.equal(rows.length, 3);
  const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
  assert.equal(byField.weight.before, 100);
  assert.equal(byField.weight.after, 105);
  assert.equal(byField.dpi.before, 16000);
  assert.equal(byField.dpi.after, 'unk');
  assert.equal(byField.sensor.before, 'unk');
  assert.equal(byField.sensor.after, 'hero');
});

test('computeDiffRows returns empty when identical', () => {
  assert.deepEqual(computeDiffRows({ a: 1 }, { a: 1 }), []);
});

test('coverageFromSpecs calculates ratio', () => {
  const result = coverageFromSpecs({ weight: '100g', dpi: 'unk', sensor: 'hero' });
  assert.equal(result.total, 3);
  assert.equal(result.known, 2);
  assert.ok(result.coverage > 0.6 && result.coverage < 0.7);
});

test('coverageFromSpecs with empty specs', () => {
  assert.deepEqual(coverageFromSpecs({}), { total: 0, known: 0, coverage: 0 });
});

test('resolveFieldConfidence clamps to 0-1', () => {
  assert.equal(resolveFieldConfidence({ confidence: 0.85 }), 0.85);
  assert.equal(resolveFieldConfidence({ confidence: 1.5 }), 1);
  assert.equal(resolveFieldConfidence({ confidence: -0.1 }), 0);
  assert.equal(resolveFieldConfidence({}), 0);
});

test('mergeOverrideValue builds correct evidence shape', () => {
  const result = mergeOverrideValue({
    existing: { old: true },
    override: {
      override_value: '100g',
      override_provenance: { url: 'https://example.com', source_id: 's1' },
      source: { method: 'user_correction' },
      candidate_id: 'c1',
      override_source: 'review_ui',
      override_reason: 'verified'
    },
    field: 'weight'
  });
  assert.equal(result.value, '100g');
  assert.equal(result.confidence, 1);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].tier, 1);
  assert.equal(result.evidence[0].tierName, 'user_override');
  assert.equal(result.evidence[0].host, 'example.com');
  assert.equal(result.override.candidate_id, 'c1');
  assert.equal(result.override.override_source, 'review_ui');
});

test('mergeOverrideValue returns existing when no value', () => {
  const existing = { old: true };
  assert.deepEqual(mergeOverrideValue({ existing, override: {}, field: 'x' }), existing);
});

test('buildSpecsWithMetadata enriches with unit/confidence/source', () => {
  const engine = {
    getFieldRule: (field) => field === 'weight' ? { contract: { unit: 'g' } } : {}
  };
  const result = buildSpecsWithMetadata({
    engine,
    fields: { weight: '100' },
    provenance: {
      weight: {
        confidence: 0.9,
        evidence: [{ host: 'example.com', tierName: 'official', retrieved_at: '2024-01-01', source_id: 's1', snippet_id: 'sn1', snippet_hash: 'h1' }]
      }
    },
    fieldOrder: ['weight']
  });
  assert.equal(result.weight.value, 100);
  assert.equal(result.weight.unit, 'g');
  assert.equal(result.weight.confidence, 0.9);
  assert.equal(result.weight.source, 'example.com');
});

test('normalizeSpecForCompact keeps only slim fields', () => {
  const full = {
    product_id: 'p1',
    category: 'mouse',
    published_version: '1.0.0',
    published_at: '2024-01-01',
    identity: { brand: 'X' },
    specs: { weight: 100 },
    metrics: { coverage: 0.5 },
    provenance: { big: 'data' },
    unknowns: {}
  };
  const result = normalizeSpecForCompact(full);
  assert.ok(result.product_id);
  assert.ok(!result.provenance);
  assert.ok(!result.unknowns);
});

test('toJsonLdProduct builds JSON-LD shape', () => {
  const result = toJsonLdProduct({
    identity: { brand: 'Logitech', model: 'G502' },
    category: 'mouse',
    specs: { weight: '121g', dpi: 'unk' }
  });
  assert.equal(result['@context'], 'https://schema.org');
  assert.equal(result['@type'], 'Product');
  assert.equal(result.brand.name, 'Logitech');
  assert.equal(result.additionalProperty.length, 1);
  assert.equal(result.additionalProperty[0].name, 'weight');
});

test('toMarkdownRecord produces table format', () => {
  const md = toMarkdownRecord({
    product_id: 'p1',
    category: 'mouse',
    published_version: '1.0.0',
    published_at: '2024-01-01',
    identity: { full_name: 'Test Mouse' },
    specs_with_metadata: {
      weight: { value: '100g', confidence: 0.9, source: 'example.com' }
    }
  });
  assert.ok(md.includes('# Test Mouse'));
  assert.ok(md.includes('| weight |'));
  assert.ok(md.includes('| --- | --- | ---: | --- |'));
});

test('evidenceWarningsForRecord flags missing url/quote/snippet', () => {
  const warnings = evidenceWarningsForRecord(
    { weight: '100g' },
    { weight: {} }
  );
  assert.ok(warnings.some((w) => w.code === 'missing_evidence_url'));
  assert.ok(warnings.some((w) => w.code === 'missing_evidence_quote'));
  assert.ok(warnings.some((w) => w.code === 'missing_snippet_id'));
});

test('evidenceWarningsForRecord skips unk fields', () => {
  assert.deepEqual(evidenceWarningsForRecord({ weight: 'unk' }, {}), []);
});

test('buildUnknowns collects unk fields with reasons', () => {
  const result = buildUnknowns(
    { weight: '100g', dpi: 'unk' },
    { field_reasoning: { dpi: { unknown_reason: 'not_in_specs' } } }
  );
  assert.ok(!result.weight);
  assert.equal(result.dpi.reason, 'not_in_specs');
});

test('buildUnknowns defaults reason to not_found_after_search', () => {
  const result = buildUnknowns({ a: 'unk' }, {});
  assert.equal(result.a.reason, 'not_found_after_search');
});

test('sourceCountFromProvenance counts unique sources', () => {
  const count = sourceCountFromProvenance({
    weight: { evidence: [{ source_id: 's1', host: 'a.com' }] },
    dpi: { evidence: [{ source_id: 's1', host: 'b.com' }] }
  });
  assert.ok(count >= 2);
});

test('summarizeConfidenceFromMetadata averages confidence', () => {
  const avg = summarizeConfidenceFromMetadata({
    a: { confidence: 0.8 },
    b: { confidence: 0.6 }
  });
  assert.equal(avg, 0.7);
});

test('summarizeConfidenceFromMetadata returns 0 for empty', () => {
  assert.equal(summarizeConfidenceFromMetadata({}), 0);
});

test('readOverrideDoc returns null payload for ENOENT', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pub-test-'));
  try {
    const result = await readOverrideDoc({
      config: { categoryAuthorityRoot: tmpDir },
      category: 'mouse',
      productId: 'nonexistent'
    });
    assert.equal(result.payload, null);
    assert.ok(result.path.includes('nonexistent'));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('listApprovedOverrideProductIds filters by approved status via specDb', async () => {
  const { SpecDb } = await import('../../db/specDb.js');
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.upsertProductReviewState({ productId: 'p1', category: 'mouse', reviewStatus: 'approved', reviewedBy: 'test', reviewedAt: new Date().toISOString() });
  specDb.upsertProductReviewState({ productId: 'p2', category: 'mouse', reviewStatus: 'pending', reviewedBy: 'test', reviewedAt: new Date().toISOString() });
  const ids = await listApprovedOverrideProductIds({
    config: {},
    category: 'mouse',
    specDb
  });
  assert.deepEqual(ids, ['p1']);
});

test('listApprovedOverrideProductIds returns empty for missing dir', async () => {
  const ids = await listApprovedOverrideProductIds({
    config: { categoryAuthorityRoot: '/nonexistent-path-xyz' },
    category: 'mouse'
  });
  assert.deepEqual(ids, []);
});
