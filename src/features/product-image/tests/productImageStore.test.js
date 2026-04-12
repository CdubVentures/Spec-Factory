/**
 * productImageStore — recalculateSelected accumulation tests.
 *
 * Verifies that multiple images per view per variant survive across runs.
 * The store must NOT dedup by view — filenames are unique via -N suffix.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  mergeProductImageDiscovery,
  readProductImages,
  recalculateProductImagesFromRuns,
} from '../productImageStore.js';

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pif-store-'));
}

function makeImage(view, variantKey, filename) {
  return {
    view,
    filename,
    url: `https://example.com/${filename}`,
    variant_key: variantKey,
    variant_label: variantKey.split(':')[1] || variantKey,
    variant_type: 'color',
    quality_pass: true,
  };
}

function mergeRun(productRoot, productId, images, { runStatus } = {}) {
  return mergeProductImageDiscovery({
    productId,
    productRoot,
    newDiscovery: { category: 'mouse', cooldown_until: '2099-01-01', last_ran_at: new Date().toISOString() },
    run: {
      model: 'test',
      fallback_used: false,
      selected: { images },
      prompt: { system: '', user: '' },
      response: { images },
      ...(runStatus ? { status: runStatus } : {}),
    },
  });
}

describe('productImageStore: multi-image accumulation', () => {
  it('two runs for same variant + same view → both images survive in selected', () => {
    const root = makeTmpRoot();
    const pid = 'test-product';

    mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black.jpg')]);
    const after = mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black-2.jpg')]);

    const topImages = after.selected.images.filter(i => i.view === 'top' && i.variant_key === 'color:black');
    assert.equal(topImages.length, 2, 'both top images must survive');
    assert.deepEqual(
      topImages.map(i => i.filename).sort(),
      ['top-black-2.jpg', 'top-black.jpg'],
    );
  });

  it('three runs produce 3 images per view → count = 3 in selected', () => {
    const root = makeTmpRoot();
    const pid = 'test-product-3';

    mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black.jpg')]);
    mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black-2.jpg')]);
    const after = mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black-3.jpg')]);

    const topImages = after.selected.images.filter(i => i.view === 'top' && i.variant_key === 'color:black');
    assert.equal(topImages.length, 3);
  });

  it('different variants independently accumulated', () => {
    const root = makeTmpRoot();
    const pid = 'test-variants';

    mergeRun(root, pid, [
      makeImage('top', 'color:black', 'top-black.jpg'),
      makeImage('top', 'color:white', 'top-white.jpg'),
    ]);
    const after = mergeRun(root, pid, [
      makeImage('top', 'color:black', 'top-black-2.jpg'),
    ]);

    const blackTops = after.selected.images.filter(i => i.view === 'top' && i.variant_key === 'color:black');
    const whiteTops = after.selected.images.filter(i => i.view === 'top' && i.variant_key === 'color:white');
    assert.equal(blackTops.length, 2, 'black gets both runs');
    assert.equal(whiteTops.length, 1, 'white preserved from first run');
  });

  it('rejected runs excluded from accumulation', () => {
    const root = makeTmpRoot();
    const pid = 'test-rejected';

    mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black.jpg')]);
    mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black-bad.jpg')], { runStatus: 'rejected' });

    const doc = readProductImages({ productId: pid, productRoot: root });
    const topImages = doc.selected.images.filter(i => i.view === 'top' && i.variant_key === 'color:black');
    assert.equal(topImages.length, 1, 'rejected run image not in selected');
    assert.equal(topImages[0].filename, 'top-black.jpg');
  });

  it('multiple views per run all accumulate', () => {
    const root = makeTmpRoot();
    const pid = 'test-multi-view';

    mergeRun(root, pid, [
      makeImage('top', 'color:black', 'top-black.jpg'),
      makeImage('left', 'color:black', 'left-black.jpg'),
    ]);
    const after = mergeRun(root, pid, [
      makeImage('top', 'color:black', 'top-black-2.jpg'),
      makeImage('angle', 'color:black', 'angle-black.jpg'),
    ]);

    const allBlack = after.selected.images.filter(i => i.variant_key === 'color:black');
    assert.equal(allBlack.length, 4, 'all 4 images across both runs survive');
  });

  it('recalculateFromRuns produces same result as sequential merges', () => {
    const root = makeTmpRoot();
    const pid = 'test-recalc';

    mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black.jpg')]);
    mergeRun(root, pid, [makeImage('top', 'color:black', 'top-black-2.jpg')]);

    const doc = readProductImages({ productId: pid, productRoot: root });
    const recalced = recalculateProductImagesFromRuns(doc.runs, pid, 'mouse');

    assert.equal(recalced.selected.images.length, 2);
  });
});
