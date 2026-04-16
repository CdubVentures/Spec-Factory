/**
 * variantPropagation — contract tests.
 *
 * propagateVariantRenames walks product_images.json and updates every
 * occurrence of old_variant_key to new_variant_key, anchored by variant_id.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { propagateVariantRenames, remapOrphanedVariantKeys } from '../variantPropagation.js';

const TMP_ROOT = path.join('.tmp', '_test_variant_propagation');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanup() {
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* */ }
}

function writePifDoc(productId, doc) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product_images.json'), JSON.stringify(doc, null, 2), 'utf8');
}

function readPifDoc(productId) {
  try {
    return JSON.parse(fs.readFileSync(path.join(PRODUCT_ROOT, productId, 'product_images.json'), 'utf8'));
  } catch { return null; }
}

/* ── Factories ──────────────────────────────────────────────────── */

function makeImage(overrides = {}) {
  return {
    view: 'top',
    filename: 'top-black-1.png',
    url: 'https://example.com/top-black.png',
    variant_id: 'v_aaa11111',
    variant_key: 'color:black',
    variant_label: 'black',
    variant_type: 'color',
    quality_pass: true,
    ...overrides,
  };
}

function makeRun(overrides = {}) {
  return {
    run_number: 1,
    ran_at: '2026-04-01T00:00:00Z',
    model: 'test-model',
    selected: { images: [makeImage()] },
    response: {
      mode: 'view',
      variant_key: 'color:black',
      variant_label: 'black',
      images: [makeImage()],
      discovery_log: { urls_checked: [], queries_run: [] },
    },
    ...overrides,
  };
}

