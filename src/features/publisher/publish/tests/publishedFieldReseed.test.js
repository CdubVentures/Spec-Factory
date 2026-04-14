import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { rebuildPublishedFieldsFromJson } from '../publishedFieldReseed.js';

const PRODUCT_ROOT = path.join('.tmp', '_test_published_field_reseed');

function writeProduct(productId, data) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify(data, null, 2));
}

describe('rebuildPublishedFieldsFromJson', () => {
  let specDb;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  });

  after(() => {
    specDb.close();
    fs.rmSync(PRODUCT_ROOT, { recursive: true, force: true });
  });

  it('marks matching candidate as resolved from product.json fields', () => {
    // Seed a candidate row
    specDb.upsertFieldCandidate({
      productId: 'rs-match', fieldKey: 'weight', value: '58',
      confidence: 90, sourceCount: 1,
      sourcesJson: [{ source: 'test' }],
      validationJson: { valid: true, repairs: [], rejections: [] },
      metadataJson: {},
    });

    // Write product.json with fields section
    writeProduct('rs-match', {
      category: 'mouse', product_id: 'rs-match',
      fields: { weight: { value: 58, confidence: 90, source: 'pipeline', resolved_at: new Date().toISOString(), sources: [] } },
      candidates: {},
    });

    const stats = rebuildPublishedFieldsFromJson({ specDb, productRoot: PRODUCT_ROOT });

    assert.equal(stats.seeded, 1);
    assert.equal(stats.fields_seeded, 1);

    const resolved = specDb.getResolvedFieldCandidate('rs-match', 'weight');
    assert.ok(resolved);
    assert.equal(resolved.status, 'resolved');
  });

  // WHY: When published value has no matching candidate and no linked_candidates,
  // reseed skips it (don't create ghost rows from derived/merged state).
  it('skips non-manual-override field when no matching candidate exists', () => {
    writeProduct('rs-new', {
      category: 'mouse', product_id: 'rs-new',
      fields: { sensor: { value: 'PAW3950', confidence: 95, source: 'pipeline', resolved_at: new Date().toISOString(), sources: [{ source: 'test' }] } },
      candidates: {},
    });

    rebuildPublishedFieldsFromJson({ specDb, productRoot: PRODUCT_ROOT });

    // No candidate row was created — the published value is derived state, not a candidate
    const resolved = specDb.getResolvedFieldCandidate('rs-new', 'sensor');
    assert.equal(resolved, null);
  });

  it('skips products with wrong category', () => {
    writeProduct('rs-wrong-cat', {
      category: 'keyboard', product_id: 'rs-wrong-cat',
      fields: { weight: { value: 100, confidence: 100 } },
    });

    const stats = rebuildPublishedFieldsFromJson({ specDb, productRoot: PRODUCT_ROOT });

    assert.ok(stats.skipped >= 1);
  });

  it('skips products with empty fields section', () => {
    writeProduct('rs-empty', {
      category: 'mouse', product_id: 'rs-empty',
      fields: {},
    });

    const stats = rebuildPublishedFieldsFromJson({ specDb, productRoot: PRODUCT_ROOT });

    // Empty fields = skipped (no fields_seeded for this product)
    assert.ok(stats.found >= 1);
  });

  // ── Source-centric reseed (Phase 3) ─────────────────────────────────

  it('resolves by source_id from linked_candidates when available', () => {
    // Seed a source-centric candidate
    specDb.insertFieldCandidate({
      productId: 'rs-srcid', fieldKey: 'weight',
      sourceId: 'cef-rs-srcid-1', sourceType: 'cef',
      value: '58', confidence: 90, model: 'gemini',
      validationJson: {}, metadataJson: {},
    });

    writeProduct('rs-srcid', {
      category: 'mouse', product_id: 'rs-srcid',
      fields: {
        weight: {
          value: 58, confidence: 90, source: 'pipeline',
          resolved_at: new Date().toISOString(), sources: [],
          linked_candidates: [
            { source_id: 'cef-rs-srcid-1', value: '58', confidence: 90 },
          ],
        },
      },
      candidates: {},
    });

    rebuildPublishedFieldsFromJson({ specDb, productRoot: PRODUCT_ROOT });

    const row = specDb.getFieldCandidateBySourceId('rs-srcid', 'weight', 'cef-rs-srcid-1');
    assert.ok(row);
    assert.equal(row.status, 'resolved');
  });

  it('handles manual override fields correctly', () => {
    writeProduct('rs-override', {
      category: 'mouse', product_id: 'rs-override',
      fields: { weight: { value: 99, confidence: 1.0, source: 'manual_override', resolved_at: new Date().toISOString(), sources: [] } },
      candidates: {},
    });

    const stats = rebuildPublishedFieldsFromJson({ specDb, productRoot: PRODUCT_ROOT });

    assert.ok(stats.fields_seeded >= 1);
    const row = specDb.getFieldCandidate('rs-override', 'weight', '99');
    assert.ok(row);
    assert.equal(row.metadata_json.source, 'manual_override');
  });

  it('manual override reseed preserves source_id from product.json sources', () => {
    writeProduct('rs-mansrc', {
      category: 'mouse', product_id: 'rs-mansrc',
      fields: {
        weight: {
          value: 42, confidence: 1.0, source: 'manual_override',
          resolved_at: new Date().toISOString(),
          sources: [{ source: 'manual_override', source_id: 'manual-rs-mansrc-1700000000000' }],
        },
      },
      candidates: {},
    });

    rebuildPublishedFieldsFromJson({ specDb, productRoot: PRODUCT_ROOT });

    // WHY: The manual override's source_id should be preserved from product.json,
    // not replaced with a legacy-* synthetic ID.
    const rows = specDb.getFieldCandidatesByProductAndField('rs-mansrc', 'weight');
    assert.ok(rows.length >= 1, 'should have at least 1 row');
    assert.equal(rows[0].source_id, 'manual-rs-mansrc-1700000000000', 'should preserve source_id from sources array');
    assert.equal(rows[0].source_type, 'manual_override');
    assert.equal(rows[0].status, 'resolved');
  });
});
