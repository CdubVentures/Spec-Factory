import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../specDb.js';
import { getVariantDossier } from '../helpers/variantDossierHelper.js';

const TEST_DIR = path.join('.workspace', 'db', '_test_variant_dossier');
const DB_PATH = path.join(TEST_DIR, 'spec.sqlite');

function seedVariant(db, { productId, variantId, variantKey, variantType, variantLabel, colorAtoms = [], editionSlug = null, editionDisplayName = null }) {
  db.variants.upsert({
    productId, variantId, variantKey, variantType, variantLabel,
    colorAtoms, editionSlug, editionDisplayName,
  });
}

function seedCandidate(db, { productId, fieldKey, sourceId, sourceType, value, variantId = null, confidence = 0.8, metadataJson = {} }) {
  db.insertFieldCandidate({
    productId, fieldKey, sourceId, sourceType, value,
    confidence, variantId, metadataJson,
    unit: null, model: '', validationJson: {}, status: 'candidate',
  });
}

describe('getVariantDossier', () => {
  let db;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    db = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(DB_PATH); } catch { /* */ }
    try { fs.rmdirSync(TEST_DIR); } catch { /* */ }
  });

  it('returns variant identity + candidates grouped by field_key', () => {
    const productId = 'mouse-p1';
    const variantId = 'v_aaaaaaaa';
    seedVariant(db, {
      productId, variantId, variantKey: 'color:black',
      variantType: 'color', variantLabel: 'Black',
      colorAtoms: ['black'],
    });
    seedCandidate(db, { productId, fieldKey: 'release_date', sourceId: 'rdf-p1-1', sourceType: 'rdf', value: '2025-06-01', variantId });
    seedCandidate(db, { productId, fieldKey: 'sku', sourceId: 'skuf-p1-1', sourceType: 'skuf', value: 'SKU-BLK-001', variantId });

    const dossier = getVariantDossier(db, { productId, variantId });

    assert.ok(dossier.variant);
    assert.equal(dossier.variant.variant_id, variantId);
    assert.equal(dossier.variant.variant_key, 'color:black');
    assert.equal(dossier.variant.variant_type, 'color');
    assert.deepEqual(dossier.variant.color_atoms, ['black']);

    assert.ok(dossier.candidates.release_date);
    assert.equal(dossier.candidates.release_date.length, 1);
    assert.equal(dossier.candidates.release_date[0].value, '2025-06-01');

    assert.ok(dossier.candidates.sku);
    assert.equal(dossier.candidates.sku[0].value, 'SKU-BLK-001');
  });

  it('includes item-default candidates (variant_id IS NULL) and sets hasDefaults=true', () => {
    const productId = 'mouse-p2';
    const variantId = 'v_bbbbbbbb';
    seedVariant(db, {
      productId, variantId, variantKey: 'color:white',
      variantType: 'color', variantLabel: 'White', colorAtoms: ['white'],
    });
    seedCandidate(db, { productId, fieldKey: 'weight', sourceId: 'pipe-p2-1', sourceType: 'pipeline', value: '95g', variantId: null });
    seedCandidate(db, { productId, fieldKey: 'release_date', sourceId: 'rdf-p2-1', sourceType: 'rdf', value: '2025-07-01', variantId });

    const dossier = getVariantDossier(db, { productId, variantId });

    assert.equal(dossier.hasDefaults, true);
    assert.ok(dossier.candidates.weight);
    assert.equal(dossier.candidates.weight[0].value, '95g');
    assert.equal(dossier.candidates.weight[0].variant_id, null);
    assert.ok(dossier.candidates.release_date);
  });

  it('hasDefaults=false when all candidates are variant-scoped', () => {
    const productId = 'mouse-p3';
    const variantId = 'v_cccccccc';
    seedVariant(db, {
      productId, variantId, variantKey: 'color:red',
      variantType: 'color', variantLabel: 'Red', colorAtoms: ['red'],
    });
    seedCandidate(db, { productId, fieldKey: 'sku', sourceId: 'skuf-p3-1', sourceType: 'skuf', value: 'SKU-RED', variantId });

    const dossier = getVariantDossier(db, { productId, variantId });

    assert.equal(dossier.hasDefaults, false);
    assert.equal(dossier.candidates.sku.length, 1);
  });

  it('excludes other variants candidates, includes own + item-default', () => {
    const productId = 'mouse-p4';
    const myVariant = 'v_dddddddd';
    const otherVariant = 'v_eeeeeeee';
    seedVariant(db, {
      productId, variantId: myVariant, variantKey: 'color:blue',
      variantType: 'color', variantLabel: 'Blue', colorAtoms: ['blue'],
    });
    seedVariant(db, {
      productId, variantId: otherVariant, variantKey: 'color:green',
      variantType: 'color', variantLabel: 'Green', colorAtoms: ['green'],
    });
    seedCandidate(db, { productId, fieldKey: 'sku', sourceId: 'skuf-p4-1', sourceType: 'skuf', value: 'SKU-BLUE', variantId: myVariant });
    seedCandidate(db, { productId, fieldKey: 'sku', sourceId: 'skuf-p4-2', sourceType: 'skuf', value: 'SKU-GREEN', variantId: otherVariant });
    seedCandidate(db, { productId, fieldKey: 'material', sourceId: 'pipe-p4-1', sourceType: 'pipeline', value: 'plastic', variantId: null });

    const dossier = getVariantDossier(db, { productId, variantId: myVariant });

    assert.equal(dossier.candidates.sku.length, 1);
    assert.equal(dossier.candidates.sku[0].value, 'SKU-BLUE');
    assert.ok(dossier.candidates.material);
    assert.equal(dossier.candidates.material[0].value, 'plastic');
    assert.equal(dossier.hasDefaults, true);
  });

  it('excludes other products candidates', () => {
    const productIdA = 'mouse-p5a';
    const productIdB = 'mouse-p5b';
    const variantId = 'v_ffffffff';
    seedVariant(db, {
      productId: productIdA, variantId, variantKey: 'color:pink',
      variantType: 'color', variantLabel: 'Pink', colorAtoms: ['pink'],
    });
    seedVariant(db, {
      productId: productIdB, variantId, variantKey: 'color:pink',
      variantType: 'color', variantLabel: 'Pink', colorAtoms: ['pink'],
    });
    seedCandidate(db, { productId: productIdA, fieldKey: 'sku', sourceId: 'skuf-p5a-1', sourceType: 'skuf', value: 'SKU-A', variantId });
    seedCandidate(db, { productId: productIdB, fieldKey: 'sku', sourceId: 'skuf-p5b-1', sourceType: 'skuf', value: 'SKU-B', variantId });

    const dossier = getVariantDossier(db, { productId: productIdA, variantId });

    assert.equal(dossier.candidates.sku.length, 1);
    assert.equal(dossier.candidates.sku[0].value, 'SKU-A');
  });

  it('returns null variant + empty candidates for unknown variantId', () => {
    const dossier = getVariantDossier(db, { productId: 'mouse-nonexistent', variantId: 'v_99999999' });
    assert.equal(dossier.variant, null);
    assert.deepEqual(dossier.candidates, {});
    assert.equal(dossier.hasDefaults, false);
  });

  it('returns variant with empty candidates when product has none', () => {
    const productId = 'mouse-p6';
    const variantId = 'v_gggggggg';
    seedVariant(db, {
      productId, variantId, variantKey: 'color:gold',
      variantType: 'color', variantLabel: 'Gold', colorAtoms: ['gold'],
    });

    const dossier = getVariantDossier(db, { productId, variantId });
    assert.ok(dossier.variant);
    assert.equal(dossier.variant.variant_id, variantId);
    assert.deepEqual(dossier.candidates, {});
    assert.equal(dossier.hasDefaults, false);
  });

  it('hydrates metadata_json as object', () => {
    const productId = 'mouse-p7';
    const variantId = 'v_hhhhhhhh';
    seedVariant(db, {
      productId, variantId, variantKey: 'color:silver',
      variantType: 'color', variantLabel: 'Silver', colorAtoms: ['silver'],
    });
    seedCandidate(db, {
      productId, fieldKey: 'release_date', sourceId: 'rdf-p7-1', sourceType: 'rdf',
      value: '2025-08-01', variantId,
      metadataJson: { per_variant: { v_hhhhhhhh: '2025-08-01' }, attempts: 2 },
    });

    const dossier = getVariantDossier(db, { productId, variantId });

    const cand = dossier.candidates.release_date[0];
    assert.equal(typeof cand.metadata_json, 'object');
    assert.equal(cand.metadata_json.attempts, 2);
    assert.equal(cand.metadata_json.per_variant.v_hhhhhhhh, '2025-08-01');
  });
});