function makeEval(overrides = {}) {
  return {
    type: 'view',
    view: 'top',
    variant_key: 'color:black',
    variant_label: 'black',
    variant_type: 'color',
    model: 'test-model',
    ran_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeFullDoc(productId = 'mouse-001') {
  return {
    product_id: productId,
    category: 'mouse',
    selected: {
      images: [
        makeImage(),
        makeImage({ view: 'left', filename: 'left-black-1.png', variant_id: 'v_aaa11111', variant_key: 'color:black' }),
        makeImage({ view: 'top', filename: 'top-white-1.png', variant_id: 'v_bbb22222', variant_key: 'color:white', variant_label: 'white' }),
      ],
    },
    carousel_slots: {
      'color:black': { top: 'top-black-1.png', left: 'left-black-1.png' },
      'color:white': { top: 'top-white-1.png' },
    },
    evaluations: [
      makeEval(),
      makeEval({ view: 'left' }),
      makeEval({ variant_key: 'color:white', variant_label: 'white' }),
    ],
    runs: [makeRun()],
    run_count: 1,
    next_run_number: 2,
  };
}

describe('propagateVariantRenames', () => {
  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
  });

  after(() => cleanup());

  // ── 1. Happy path: single rename ──

  it('renames variant_key on selected.images matching variant_id', () => {
    writePifDoc('rename-img', makeFullDoc('rename-img'));

    const result = propagateVariantRenames({
      productId: 'rename-img',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [{
        variant_id: 'v_aaa11111',
        old_variant_key: 'color:black',
        new_variant_key: 'color:obsidian',
        new_variant_label: 'Obsidian',
      }],
    });

    assert.equal(result.updated, true);
    assert.ok(result.counts.images >= 2, 'at least 2 images renamed');

    const doc = readPifDoc('rename-img');
    const renamedImages = doc.selected.images.filter(i => i.variant_key === 'color:obsidian');
    assert.equal(renamedImages.length, 2, 'both black images renamed to obsidian');
    assert.equal(renamedImages[0].variant_label, 'Obsidian');
    assert.equal(renamedImages[0].variant_id, 'v_aaa11111', 'variant_id unchanged');

    // White images untouched
    const whiteImages = doc.selected.images.filter(i => i.variant_key === 'color:white');
    assert.equal(whiteImages.length, 1);
  });

  it('re-keys carousel_slots from old key to new key', () => {
    writePifDoc('rename-slots', makeFullDoc('rename-slots'));

    propagateVariantRenames({
      productId: 'rename-slots',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [{
        variant_id: 'v_aaa11111',
        old_variant_key: 'color:black',
        new_variant_key: 'color:obsidian',
        new_variant_label: 'Obsidian',
      }],
    });

    const doc = readPifDoc('rename-slots');
    assert.equal(doc.carousel_slots['color:black'], undefined, 'old key removed');
    assert.deepEqual(doc.carousel_slots['color:obsidian'], { top: 'top-black-1.png', left: 'left-black-1.png' });
    assert.deepEqual(doc.carousel_slots['color:white'], { top: 'top-white-1.png' }, 'white untouched');
  });

  it('updates evaluations[] variant_key matching old key', () => {
    writePifDoc('rename-evals', makeFullDoc('rename-evals'));

    const result = propagateVariantRenames({
      productId: 'rename-evals',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [{
        variant_id: 'v_aaa11111',
        old_variant_key: 'color:black',
        new_variant_key: 'color:obsidian',
        new_variant_label: 'Obsidian',
      }],
    });

    assert.ok(result.counts.evalRecords >= 2);

    const doc = readPifDoc('rename-evals');
    const renamedEvals = doc.evaluations.filter(e => e.variant_key === 'color:obsidian');
    assert.equal(renamedEvals.length, 2);
    assert.equal(renamedEvals[0].variant_label, 'Obsidian');

    // White eval untouched
    const whiteEvals = doc.evaluations.filter(e => e.variant_key === 'color:white');
    assert.equal(whiteEvals.length, 1);
  });

  it('updates runs[].response.variant_key and runs[].response.images[]', () => {
    writePifDoc('rename-runs', makeFullDoc('rename-runs'));

    const result = propagateVariantRenames({
      productId: 'rename-runs',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [{
        variant_id: 'v_aaa11111',
        old_variant_key: 'color:black',
        new_variant_key: 'color:obsidian',
        new_variant_label: 'Obsidian',
      }],
    });

    assert.ok(result.counts.runs >= 1);

    const doc = readPifDoc('rename-runs');
    const run = doc.runs[0];
    assert.equal(run.response.variant_key, 'color:obsidian');
    assert.equal(run.response.variant_label, 'Obsidian');

    // Run selected images also renamed
    const runImg = run.selected.images.find(i => i.variant_id === 'v_aaa11111');
    assert.equal(runImg.variant_key, 'color:obsidian');

    // Run response images also renamed
    const respImg = run.response.images.find(i => i.variant_id === 'v_aaa11111');
    assert.equal(respImg.variant_key, 'color:obsidian');
  });

  // ── 2. No PIF data ──

  it('returns updated: false when PIF doc does not exist', () => {
    const result = propagateVariantRenames({
      productId: 'nonexistent-product',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [{
        variant_id: 'v_aaa11111',
        old_variant_key: 'color:black',
        new_variant_key: 'color:obsidian',
        new_variant_label: 'Obsidian',
      }],
    });

    assert.equal(result.updated, false);
  });

  // ── 3. Old key not found ──

  it('no-op when old_variant_key is not present anywhere', () => {
    writePifDoc('no-match', makeFullDoc('no-match'));

    const result = propagateVariantRenames({
      productId: 'no-match',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [{
        variant_id: 'v_zzz99999',
        old_variant_key: 'color:nonexistent',
        new_variant_key: 'color:still-nonexistent',
        new_variant_label: 'Still Nonexistent',
      }],
    });

    assert.equal(result.updated, true); // doc was read, but nothing changed
    assert.equal(result.counts.images, 0);
    assert.equal(result.counts.evalRecords, 0);
    assert.equal(result.counts.carouselSlots, 0);
    assert.equal(result.counts.runs, 0);
  });

  // ── 4. Legacy images (no variant_id) — only variant_key match used ──

  it('does NOT rename legacy images without variant_id (cannot confirm identity)', () => {
    const doc = makeFullDoc('legacy-mix');
    // Remove variant_id from one image
    doc.selected.images[0].variant_id = undefined;
    delete doc.selected.images[0].variant_id;
    writePifDoc('legacy-mix', doc);

    propagateVariantRenames({
      productId: 'legacy-mix',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [{
        variant_id: 'v_aaa11111',
        old_variant_key: 'color:black',
        new_variant_key: 'color:obsidian',
        new_variant_label: 'Obsidian',
      }],
    });

    const result = readPifDoc('legacy-mix');
    // Image without variant_id should NOT be renamed (can't confirm identity)
    assert.equal(result.selected.images[0].variant_key, 'color:black', 'legacy image untouched');
    // Image WITH variant_id should be renamed
    assert.equal(result.selected.images[1].variant_key, 'color:obsidian', 'v_id image renamed');
  });

  // ── 5. Multiple renames in one call ──

  it('handles multiple registry updates in one call', () => {
    writePifDoc('multi-rename', makeFullDoc('multi-rename'));

    const result = propagateVariantRenames({
      productId: 'multi-rename',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [
        { variant_id: 'v_aaa11111', old_variant_key: 'color:black', new_variant_key: 'color:obsidian', new_variant_label: 'Obsidian' },
        { variant_id: 'v_bbb22222', old_variant_key: 'color:white', new_variant_key: 'color:arctic', new_variant_label: 'Arctic White' },
      ],
    });

    assert.equal(result.updated, true);

    const doc = readPifDoc('multi-rename');
    assert.equal(doc.selected.images.filter(i => i.variant_key === 'color:obsidian').length, 2);
    assert.equal(doc.selected.images.filter(i => i.variant_key === 'color:arctic').length, 1);
    assert.ok(doc.carousel_slots['color:obsidian']);
    assert.ok(doc.carousel_slots['color:arctic']);
    assert.equal(doc.carousel_slots['color:black'], undefined);
    assert.equal(doc.carousel_slots['color:white'], undefined);
  });

  // ── 6. Idempotent ──

  it('second call with same updates is idempotent', () => {
    writePifDoc('idempotent', makeFullDoc('idempotent'));

    const updates = [{
      variant_id: 'v_aaa11111',
      old_variant_key: 'color:black',
      new_variant_key: 'color:obsidian',
      new_variant_label: 'Obsidian',
    }];

    propagateVariantRenames({ productId: 'idempotent', productRoot: PRODUCT_ROOT, registryUpdates: updates });
    const after1 = readPifDoc('idempotent');

    // Second call — old_variant_key is gone, but variant_id still matches
    propagateVariantRenames({ productId: 'idempotent', productRoot: PRODUCT_ROOT, registryUpdates: updates });
    const after2 = readPifDoc('idempotent');

    assert.deepEqual(after1.selected.images, after2.selected.images);
    assert.deepEqual(after1.carousel_slots, after2.carousel_slots);
  });

  // ── 7. Empty registryUpdates ──

  it('empty registryUpdates is a no-op', () => {
    writePifDoc('empty-updates', makeFullDoc('empty-updates'));

    const result = propagateVariantRenames({
      productId: 'empty-updates',
      productRoot: PRODUCT_ROOT,
      registryUpdates: [],
    });

    assert.equal(result.updated, true);
    assert.equal(result.counts.images, 0);
  });
});

