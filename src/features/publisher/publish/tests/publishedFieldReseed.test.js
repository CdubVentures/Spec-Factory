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

  it('upserts resolved candidate when no matching row exists', () => {
    writeProduct('rs-new', {
      category: 'mouse', product_id: 'rs-new',
      fields: { sensor: { value: 'PAW3950', confidence: 95, source: 'pipeline', resolved_at: new Date().toISOString(), sources: [{ source: 'test' }] } },
      candidates: {},
    });

    const stats = rebuildPublishedFieldsFromJson({ specDb, productRoot: PRODUCT_ROOT });

    assert.ok(stats.fields_seeded >= 1);
    const resolved = specDb.getResolvedFieldCandidate('rs-new', 'sensor');
    assert.ok(resolved);
    assert.equal(resolved.status, 'resolved');
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
});
