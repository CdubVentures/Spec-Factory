import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { writeManualOverride } from '../writeManualOverride.js';

// Manual overrides write ONLY to product.json; they must NOT touch field_candidates.
// Candidates/evidence are reserved for pipeline / LLM extraction.

function withTempProduct(fn) {
  return () => {
    const root = path.join('.tmp', `_test_manual_override_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    const productDir = path.join(root, 'mouse-001');
    fs.mkdirSync(productDir, { recursive: true });
    const productPath = path.join(productDir, 'product.json');
    const initial = {
      schema_version: 2, product_id: 'mouse-001', category: 'mouse',
      identity: { brand: 'Test', model: 'Test' },
      sources: [], fields: {}, variant_fields: {}, candidates: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(productPath, JSON.stringify(initial, null, 2));
    try {
      fn({ root, productPath, readProduct: () => JSON.parse(fs.readFileSync(productPath, 'utf8')) });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

describe('writeManualOverride — scalar', () => {
  it('writes fields[fieldKey] with source=manual_override and confidence=1.0', withTempProduct(({ root, readProduct }) => {
    const result = writeManualOverride({
      productRoot: root, productId: 'mouse-001', fieldKey: 'weight',
      value: '58g', reviewer: 'chris', reason: 'spec sheet',
    });
    assert.equal(result.status, 'written');
    const pj = readProduct();
    assert.equal(pj.fields.weight.value, '58g');
    assert.equal(pj.fields.weight.source, 'manual_override');
    assert.equal(pj.fields.weight.confidence, 1.0);
    assert.equal(pj.fields.weight.reviewer, 'chris');
    assert.equal(pj.fields.weight.reason, 'spec sheet');
    assert.ok(pj.fields.weight.resolved_at);
  }));

  it('does NOT add to candidates — pool stays untouched', withTempProduct(({ root, readProduct }) => {
    writeManualOverride({
      productRoot: root, productId: 'mouse-001', fieldKey: 'weight', value: '58g',
    });
    const pj = readProduct();
    assert.deepEqual(pj.candidates, {}, 'candidates bucket empty');
    assert.equal(pj.fields.weight.linked_candidates.length, 0, 'no linked_candidates — override is user input');
  }));

  it('overwrites a previous override on the same field', withTempProduct(({ root, readProduct }) => {
    writeManualOverride({ productRoot: root, productId: 'mouse-001', fieldKey: 'weight', value: '58g' });
    writeManualOverride({ productRoot: root, productId: 'mouse-001', fieldKey: 'weight', value: '62g' });
    assert.equal(readProduct().fields.weight.value, '62g');
  }));
});

describe('writeManualOverride — variant-scoped', () => {
  it('writes variant_fields[vid][fieldKey] and leaves scalar fields untouched', withTempProduct(({ root, readProduct }) => {
    const result = writeManualOverride({
      productRoot: root, productId: 'mouse-001', fieldKey: 'release_date',
      value: '2025-11-11', variantId: 'v_black',
    });
    assert.equal(result.status, 'written');
    assert.equal(result.variantId, 'v_black');
    const pj = readProduct();
    assert.equal(pj.variant_fields.v_black.release_date.value, '2025-11-11');
    assert.equal(pj.variant_fields.v_black.release_date.source, 'manual_override');
    assert.equal(pj.fields.release_date, undefined, 'scalar fields[release_date] untouched');
  }));

  it('overriding one variant does not touch other variants', withTempProduct(({ root, readProduct }) => {
    writeManualOverride({ productRoot: root, productId: 'mouse-001', fieldKey: 'release_date', value: '2025-11-11', variantId: 'v_black' });
    writeManualOverride({ productRoot: root, productId: 'mouse-001', fieldKey: 'release_date', value: '2025-12-09', variantId: 'v_white' });
    const pj = readProduct();
    assert.equal(pj.variant_fields.v_black.release_date.value, '2025-11-11');
    assert.equal(pj.variant_fields.v_white.release_date.value, '2025-12-09');
  }));

  it('empty-string variantId is treated as scalar (writes to fields[])', withTempProduct(({ root, readProduct }) => {
    writeManualOverride({
      productRoot: root, productId: 'mouse-001', fieldKey: 'weight',
      value: '58g', variantId: '',
    });
    const pj = readProduct();
    assert.ok(pj.fields.weight);
    assert.equal(pj.variant_fields.v_black, undefined);
  }));
});

describe('writeManualOverride — defensive', () => {
  it('returns skipped when product.json does not exist', () => {
    const result = writeManualOverride({
      productRoot: '.tmp/_test_missing_dir_x',
      productId: 'does-not-exist',
      fieldKey: 'weight', value: '58g',
    });
    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'no_product_json');
  });
});