/* ── remapOrphanedVariantKeys ──────────────────────────────────── */

describe('remapOrphanedVariantKeys', () => {
  before(() => fs.mkdirSync(PRODUCT_ROOT, { recursive: true }));
  after(() => cleanup());

  it('remaps variant_key, variant_id, and variant_label on selected.images', () => {
    const doc = {
      product_id: 'remap-basic',
      category: 'mouse',
      selected: {
        images: [
          makeImage({ variant_key: 'edition:doom-old', variant_id: 'v_stale', variant_label: 'DOOM Old' }),
          makeImage({ view: 'left', filename: 'left.png', variant_key: 'color:black' }),
        ],
      },
      carousel_slots: {},
      evaluations: [],
      runs: [],
    };
    writePifDoc('remap-basic', doc);

    const result = remapOrphanedVariantKeys({
      productId: 'remap-basic',
      productRoot: PRODUCT_ROOT,
      remaps: [{
        oldKey: 'edition:doom-old',
        newKey: 'edition:doom-new',
        newVariantId: 'v_correct',
        newLabel: 'DOOM New',
      }],
    });

    assert.equal(result.updated, true);
    assert.ok(result.counts.images >= 1);

    const updated = readPifDoc('remap-basic');
    const img = updated.selected.images[0];
    assert.equal(img.variant_key, 'edition:doom-new');
    assert.equal(img.variant_id, 'v_correct');
    assert.equal(img.variant_label, 'DOOM New');

    // Other images untouched
    assert.equal(updated.selected.images[1].variant_key, 'color:black');
  });

  it('re-keys carousel_slots from old key to new key', () => {
    const doc = {
      product_id: 'remap-carousel',
      category: 'mouse',
      selected: { images: [makeImage({ variant_key: 'color:old-blue', variant_id: 'v_stale' })] },
      carousel_slots: { 'color:old-blue': { top: 'top.png' }, 'color:black': { top: 'b.png' } },
      evaluations: [],
      runs: [],
    };
    writePifDoc('remap-carousel', doc);

    remapOrphanedVariantKeys({
      productId: 'remap-carousel',
      productRoot: PRODUCT_ROOT,
      remaps: [{ oldKey: 'color:old-blue', newKey: 'color:ocean-blue', newVariantId: 'v_correct', newLabel: 'Ocean Blue' }],
    });

    const updated = readPifDoc('remap-carousel');
    assert.equal(updated.carousel_slots['color:old-blue'], undefined);
    assert.deepEqual(updated.carousel_slots['color:ocean-blue'], { top: 'top.png' });
    assert.deepEqual(updated.carousel_slots['color:black'], { top: 'b.png' }, 'other slots untouched');
  });

  it('updates evaluations matching old variant_key', () => {
    const doc = {
      product_id: 'remap-evals',
      category: 'mouse',
      selected: { images: [] },
      carousel_slots: {},
      evaluations: [
        makeEval({ variant_key: 'color:old-blue', variant_label: 'Old Blue' }),
        makeEval({ variant_key: 'color:black' }),
      ],
      runs: [],
    };
    writePifDoc('remap-evals', doc);

    const result = remapOrphanedVariantKeys({
      productId: 'remap-evals',
      productRoot: PRODUCT_ROOT,
      remaps: [{ oldKey: 'color:old-blue', newKey: 'color:ocean-blue', newVariantId: 'v_correct', newLabel: 'Ocean Blue' }],
    });

    assert.ok(result.counts.evalRecords >= 1);
    const updated = readPifDoc('remap-evals');
    assert.equal(updated.evaluations[0].variant_key, 'color:ocean-blue');
    assert.equal(updated.evaluations[0].variant_label, 'Ocean Blue');
    assert.equal(updated.evaluations[1].variant_key, 'color:black', 'other evals untouched');
  });

  it('remaps images in runs[].selected and runs[].response', () => {
    const doc = {
      product_id: 'remap-runs',
      category: 'mouse',
      selected: { images: [] },
      carousel_slots: {},
      evaluations: [],
      runs: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'test',
        selected: { images: [makeImage({ variant_key: 'color:old-blue', variant_id: 'v_stale' })] },
        response: {
          variant_key: 'color:old-blue', variant_label: 'Old Blue',
          images: [makeImage({ variant_key: 'color:old-blue', variant_id: 'v_stale' })],
        },
      }],
    };
    writePifDoc('remap-runs', doc);

    remapOrphanedVariantKeys({
      productId: 'remap-runs',
      productRoot: PRODUCT_ROOT,
      remaps: [{ oldKey: 'color:old-blue', newKey: 'color:ocean-blue', newVariantId: 'v_correct', newLabel: 'Ocean Blue' }],
    });

    const updated = readPifDoc('remap-runs');
    const run = updated.runs[0];
    assert.equal(run.selected.images[0].variant_key, 'color:ocean-blue');
    assert.equal(run.selected.images[0].variant_id, 'v_correct');
    assert.equal(run.response.variant_key, 'color:ocean-blue');
    assert.equal(run.response.variant_label, 'Ocean Blue');
    assert.equal(run.response.images[0].variant_key, 'color:ocean-blue');
  });

  it('returns updated: false when PIF doc does not exist', () => {
    const result = remapOrphanedVariantKeys({
      productId: 'nonexistent',
      productRoot: PRODUCT_ROOT,
      remaps: [{ oldKey: 'color:x', newKey: 'color:y', newVariantId: 'v_aaa', newLabel: 'Y' }],
    });
    assert.equal(result.updated, false);
  });

  it('no-op when remaps is empty', () => {
    const doc = {
      product_id: 'remap-empty',
      category: 'mouse',
      selected: { images: [makeImage()] },
      carousel_slots: {},
      evaluations: [],
      runs: [],
    };
    writePifDoc('remap-empty', doc);

    const result = remapOrphanedVariantKeys({
      productId: 'remap-empty',
      productRoot: PRODUCT_ROOT,
      remaps: [],
    });

    assert.equal(result.updated, true);
    assert.equal(result.counts.images, 0);
  });
});
