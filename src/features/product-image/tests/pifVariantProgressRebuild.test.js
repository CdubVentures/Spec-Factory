/**
 * PIF variant progress rebuilder — tests the deleted-DB rebuild contract.
 * Walks product_images.json per product, runs evaluateCarousel per active
 * variant, and upserts a row for each.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { rebuildPifVariantProgressFromJson } from '../pifVariantProgressRebuild.js';
import { writeProductImages } from '../productImageStore.js';

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pif-var-progress-rebuild-'));
}

function makeImage(view, variantKey, filename) {
  return {
    view,
    filename,
    url: `https://example.com/${filename}`,
    variant_id: 'v_abc12345',
    variant_key: variantKey,
    variant_label: variantKey.split(':')[1] || variantKey,
    variant_type: 'color',
    quality_pass: true,
  };
}

function makeFakeSpecDb({
  category = 'mouse',
  variantsByProduct = {},
  viewConfig = JSON.stringify([
    { key: 'top', priority: true }, { key: 'left', priority: true }, { key: 'angle', priority: true },
    { key: 'bottom', priority: false }, { key: 'right', priority: false },
    { key: 'front', priority: false }, { key: 'rear', priority: false }, { key: 'sangle', priority: false },
  ]),
  viewBudget = '["top","left","angle","bottom"]',
  heroEnabled = 'true',
  heroCount = '1',
  satisfactionThreshold = '1',
} = {}) {
  const upserted = [];
  return {
    category,
    upsertPifVariantProgress(row) { upserted.push(row); },
    variants: {
      listActive(pid) { return variantsByProduct[pid] || []; },
    },
    getFinderStore(moduleId) {
      if (moduleId !== 'productImageFinder') return null;
      return {
        getSetting(key) {
          if (key === 'viewConfig') return viewConfig;
          if (key === 'viewBudget') return viewBudget;
          if (key === 'heroEnabled') return heroEnabled;
          if (key === 'heroCount') return heroCount;
          if (key === 'satisfactionThreshold') return satisfactionThreshold;
          return null;
        },
      };
    },
    _upserted: upserted,
  };
}

describe('rebuildPifVariantProgressFromJson', () => {
  it('returns zero stats for empty product root', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb();
    const stats = rebuildPifVariantProgressFromJson({ specDb, productRoot: root });
    assert.strictEqual(stats.found, 0);
    assert.strictEqual(stats.seeded, 0);
    assert.strictEqual(stats.variants_seeded, 0);
  });

  it('returns zero stats for nonexistent product root', () => {
    const specDb = makeFakeSpecDb();
    const stats = rebuildPifVariantProgressFromJson({
      specDb,
      productRoot: path.join(os.tmpdir(), 'nonexistent-pif-var-' + Date.now()),
    });
    assert.strictEqual(stats.found, 0);
    assert.strictEqual(stats.seeded, 0);
  });

  it('skips products whose category does not match specDb.category', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb({ category: 'mouse' });

    writeProductImages({
      productId: 'kb-001', productRoot: root, data: {
        product_id: 'kb-001',
        category: 'keyboard',
        selected: { images: [] },
        runs: [],
      }
    });

    const stats = rebuildPifVariantProgressFromJson({ specDb, productRoot: root });
    assert.strictEqual(stats.found, 1);
    assert.strictEqual(stats.skipped, 1);
    assert.strictEqual(stats.variants_seeded, 0);
  });

  it('splits priority vs loop-extras vs hero when upserting per variant', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb({
      category: 'mouse',
      variantsByProduct: {
        'mouse-001': [
          { variant_id: 'v_black1', variant_key: 'color:black' },
          { variant_id: 'v_white1', variant_key: 'color:white' },
        ],
      },
      // viewConfig priority: top/left/angle (3). viewBudget: top/left/angle/bottom.
      // Loop extras = budget - priority = [bottom] (1).
      viewConfig: JSON.stringify([
        { key: 'top', priority: true }, { key: 'left', priority: true }, { key: 'angle', priority: true },
        { key: 'bottom', priority: false },
      ]),
      viewBudget: '["top","left","angle","bottom"]',
      heroCount: '1',
    });

    writeProductImages({
      productId: 'mouse-001', productRoot: root, data: {
        product_id: 'mouse-001',
        category: 'mouse',
        selected: {
          images: [
            makeImage('top', 'color:black', 'top-black.png'),         // priority
            makeImage('left', 'color:black', 'left-black.png'),       // priority
            makeImage('bottom', 'color:black', 'bottom-black.png'),   // loop extra
            makeImage('hero', 'color:black', 'hero-black.png'),       // hero
            makeImage('top', 'color:white', 'top-white.png'),         // priority only for white
          ],
        },
        runs: [],
      }
    });

    const stats = rebuildPifVariantProgressFromJson({ specDb, productRoot: root });
    assert.strictEqual(stats.seeded, 1);
    assert.strictEqual(stats.variants_seeded, 2);
    assert.strictEqual(specDb._upserted.length, 2);

    const black = specDb._upserted.find(r => r.variantKey === 'color:black');
    const white = specDb._upserted.find(r => r.variantKey === 'color:white');

    // Black: 2 priority (top, left), 1 loop (bottom), 1 hero
    assert.strictEqual(black.priorityFilled, 2);
    assert.strictEqual(black.priorityTotal, 3);
    assert.strictEqual(black.loopFilled, 1);
    assert.strictEqual(black.loopTotal, 1);
    assert.strictEqual(black.heroFilled, 1);
    assert.strictEqual(black.heroTarget, 1);

    // White: 1 priority (top), 0 loop, 0 hero
    assert.strictEqual(white.priorityFilled, 1);
    assert.strictEqual(white.priorityTotal, 3);
    assert.strictEqual(white.loopFilled, 0);
    assert.strictEqual(white.loopTotal, 1);
    assert.strictEqual(white.heroFilled, 0);
    assert.strictEqual(white.heroTarget, 1);
  });

  it('returns zero stats when specDb lacks upsertPifVariantProgress (safety)', () => {
    const root = makeTmpRoot();
    const stats = rebuildPifVariantProgressFromJson({
      specDb: { category: 'mouse' },
      productRoot: root,
    });
    assert.strictEqual(stats.found, 0);
    assert.strictEqual(stats.variants_seeded, 0);
  });

  it('skips products with no active variants', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb({ category: 'mouse', variantsByProduct: {} });

    writeProductImages({
      productId: 'mouse-nv', productRoot: root, data: {
        product_id: 'mouse-nv',
        category: 'mouse',
        selected: { images: [makeImage('top', 'color:black', 'top.png')] },
        runs: [],
      }
    });

    const stats = rebuildPifVariantProgressFromJson({ specDb, productRoot: root });
    assert.strictEqual(stats.found, 1);
    assert.strictEqual(stats.skipped, 1);
    assert.strictEqual(stats.variants_seeded, 0);
  });
});
