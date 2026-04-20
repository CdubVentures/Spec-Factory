import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { clearPublishedField } from '../clearPublishedField.js';

// Each test gets a fresh specDb + clean product root.
function withFreshEnv(fn) {
  return () => {
    const root = path.join('.tmp', `_test_clear_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    fs.mkdirSync(root, { recursive: true });
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

    function makeProductJson(overrides = {}) {
      return {
        schema_version: 2, checkpoint_type: 'product',
        product_id: 'mouse-001', category: 'mouse',
        identity: { brand: 'Test', model: 'Test' },
        sources: [], fields: {}, variant_fields: {}, candidates: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...overrides,
      };
    }

    let _ctr = 0;
    function seed(productId, fieldKey, value, confidence, {
      sourceType = 'pipeline', status = 'candidate', variantId = null, metadataJson = {},
    } = {}) {
      const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
      const sid = `${sourceType}-${productId}-${fieldKey}-${++_ctr}`;
      specDb.insertFieldCandidate({
        productId, fieldKey, value: serialized,
        sourceId: sid, sourceType, model: 'test-model',
        confidence,
        validationJson: { valid: true, repairs: [], rejections: [] },
        metadataJson, status,
        variantId,
      });
      return sid;
    }

    try {
      fn({ specDb, root, makeProductJson, seed });
    } finally {
      specDb.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

describe('clearPublishedField — scalar scope', () => {
  it('deletes product.json.fields[fieldKey] and demotes resolved scalar row', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '58', 0.9, { status: 'resolved', metadataJson: { publish_result: { status: 'published' } } });
    const productJson = makeProductJson({
      fields: { weight: { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    const result = clearPublishedField({
      specDb, productId: 'mouse-001', fieldKey: 'weight', productJson,
    });

    assert.equal(result.status, 'cleared');
    assert.equal(result.scope, 'scalar');
    assert.equal(productJson.fields.weight, undefined, 'scalar fields[weight] removed');
    const rows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'weight');
    assert.equal(rows.length, 1, 'candidate row preserved');
    assert.equal(rows[0].status, 'candidate', 'resolved → candidate');
  }));

  it('nulls out publish_result on demoted candidate rows', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '58', 0.9, {
      status: 'resolved',
      metadataJson: { publish_result: { status: 'published', published_at: '2026-04-01T00:00:00Z' }, other: 'stays' },
    });
    const productJson = makeProductJson({
      fields: { weight: { value: 58, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
    });

    clearPublishedField({ specDb, productId: 'mouse-001', fieldKey: 'weight', productJson });

    const rows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'weight');
    assert.equal(rows[0].metadata_json.publish_result, null, 'publish_result cleared');
    assert.equal(rows[0].metadata_json.other, 'stays', 'other metadata preserved');
  }));

  it('scalar clear does NOT touch variant-scoped rows or variant_fields', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'release_date', '2025-11-11', 0.9, { status: 'resolved', variantId: 'v_black' });
    seed('mouse-001', 'name', 'Scalar', 0.9, { status: 'resolved' });
    const productJson = makeProductJson({
      fields: { name: { value: 'Scalar', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
      variant_fields: { v_black: { release_date: { value: '2025-11-11', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } } },
    });

    clearPublishedField({ specDb, productId: 'mouse-001', fieldKey: 'name', productJson });

    assert.equal(productJson.fields.name, undefined, 'scalar cleared');
    assert.ok(productJson.variant_fields.v_black.release_date, 'variant untouched');
    const vrows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'release_date', 'v_black');
    assert.equal(vrows[0].status, 'resolved', 'variant row still resolved');
  }));

  it('absent field: returns unchanged, no-op', withFreshEnv(({ specDb, makeProductJson }) => {
    const productJson = makeProductJson({ fields: {} });
    const result = clearPublishedField({
      specDb, productId: 'mouse-001', fieldKey: 'weight', productJson,
    });
    assert.equal(result.status, 'unchanged');
  }));

  it('manual-override lock releases after scalar clear (republish via submitCandidate succeeds)', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'weight', '99', 1.0, { status: 'resolved', sourceType: 'manual_override', metadataJson: { source: 'manual_override' } });
    const productJson = makeProductJson({
      fields: { weight: { value: 99, confidence: 1.0, source: 'manual_override', sources: [], linked_candidates: [] } },
    });

    clearPublishedField({ specDb, productId: 'mouse-001', fieldKey: 'weight', productJson });

    // The lock in publishCandidate.js:124-127 checks productJson.fields[fieldKey]?.source === 'manual_override'.
    // After clear, productJson.fields.weight is undefined → lock no longer blocks.
    assert.equal(productJson.fields.weight, undefined, 'lock bypassed by removing the resolved field entry');
  }));
});

describe('clearPublishedField — variant-single scope', () => {
  it('deletes variant_fields[vid][fieldKey] and demotes only that variant row', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'release_date', '2025-11-11', 0.9, { status: 'resolved', variantId: 'v_black' });
    seed('mouse-001', 'release_date', '2025-12-09', 0.9, { status: 'resolved', variantId: 'v_white' });
    const productJson = makeProductJson({
      variant_fields: {
        v_black: { release_date: { value: '2025-11-11', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
        v_white: { release_date: { value: '2025-12-09', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } },
      },
    });

    const result = clearPublishedField({
      specDb, productId: 'mouse-001', fieldKey: 'release_date', productJson, variantId: 'v_black',
    });

    assert.equal(result.status, 'cleared');
    assert.equal(result.scope, 'variant-single');
    assert.equal(productJson.variant_fields.v_black?.release_date, undefined, 'black release_date cleared');
    assert.ok(productJson.variant_fields.v_white.release_date, 'white still present');
    const blackRows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'release_date', 'v_black');
    const whiteRows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'release_date', 'v_white');
    assert.equal(blackRows[0].status, 'candidate', 'black demoted');
    assert.equal(whiteRows[0].status, 'resolved', 'white untouched');
  }));

  it('empties an empty variant_fields[vid] after clearing its last field', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'release_date', '2025-11-11', 0.9, { status: 'resolved', variantId: 'v_black' });
    const productJson = makeProductJson({
      variant_fields: { v_black: { release_date: { value: '2025-11-11', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } } },
    });

    clearPublishedField({
      specDb, productId: 'mouse-001', fieldKey: 'release_date', productJson, variantId: 'v_black',
    });

    // variant_fields[v_black] is now empty and should be pruned for cleanliness
    assert.equal(productJson.variant_fields.v_black, undefined, 'empty variant entry pruned');
  }));
});

describe('clearPublishedField — variant-all scope', () => {
  it('deletes variant_fields[*][fieldKey] for every variant and demotes each', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'release_date', '2025-11-11', 0.9, { status: 'resolved', variantId: 'v_black' });
    seed('mouse-001', 'release_date', '2025-12-09', 0.9, { status: 'resolved', variantId: 'v_white' });
    // unrelated variant field that must survive
    seed('mouse-001', 'price', '49.99', 0.9, { status: 'resolved', variantId: 'v_black' });
    const productJson = makeProductJson({
      variant_fields: {
        v_black: {
          release_date: { value: '2025-11-11', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] },
          price: { value: 49.99, confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] },
        },
        v_white: {
          release_date: { value: '2025-12-09', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] },
        },
      },
    });

    const result = clearPublishedField({
      specDb, productId: 'mouse-001', fieldKey: 'release_date', productJson, allVariants: true,
    });

    assert.equal(result.status, 'cleared');
    assert.equal(result.scope, 'variant-all');
    assert.equal(productJson.variant_fields.v_black?.release_date, undefined, 'black release_date cleared');
    assert.equal(productJson.variant_fields.v_white, undefined, 'white pruned (empty after clear)');
    assert.ok(productJson.variant_fields.v_black.price, 'unrelated variant field survives');
    const releaseRows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'release_date');
    assert.ok(releaseRows.every((r) => r.status === 'candidate'), 'all release_date rows demoted');
    const priceRows = specDb.getFieldCandidatesByProductAndField('mouse-001', 'price');
    assert.ok(priceRows.every((r) => r.status === 'resolved'), 'price rows untouched');
  }));

  it('variant-all does NOT touch scalar fields[fieldKey]', withFreshEnv(({ specDb, makeProductJson, seed }) => {
    seed('mouse-001', 'release_date', '2025-11-11', 0.9, { status: 'resolved', variantId: 'v_black' });
    seed('mouse-001', 'release_date', '2099-01-01', 1.0, { status: 'resolved', sourceType: 'manual_override', metadataJson: { source: 'manual_override' } });
    const productJson = makeProductJson({
      fields: { release_date: { value: '2099-01-01', confidence: 1.0, source: 'manual_override', sources: [], linked_candidates: [] } },
      variant_fields: { v_black: { release_date: { value: '2025-11-11', confidence: 0.9, source: 'pipeline', sources: [], linked_candidates: [] } } },
    });

    clearPublishedField({
      specDb, productId: 'mouse-001', fieldKey: 'release_date', productJson, allVariants: true,
    });

    assert.ok(productJson.fields.release_date, 'scalar override survives variant-all clear');
    assert.equal(productJson.variant_fields.v_black?.release_date, undefined, 'variant cleared');
  }));
});

describe('clearPublishedField — validation', () => {
  it('rejects variantId + allVariants together', withFreshEnv(({ specDb, makeProductJson }) => {
    const productJson = makeProductJson();
    assert.throws(
      () => clearPublishedField({
        specDb, productId: 'mouse-001', fieldKey: 'release_date', productJson,
        variantId: 'v_black', allVariants: true,
      }),
      /mutually exclusive|both.*not allowed/i,
    );
  }));
});
