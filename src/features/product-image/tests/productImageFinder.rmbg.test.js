/**
 * Phase 3: RMBG integration tests for productImageFinder.
 *
 * Verifies that after RMBG wiring:
 *   - Image entries include original_filename, bg_removed, original_format
 *   - Raw downloads are moved to originals/ subdirectory
 *   - Master files are .png
 *   - Graceful degradation when processImage fails
 *   - Quality gate rejects still work (no processing attempted)
 *   - Characterization tests (Phase 0) remain green
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import sharp from 'sharp';
import { runProductImageFinder } from '../productImageFinder.js';

const TMP = path.join(os.tmpdir(), `pif-rmbg-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

function noisyPixels(w, h, ch = 3) {
  const buf = Buffer.alloc(w * h * ch);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 255) | 0;
  return buf;
}

function writeCefData(productId, cefData) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'color_edition.json'), JSON.stringify(cefData));
}

function makeFinderStoreStub() {
  return {
    getSetting: () => '',
    insertRun: () => {},
    upsert: () => {},
  };
}

function makeSpecDbStub(store) {
  return { getFinderStore: () => store, getAllProducts: () => [] };
}

const PRODUCT = {
  product_id: 'rmbg-test-001',
  category: 'mouse',
  brand: 'TestBrand',
  model: 'TestModel X',
  base_model: 'TestModel',
};

let testPngBuffer;
let testJpegBuffer;
let testSmallPngBuffer;
let testServer;
let serverPort;

describe('runProductImageFinder with RMBG', () => {
  before(async () => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });

    testPngBuffer = await sharp(noisyPixels(1000, 800), { raw: { width: 1000, height: 800, channels: 3 } }).png().toBuffer();
    testJpegBuffer = await sharp(noisyPixels(1000, 800), { raw: { width: 1000, height: 800, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    testSmallPngBuffer = await sharp({ create: { width: 100, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();

    testServer = http.createServer((req, res) => {
      if (req.url === '/image.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': testPngBuffer.length });
        res.end(testPngBuffer);
      } else if (req.url === '/image.jpg') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': testJpegBuffer.length });
        res.end(testJpegBuffer);
      } else if (req.url === '/small.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': testSmallPngBuffer.length });
        res.end(testSmallPngBuffer);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        serverPort = testServer.address().port;
        resolve();
      });
    });
  });

  after(() => {
    testServer?.close();
    cleanup(TMP);
  });

  it('happy path: image processed, entry has new RMBG fields', async () => {
    const pid = 'rmbg-happy';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(makeFinderStoreStub()),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [{ view: 'top', url: `http://127.0.0.1:${serverPort}/image.png` }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 1);
    const img = result.images[0];

    // New RMBG fields must be present
    assert.equal(typeof img.original_filename, 'string');
    assert.ok(img.original_filename.length > 0, 'original_filename should be non-empty');
    assert.equal(typeof img.bg_removed, 'boolean');
    assert.equal(typeof img.original_format, 'string');
    assert.ok(img.original_format.length > 0, 'original_format should be non-empty');

    // Master filename is always .png
    assert.ok(img.filename.endsWith('.png'), `master filename should end with .png, got ${img.filename}`);

    // Original exists in originals/ subdirectory
    const originalsDir = path.join(PRODUCT_ROOT, pid, 'images', 'originals');
    assert.ok(fs.existsSync(originalsDir), 'originals/ directory should exist');
    assert.ok(fs.existsSync(path.join(originalsDir, img.original_filename)),
      `original file ${img.original_filename} should exist in originals/`);

    // Master exists in images/
    assert.ok(fs.existsSync(path.join(PRODUCT_ROOT, pid, 'images', img.filename)),
      `master file ${img.filename} should exist in images/`);
  });

  it('JPEG input: original_format is jpg, master is .png', async () => {
    const pid = 'rmbg-jpeg';
    writeCefData(pid, { selected: { colors: ['white'], color_names: {}, editions: {} } });

    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(makeFinderStoreStub()),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [{ view: 'left', url: `http://127.0.0.1:${serverPort}/image.jpg` }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 1);
    const img = result.images[0];
    assert.ok(img.filename.endsWith('.png'), 'master should be .png');
    assert.equal(img.original_format, 'jpg');
    assert.ok(img.original_filename.endsWith('.jpg'), 'original should keep .jpg extension');
  });

  it('quality gate rejects: no processing attempted, no originals/', async () => {
    const pid = 'rmbg-quality-reject';
    writeCefData(pid, { selected: { colors: ['red'], color_names: {}, editions: {} } });

    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(makeFinderStoreStub()),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [{ view: 'top', url: `http://127.0.0.1:${serverPort}/small.png` }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    // Quality gate rejects (100x50 < 800x600)
    assert.equal(result.images.length, 0);
    assert.ok(result.download_errors.length > 0);

    // No originals/ directory should be created
    const originalsDir = path.join(PRODUCT_ROOT, pid, 'images', 'originals');
    assert.ok(!fs.existsSync(originalsDir), 'originals/ should not exist for rejected images');
  });

  it('processImage unavailable: graceful degradation, bg_removed=false', async () => {
    const pid = 'rmbg-no-model';
    writeCefData(pid, { selected: { colors: ['blue'], color_names: {}, editions: {} } });

    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(makeFinderStoreStub()),
      config: {},
      productRoot: PRODUCT_ROOT,
      // WHY: _modelDirOverride points to empty dir (no model), triggering degradation
      _modelDirOverride: path.join(TMP, 'no-model-here'),
      _callLlmOverride: async () => ({ result: {
        images: [{ view: 'top', url: `http://127.0.0.1:${serverPort}/image.png` }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 1);
    const img = result.images[0];
    assert.equal(img.bg_removed, false);
    assert.ok(img.original_filename, 'original_filename should still be set');
    assert.ok(img.filename.endsWith('.png'), 'master should still be .png');
    // Master file should exist (raw converted to PNG)
    assert.ok(fs.existsSync(path.join(PRODUCT_ROOT, pid, 'images', img.filename)));
  });

  it('all 3 new fields present alongside existing fields', async () => {
    const pid = 'rmbg-field-check';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(makeFinderStoreStub()),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [{ view: 'top', url: `http://127.0.0.1:${serverPort}/image.png` }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    const img = result.images[0];

    // Original fields still present
    assert.equal(typeof img.view, 'string');
    assert.equal(typeof img.filename, 'string');
    assert.equal(typeof img.url, 'string');
    assert.equal(typeof img.bytes, 'number');
    assert.equal(typeof img.width, 'number');
    assert.equal(typeof img.height, 'number');
    assert.equal(img.quality_pass, true);
    assert.equal(typeof img.variant_key, 'string');
    assert.equal(typeof img.downloaded_at, 'string');

    // New fields present
    assert.equal(typeof img.original_filename, 'string');
    assert.equal(typeof img.bg_removed, 'boolean');
    assert.equal(typeof img.original_format, 'string');
  });
});
