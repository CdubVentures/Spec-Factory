/**
 * PIF variant progress rebuilder — tests the deleted-DB rebuild contract.
 * Walks product_images.json per product, resolves carousel slot occupancy
 * via resolveCarouselSlots() per active variant, and upserts a row for each.
 *
 * Counts are SLOT-FILL (user-override OR eval-winner / ranked hero), NOT
 * "N images collected per view". Overview rings + Indexing Lab dots both
 * follow this contract — an unranked raw image doesn't fill a slot.
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

function makeImage(view, variantKey, filename, overrides = {}) {
  const { variant_id, ...rest } = overrides;
  // WHY: Prod PIF runs tag every image with the runtime variant_id. When the
  // test doesn't pin one, use a key-derived id so matchVariant's "both sides
  // have id" branch passes — mirrors real images, not a legacy stripped shape.
  const derivedId = `v_${variantKey.split(':')[1] || 'x'}`;
  return {
    view,
    filename,
    url: `https://example.com/${filename}`,
    variant_id: variant_id || derivedId,
    variant_key: variantKey,
    variant_label: variantKey.split(':')[1] || variantKey,
    variant_type: 'color',
    quality_pass: true,
    ...rest,
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
  carouselScoredViews = '',
  carouselOptionalViews = '',
  carouselExtraTarget = '',
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
          if (key === 'carouselScoredViews') return carouselScoredViews;
          if (key === 'carouselOptionalViews') return carouselOptionalViews;
          if (key === 'carouselExtraTarget') return carouselExtraTarget;
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

  it('tracks scored carousel view slots, extra-image count, and hero slots', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb({
      category: 'mouse',
      variantsByProduct: {
        'mouse-001': [
          { variant_id: 'v_black', variant_key: 'color:black' },
          { variant_id: 'v_white', variant_key: 'color:white' },
        ],
      },
      // carouselScoredViews unset => viewBudget is the scored denominator.
      // carouselExtraTarget unset => default extra-image target is 3.
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
            // Black: 3 eval-winner view slots (top + left + bottom)
            // + 1 ranked hero. "angle" has a raw image but NO eval_best → no slot.
            makeImage('top', 'color:black', 'top-black.png', { eval_best: true }),
            makeImage('left', 'color:black', 'left-black.png', { eval_best: true }),
            makeImage('angle', 'color:black', 'angle-black.png'),
            makeImage('bottom', 'color:black', 'bottom-black.png', { eval_best: true }),
            makeImage('hero', 'color:black', 'hero-black.png', { hero: true, hero_rank: 1 }),
            // White: 1 eval-winner priority slot + 1 raw unranked hero (no slot)
            makeImage('top', 'color:white', 'top-white.png', { eval_best: true }),
            makeImage('hero', 'color:white', 'hero-white.png'),
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

    // Black: 3 scored slots filled (top, left, bottom), 0 additional images,
    // and 1 hero (ranked). "angle" has an image but no
    // eval_best so its slot is empty. imageCount counts every image.
    assert.strictEqual(black.priorityFilled, 3);
    assert.strictEqual(black.priorityTotal, 4);
    assert.strictEqual(black.loopFilled, 0);
    assert.strictEqual(black.loopTotal, 3);
    assert.strictEqual(black.heroFilled, 1);
    assert.strictEqual(black.heroTarget, 1);
    assert.strictEqual(black.imageCount, 5);

    // White: only "top" has eval_best → 1 priority slot. The raw hero image
    // isn't ranked → 0 hero slot. Both images still count toward imageCount.
    assert.strictEqual(white.priorityFilled, 1);
    assert.strictEqual(white.priorityTotal, 4);
    assert.strictEqual(white.loopFilled, 0);
    assert.strictEqual(white.loopTotal, 3);
    assert.strictEqual(white.heroFilled, 0);
    assert.strictEqual(white.heroTarget, 1);
    assert.strictEqual(white.imageCount, 2);
  });

  it('lets optional carousel placeholders overfill the scored view denominator', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb({
      category: 'mouse',
      variantsByProduct: {
        'mouse-optional': [{ variant_id: 'v_black', variant_key: 'color:black' }],
      },
      viewBudget: '["top","left","angle","sangle","bottom"]',
      carouselScoredViews: '["top","left","angle","sangle","bottom"]',
      carouselOptionalViews: '["right","front","rear"]',
      carouselExtraTarget: '3',
      heroEnabled: 'false',
    });

    writeProductImages({
      productId: 'mouse-optional', productRoot: root, data: {
        product_id: 'mouse-optional',
        category: 'mouse',
        selected: {
          images: [
            makeImage('top', 'color:black', 'top.png', { eval_best: true, eval_actual_view: 'top', eval_usable_as_required_view: true }),
            makeImage('left', 'color:black', 'left.png', { eval_best: true, eval_actual_view: 'left', eval_usable_as_required_view: true }),
            makeImage('angle', 'color:black', 'angle.png', { eval_best: true, eval_actual_view: 'angle', eval_usable_as_required_view: true }),
            makeImage('sangle', 'color:black', 'sangle.png', { eval_best: true, eval_actual_view: 'sangle', eval_usable_as_required_view: true }),
            makeImage('bottom', 'color:black', 'bottom.png', { eval_best: true, eval_actual_view: 'bottom', eval_usable_as_required_view: true }),
            makeImage('right', 'color:black', 'right.png', {
              eval_best: true,
              eval_actual_view: 'right',
              eval_usable_as_required_view: true,
              eval_usable_as_carousel_extra: false,
            }),
          ],
        },
        runs: [],
      }
    });

    rebuildPifVariantProgressFromJson({ specDb, productRoot: root });
    const row = specDb._upserted[0];
    assert.strictEqual(row.priorityFilled, 6);
    assert.strictEqual(row.priorityTotal, 5);
    assert.strictEqual(row.loopFilled, 1);
    assert.strictEqual(row.loopTotal, 3);
    assert.strictEqual(row.heroFilled, 0);
    assert.strictEqual(row.heroTarget, 0);
  });

  it('respects user-override slots in carousel_slots (independent of eval_best)', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb({
      category: 'mouse',
      variantsByProduct: {
        'mouse-002': [{ variant_id: 'v_black', variant_key: 'color:black' }],
      },
      viewConfig: JSON.stringify([
        { key: 'top', priority: true }, { key: 'left', priority: true }, { key: 'angle', priority: true },
        { key: 'bottom', priority: false },
      ]),
      viewBudget: '["top","left","angle","bottom"]',
      heroCount: '1',
    });

    writeProductImages({
      productId: 'mouse-002', productRoot: root, data: {
        product_id: 'mouse-002',
        category: 'mouse',
        selected: {
          images: [
            makeImage('top', 'color:black', 'manual-top.png'),
            makeImage('hero', 'color:black', 'manual-hero.png'),
          ],
        },
        // Manual overrides occupy slots even without eval_best.
        carousel_slots: {
          'color:black': {
            top: 'manual-top.png',
            hero_1: 'manual-hero.png',
          },
        },
        runs: [],
      }
    });

    rebuildPifVariantProgressFromJson({ specDb, productRoot: root });
    const row = specDb._upserted[0];
    assert.strictEqual(row.priorityFilled, 1, 'user-override top should fill 1 priority slot');
    assert.strictEqual(row.loopFilled, 0);
    assert.strictEqual(row.heroFilled, 1, 'user-override hero_1 should fill 1 hero slot');
    assert.strictEqual(row.imageCount, 2);
  });

  it('treats __cleared__ overrides as empty (user explicitly emptied the slot)', () => {
    const root = makeTmpRoot();
    const specDb = makeFakeSpecDb({
      category: 'mouse',
      variantsByProduct: {
        'mouse-003': [{ variant_id: 'v_black', variant_key: 'color:black' }],
      },
      viewConfig: JSON.stringify([
        { key: 'top', priority: true }, { key: 'left', priority: true }, { key: 'angle', priority: true },
      ]),
      viewBudget: '["top","left","angle"]',
      heroCount: '1',
    });

    writeProductImages({
      productId: 'mouse-003', productRoot: root, data: {
        product_id: 'mouse-003',
        category: 'mouse',
        selected: {
          images: [makeImage('top', 'color:black', 'top.png', { eval_best: true })],
        },
        // User cleared the top slot — the eval winner must NOT auto-refill it.
        carousel_slots: { 'color:black': { top: '__cleared__' } },
        runs: [],
      }
    });

    rebuildPifVariantProgressFromJson({ specDb, productRoot: root });
    const row = specDb._upserted[0];
    assert.strictEqual(row.priorityFilled, 0);
    assert.strictEqual(row.imageCount, 1);
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
