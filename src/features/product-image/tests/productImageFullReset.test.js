/**
 * productImageFullReset — PIF "Delete All" cascade tests.
 *
 * Verifies the full-reset helper that powers the PIF Delete All button:
 *   - deletes physical image files (master + originals/) on disk
 *   - wipes evaluations[] and carousel_slots in JSON
 *   - wipes the pif_variant_progress SQL projection rows
 *
 * Mirrors the equivalent semantics that scalar finders (RDF/SKU/KF) get
 * for free because their entire state lives in the runs[] array.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  fullResetProductImages,
} from '../productImageFullReset.js';
import { writeProductImages, readProductImages } from '../productImageStore.js';

let tmpRoot;
let imagesDir;

function makeProductJson({ productId = 'pid-1' } = {}) {
  return {
    product_id: productId,
    category: 'mouse',
    runs: [],
    selected: { images: [] },
    evaluations: [
      { eval_number: 1, ran_at: '2026-04-01T00:00:00Z', selections: { 'color:black': {} } },
    ],
    carousel_slots: {
      'color:black': { top: 'pid-1-top-1.png', left: null },
    },
    next_run_number: 2,
    cooldown_until: '2099-01-01',
  };
}

function writeFakeImage(productId, filename, body = 'fake') {
  const dir = path.join(tmpRoot, productId, 'images');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, filename);
  fs.writeFileSync(fp, body);
  return fp;
}

function writeFakeOriginal(productId, filename, body = 'orig') {
  const dir = path.join(tmpRoot, productId, 'images', 'originals');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, filename);
  fs.writeFileSync(fp, body);
  return fp;
}

function makeSpecDbStub() {
  const calls = { deleteByProduct: [], summaryUpdates: [] };
  return {
    deletePifVariantProgressByProduct: (pid) => { calls.deleteByProduct.push(pid); },
    getFinderStore: (moduleId) => {
      assert.equal(moduleId, 'productImageFinder');
      return {
        updateSummaryField: (...args) => { calls.summaryUpdates.push(args); },
      };
    },
    _calls: calls,
  };
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pif-fullreset-'));
  imagesDir = path.join(tmpRoot, 'pid-1', 'images');
});

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

describe('fullResetProductImages', () => {
  it('deletes every file in the product images directory (master + originals)', () => {
    writeProductImages({ productId: 'pid-1', productRoot: tmpRoot, data: makeProductJson() });
    writeFakeImage('pid-1', 'pid-1-top-1.png');
    writeFakeImage('pid-1', 'pid-1-left-1.png');
    writeFakeOriginal('pid-1', 'pid-1-top-1-orig.jpg');

    const specDb = makeSpecDbStub();
    fullResetProductImages({ specDb, productId: 'pid-1', productRoot: tmpRoot });

    assert.equal(fs.existsSync(path.join(imagesDir, 'pid-1-top-1.png')), false);
    assert.equal(fs.existsSync(path.join(imagesDir, 'pid-1-left-1.png')), false);
    assert.equal(fs.existsSync(path.join(imagesDir, 'originals', 'pid-1-top-1-orig.jpg')), false);
  });

  it('wipes evaluations[] and carousel_slots in JSON', () => {
    writeProductImages({ productId: 'pid-1', productRoot: tmpRoot, data: makeProductJson() });
    const specDb = makeSpecDbStub();
    fullResetProductImages({ specDb, productId: 'pid-1', productRoot: tmpRoot });
    const after = readProductImages({ productId: 'pid-1', productRoot: tmpRoot });
    assert.deepEqual(after?.evaluations ?? [], []);
    assert.deepEqual(after?.carousel_slots ?? {}, {});
  });

  it('wipes pif_variant_progress projection rows', () => {
    writeProductImages({ productId: 'pid-1', productRoot: tmpRoot, data: makeProductJson() });
    const specDb = makeSpecDbStub();
    fullResetProductImages({ specDb, productId: 'pid-1', productRoot: tmpRoot });
    assert.deepEqual(specDb._calls.deleteByProduct, ['pid-1']);
  });

  it('wipes SQL summary artifact columns read by the runtime UI', () => {
    writeProductImages({ productId: 'pid-1', productRoot: tmpRoot, data: makeProductJson() });
    const specDb = makeSpecDbStub();
    fullResetProductImages({ specDb, productId: 'pid-1', productRoot: tmpRoot });
    assert.deepEqual(specDb._calls.summaryUpdates, [
      ['pid-1', 'images', '[]'],
      ['pid-1', 'image_count', 0],
      ['pid-1', 'carousel_slots', '{}'],
      ['pid-1', 'eval_state', '{}'],
      ['pid-1', 'evaluations', '[]'],
    ]);
  });

  it('is a no-op when the product has no JSON / no images directory', () => {
    const specDb = makeSpecDbStub();
    assert.doesNotThrow(() => fullResetProductImages({
      specDb, productId: 'ghost', productRoot: tmpRoot,
    }));
  });

  it('survives missing specDb method (best-effort projection wipe)', () => {
    writeProductImages({ productId: 'pid-1', productRoot: tmpRoot, data: makeProductJson() });
    const specDbMissing = {}; // no deletePifVariantProgressByProduct method
    assert.doesNotThrow(() => fullResetProductImages({
      specDb: specDbMissing, productId: 'pid-1', productRoot: tmpRoot,
    }));
  });
});
