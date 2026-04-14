/**
 * backfillPifVariantIds — contract tests.
 *
 * Scans products, reads CEF variant_registry, stamps variant_id on
 * PIF images and run responses that are missing it. Idempotent.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { backfillPifVariantIds } from '../backfillPifVariantIds.js';

const TMP_ROOT = path.join('.tmp', '_test_backfill_variant_ids');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanup() {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* */ }
}

function writeJson(productId, filename, data) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf8');
}

function readJson(productId, filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, productId, filename), 'utf8'));
  } catch { return null; }
}

function makeCefDoc(productId, category, registry) {
  return {
    product_id: productId,
    category,
    selected: { colors: ['black'], editions: {}, default_color: 'black' },
    variant_registry: registry,
    runs: [],
    run_count: 0,
  };
}

function makePifDoc(productId, category, images, runs = []) {
  return {
    product_id: productId,
    category,
    selected: { images },
    carousel_slots: {},
    evaluations: [],
    runs,
    run_count: runs.length,
  };
}

describe('backfillPifVariantIds', () => {
  before(() => fs.mkdirSync(PRODUCT_ROOT, { recursive: true }));
  after(() => cleanup());

  it('stamps variant_id on images from registry', () => {
    const pid = 'bf-stamp';
    const registry = [{ variant_key: 'color:black', variant_id: 'v_aaa11111' }];
    writeJson(pid, 'color_edition.json', makeCefDoc(pid, 'mouse', registry));
    writeJson(pid, 'product_images.json', makePifDoc(pid, 'mouse', [
      { view: 'top', filename: 'top-black.png', variant_key: 'color:black', variant_label: 'black' },
    ]));

    const result = backfillPifVariantIds({ productRoot: PRODUCT_ROOT });

    assert.equal(result.backfilled, 1);
    const doc = readJson(pid, 'product_images.json');
    assert.equal(doc.selected.images[0].variant_id, 'v_aaa11111');
  });

  it('stamps variant_id on run response images and top-level variant_id', () => {
    const pid = 'bf-runs';
    const registry = [{ variant_key: 'color:black', variant_id: 'v_aaa11111' }];
    writeJson(pid, 'color_edition.json', makeCefDoc(pid, 'mouse', registry));
    writeJson(pid, 'product_images.json', makePifDoc(pid, 'mouse',
      [{ view: 'top', filename: 'top-black.png', variant_key: 'color:black' }],
      [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'test',
        selected: { images: [{ view: 'top', filename: 'top-black.png', variant_key: 'color:black' }] },
        response: {
          variant_key: 'color:black', variant_label: 'black',
          images: [{ view: 'top', filename: 'top-black.png', variant_key: 'color:black' }],
        },
      }],
    ));

    backfillPifVariantIds({ productRoot: PRODUCT_ROOT });

    const doc = readJson(pid, 'product_images.json');
    assert.equal(doc.runs[0].selected.images[0].variant_id, 'v_aaa11111');
    assert.equal(doc.runs[0].response.variant_id, 'v_aaa11111');
    assert.equal(doc.runs[0].response.images[0].variant_id, 'v_aaa11111');
  });

  it('skips images already stamped (idempotent)', () => {
    const pid = 'bf-idempotent';
    const registry = [{ variant_key: 'color:black', variant_id: 'v_aaa11111' }];
    writeJson(pid, 'color_edition.json', makeCefDoc(pid, 'mouse', registry));
    writeJson(pid, 'product_images.json', makePifDoc(pid, 'mouse', [
      { view: 'top', filename: 'top-black.png', variant_key: 'color:black', variant_id: 'v_aaa11111' },
    ]));

    const result = backfillPifVariantIds({ productRoot: PRODUCT_ROOT });

    assert.equal(result.skipped >= 1, true);
  });

  it('skips products with no CEF data', () => {
    const pid = 'bf-no-cef';
    writeJson(pid, 'product_images.json', makePifDoc(pid, 'mouse', [
      { view: 'top', filename: 'top-black.png', variant_key: 'color:black' },
    ]));

    const result = backfillPifVariantIds({ productRoot: PRODUCT_ROOT });

    // Should not crash, product skipped
    const doc = readJson(pid, 'product_images.json');
    assert.equal(doc.selected.images[0].variant_id, undefined, 'no variant_id without CEF registry');
  });

  it('skips products with no PIF data', () => {
    const pid = 'bf-no-pif';
    const registry = [{ variant_key: 'color:black', variant_id: 'v_aaa11111' }];
    writeJson(pid, 'color_edition.json', makeCefDoc(pid, 'mouse', registry));

    const result = backfillPifVariantIds({ productRoot: PRODUCT_ROOT });

    // Should not crash
    assert.ok(result);
  });

  it('stamps only matching images, leaves others untouched', () => {
    const pid = 'bf-partial';
    const registry = [{ variant_key: 'color:black', variant_id: 'v_aaa11111' }];
    writeJson(pid, 'color_edition.json', makeCefDoc(pid, 'mouse', registry));
    writeJson(pid, 'product_images.json', makePifDoc(pid, 'mouse', [
      { view: 'top', filename: 'top-black.png', variant_key: 'color:black' },
      { view: 'top', filename: 'top-red.png', variant_key: 'color:red' },
    ]));

    backfillPifVariantIds({ productRoot: PRODUCT_ROOT });

    const doc = readJson(pid, 'product_images.json');
    assert.equal(doc.selected.images[0].variant_id, 'v_aaa11111');
    assert.equal(doc.selected.images[1].variant_id, undefined, 'no matching registry entry');
  });

  it('skips products with empty variant_registry', () => {
    const pid = 'bf-empty-reg';
    writeJson(pid, 'color_edition.json', makeCefDoc(pid, 'mouse', []));
    writeJson(pid, 'product_images.json', makePifDoc(pid, 'mouse', [
      { view: 'top', filename: 'top-black.png', variant_key: 'color:black' },
    ]));

    const result = backfillPifVariantIds({ productRoot: PRODUCT_ROOT });

    const doc = readJson(pid, 'product_images.json');
    assert.equal(doc.selected.images[0].variant_id, undefined);
  });
});
