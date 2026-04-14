/**
 * Golden-master characterization tests for Product Image Finder.
 *
 * WHY: Lock down existing behavior before RMBG 2.0 integration.
 * These tests capture the CURRENT contract of:
 *   - readImageDimensions (header-only dimension reader)
 *   - buildVariantList (CEF data → search variants)
 *   - runProductImageFinder (full orchestrator via _callLlmOverride + local HTTP server)
 *
 * Must stay green through all Phase 1-3 modifications.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import sharp from 'sharp';
import { SpecDb } from '../../../db/specDb.js';
import { readImageDimensions, buildVariantList, runProductImageFinder } from '../productImageFinder.js';

/* ── Helpers ──────────────────────────────────────────────────────── */

const TMP_ROOT = path.join(os.tmpdir(), `pif-char-test-${Date.now()}`);
const DB_DIR = path.join(TMP_ROOT, '_db');
const DB_PATH = path.join(DB_DIR, 'spec.sqlite');
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');
const IMAGES_DIR = path.join(TMP_ROOT, 'test-images');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

function writeCefData(productId, cefData) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'color_edition.json'), JSON.stringify(cefData));
}

function makeFinderStoreStub() {
  const settings = {};
  const runs = [];
  const upserts = [];
  return {
    getSetting: (key) => settings[key] || '',
    insertRun: (run) => runs.push(run),
    upsert: (data) => upserts.push(data),
    _settings: settings,
    _runs: runs,
    _upserts: upserts,
  };
}

function makeSpecDbStub(finderStore) {
  return {
    getFinderStore: () => finderStore,
    getAllProducts: () => [],
  };
}

const PRODUCT = {
  product_id: 'mouse-test-001',
  category: 'mouse',
  brand: 'TestBrand',
  model: 'TestModel X',
  base_model: 'TestModel',
};

/* ── Test image creation ─────────────────────────────────────────── */

let testPngBuffer;    // 1000x800, >50KB (passes default quality gate)
let testJpegBuffer;   // 1200x900, >50KB
let testSmallPngBuffer; // 100x50, <50KB (fails quality gate)
let testServer;
let serverPort;

// WHY: sharp compresses solid-color PNGs to <15KB, which fails the default
// 50KB minFileSize quality gate. Random noise doesn't compress well, producing
// realistic file sizes that pass the gate.
function createNoisyPixels(width, height, channels = 3) {
  const buf = Buffer.alloc(width * height * channels);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 255) | 0;
  return buf;
}

/* ── readImageDimensions ─────────────────────────────────────────── */

describe('characterization: readImageDimensions', () => {
  const imgDir = path.join(TMP_ROOT, 'dim-test');

  before(async () => {
    fs.mkdirSync(imgDir, { recursive: true });

    // Create test images with known dimensions using sharp
    // Noisy pixels → realistic file sizes that pass/fail quality gate
    testPngBuffer = await sharp(createNoisyPixels(1000, 800), { raw: { width: 1000, height: 800, channels: 3 } }).png().toBuffer();
    testJpegBuffer = await sharp(createNoisyPixels(1200, 900), { raw: { width: 1200, height: 900, channels: 3 } }).jpeg().toBuffer();
    testSmallPngBuffer = await sharp({ create: { width: 100, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();

    fs.writeFileSync(path.join(imgDir, 'test.png'), testPngBuffer);
    fs.writeFileSync(path.join(imgDir, 'test.jpg'), testJpegBuffer);
    fs.writeFileSync(path.join(imgDir, 'test-small.png'), testSmallPngBuffer);
  });

  after(() => cleanup(imgDir));

  it('reads PNG dimensions from header', () => {
    const dims = readImageDimensions(path.join(imgDir, 'test.png'));
    assert.deepEqual(dims, { width: 1000, height: 800 });
  });

  it('reads JPEG dimensions from SOF marker', () => {
    const dims = readImageDimensions(path.join(imgDir, 'test.jpg'));
    assert.deepEqual(dims, { width: 1200, height: 900 });
  });

  it('reads small PNG dimensions correctly', () => {
    const dims = readImageDimensions(path.join(imgDir, 'test-small.png'));
    assert.deepEqual(dims, { width: 100, height: 50 });
  });

  it('returns null for non-existent file', () => {
    const dims = readImageDimensions(path.join(imgDir, 'nope.png'));
    assert.equal(dims, null);
  });

  it('returns null for non-image file', () => {
    const txtPath = path.join(imgDir, 'not-image.txt');
    fs.writeFileSync(txtPath, 'hello world');
    const dims = readImageDimensions(txtPath);
    assert.equal(dims, null);
  });
});

/* ── buildVariantList ────────────────────────────────────────────── */

describe('characterization: buildVariantList', () => {
  it('builds color variants from atom names', () => {
    const result = buildVariantList({ colors: ['black', 'white'], colorNames: {}, editions: {} });
    assert.deepEqual(result, [
      { key: 'color:black', label: 'black', type: 'color' },
      { key: 'color:white', label: 'white', type: 'color' },
    ]);
  });

  it('uses marketing name when different from atom', () => {
    const result = buildVariantList({
      colors: ['glacier-blue'],
      colorNames: { 'glacier-blue': 'Glacier Blue' },
      editions: {},
    });
    assert.deepEqual(result, [
      { key: 'color:glacier-blue', label: 'Glacier Blue', type: 'color' },
    ]);
  });

  it('does NOT use marketing name when same as atom (case-insensitive)', () => {
    const result = buildVariantList({
      colors: ['black'],
      colorNames: { black: 'Black' },
      editions: {},
    });
    assert.deepEqual(result, [
      { key: 'color:black', label: 'black', type: 'color' },
    ]);
  });

  it('maps edition combo to edition variant', () => {
    const result = buildVariantList({
      colors: ['black+red'],
      colorNames: {},
      editions: { 'cod-bo6': { colors: ['black+red'], display_name: 'Call of Duty BO6 Edition' } },
    });
    assert.deepEqual(result, [
      { key: 'edition:cod-bo6', label: 'Call of Duty BO6 Edition', type: 'edition' },
    ]);
  });

  it('mixed colors and editions preserve CEF order', () => {
    const result = buildVariantList({
      colors: ['white', 'black+red', 'blue'],
      colorNames: { blue: 'Arctic Blue' },
      editions: { 'cod-bo6': { colors: ['black+red'], display_name: 'CoD BO6 Edition' } },
    });
    assert.equal(result.length, 3);
    assert.equal(result[0].key, 'color:white');
    assert.equal(result[1].key, 'edition:cod-bo6');
    assert.equal(result[2].key, 'color:blue');
    assert.equal(result[2].label, 'Arctic Blue');
  });

  it('returns empty for empty colors', () => {
    const result = buildVariantList({ colors: [], colorNames: {}, editions: {} });
    assert.deepEqual(result, []);
  });

  it('uses slug as edition label when display_name missing', () => {
    const result = buildVariantList({
      colors: ['red+gold'],
      colorNames: {},
      editions: { 'iron-man': { colors: ['red+gold'] } },
    });
    assert.equal(result[0].label, 'iron-man');
    assert.equal(result[0].type, 'edition');
  });
});

/* ── runProductImageFinder (full orchestrator) ───────────────────── */

describe('characterization: runProductImageFinder', () => {
  let specDb;
  let finderStore;

  before(async () => {
    // Create directories
    fs.mkdirSync(DB_DIR, { recursive: true });
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    fs.mkdirSync(IMAGES_DIR, { recursive: true });

    // Create test images for the HTTP server (noisy → >50KB for quality gate)
    testPngBuffer = testPngBuffer || await sharp(createNoisyPixels(1000, 800), { raw: { width: 1000, height: 800, channels: 3 } }).png().toBuffer();
    testSmallPngBuffer = testSmallPngBuffer || await sharp({ create: { width: 100, height: 50, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();

    // Start test HTTP server
    testServer = http.createServer((req, res) => {
      if (req.url === '/good-image.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': testPngBuffer.length });
        res.end(testPngBuffer);
      } else if (req.url === '/good-image.jpg') {
        const jpgBuf = testJpegBuffer || testPngBuffer;
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': jpgBuf.length });
        res.end(jpgBuf);
      } else if (req.url === '/small-image.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': testSmallPngBuffer.length });
        res.end(testSmallPngBuffer);
      } else if (req.url === '/not-found.png') {
        res.writeHead(404);
        res.end('Not Found');
      } else if (req.url === '/text-page.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html>not an image</html>');
      } else if (req.url === '/good-image-2.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': testPngBuffer.length });
        res.end(testPngBuffer);
      } else if (req.url === '/redirect-image.png') {
        res.writeHead(302, { Location: '/good-image.png' });
        res.end();
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

    // Create real specDb for integration
    specDb = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
  });

  after(() => {
    specDb?.close();
    testServer?.close();
    cleanup(TMP_ROOT);
  });

  it('rejects when no CEF data exists', async () => {
    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: 'no-cef-product' },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: { images: [] }, usage: null }),
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'no_cef_data');
  });

  it('rejects when CEF has empty colors array', async () => {
    writeCefData('empty-colors-product', { selected: { colors: [] } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: 'empty-colors-product' },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: { images: [] }, usage: null }),
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'no_colors');
  });

  it('rejects when unknown variantKey is requested', async () => {
    writeCefData('variant-filter-product', { selected: { colors: ['black'] } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: 'variant-filter-product' },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:nonexistent',
      _callLlmOverride: async () => ({ result: { images: [] }, usage: null }),
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'unknown_variant');
  });

  it('happy path: downloads images and builds correct entry shape', async () => {
    writeCefData(PRODUCT.product_id, {
      selected: { colors: ['black'], color_names: {}, editions: {} },
    });

    finderStore = makeFinderStoreStub();

    const result = await runProductImageFinder({
      product: PRODUCT,
      appDb: {},
      specDb: makeSpecDbStub(finderStore),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png`, source_page: 'https://example.com', alt_text: 'top view' },
        ],
        discovery_log: { urls_checked: ['https://example.com'], queries_run: ['test brand mouse'], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.rejected, false);
    assert.equal(result.images.length, 1);
    assert.equal(result.variants_processed, 1);

    // Verify image entry shape — EXACT current fields
    const img = result.images[0];
    assert.equal(img.view, 'top');
    assert.equal(img.filename, 'top-black.png');
    assert.equal(img.url, `http://127.0.0.1:${serverPort}/good-image.png`);
    assert.equal(img.source_page, 'https://example.com');
    assert.equal(img.alt_text, 'top view');
    assert.equal(typeof img.bytes, 'number');
    assert.ok(img.bytes > 0);
    assert.equal(img.width, 1000);
    assert.equal(img.height, 800);
    assert.equal(img.quality_pass, true);
    assert.equal(img.variant_key, 'color:black');
    assert.equal(img.variant_label, 'black');
    assert.equal(img.variant_type, 'color');
    assert.equal(typeof img.downloaded_at, 'string');

    // Verify the EXACT set of keys (no extra, no missing)
    // WHY: updated to include RMBG fields (original_filename, bg_removed, original_format)
    const expectedKeys = [
      'view', 'filename', 'url', 'source_page', 'alt_text',
      'bytes', 'width', 'height', 'quality_pass',
      'variant_id', 'variant_key', 'variant_label', 'variant_type', 'downloaded_at',
      'original_filename', 'bg_removed', 'original_format',
    ];
    assert.deepEqual(Object.keys(img).sort(), expectedKeys.sort());

    // Verify file exists on disk
    const filePath = path.join(PRODUCT_ROOT, PRODUCT.product_id, 'images', 'top-black.png');
    assert.ok(fs.existsSync(filePath), 'downloaded image file should exist on disk');
  });

  it('quality gate rejects below-dimension images', async () => {
    const pid = 'quality-gate-product';
    writeCefData(pid, { selected: { colors: ['white'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/small-image.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    // Image should be rejected (100x50 < 800x600 defaults)
    assert.equal(result.images.length, 0);
    assert.ok(result.download_errors.length > 0);
    assert.ok(result.download_errors[0].error.includes('quality rejected'));

    // File should NOT exist on disk (deleted by quality gate)
    const filePath = path.join(PRODUCT_ROOT, pid, 'images', 'top-white.png');
    assert.ok(!fs.existsSync(filePath), 'quality-rejected image should be deleted from disk');
  });

  it('handles download failure gracefully', async () => {
    const pid = 'download-fail-product';
    writeCefData(pid, { selected: { colors: ['red'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/not-found.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 0);
    assert.ok(result.download_errors.length > 0);
    assert.ok(result.download_errors[0].error.includes('404') || result.download_errors[0].error.includes('HTTP'));
  });

  it('rejects non-image content-type', async () => {
    const pid = 'non-image-product';
    writeCefData(pid, { selected: { colors: ['blue'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/text-page.html` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 0);
    assert.ok(result.download_errors.length > 0);
    assert.ok(result.download_errors[0].error.includes('not an image'));
  });

  it('skips non-canonical view names', async () => {
    const pid = 'bad-view-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'diagonal', url: `http://127.0.0.1:${serverPort}/good-image.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 0);
    assert.ok(result.download_errors.some(e => e.error.includes('non-canonical')));
  });

  it('dedup numbering: second image for same view gets -2 suffix', async () => {
    const pid = 'dedup-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png` },
          { view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.jpg` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 2);
    assert.equal(result.images[0].filename, 'top-black.png');
    assert.equal(result.images[1].filename, 'top-black-2.png');
  });

  it('dedup numbering after deletion gap: existing -2 file produces -3 suffix, not -2 collision', async () => {
    const pid = 'dedup-gap-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    // Pre-populate images/ with only -2 (simulating deletion of the original top-black.png)
    const imagesDir = path.join(PRODUCT_ROOT, pid, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });
    const survivorBuf = await sharp(createNoisyPixels(800, 600), { raw: { width: 800, height: 600, channels: 3 } })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(imagesDir, 'top-black-2.png'), survivorBuf);

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 1);
    // Must skip -2 (already exists) and use -3
    assert.equal(result.images[0].filename, 'top-black-3.png');
    // Survivor must still be on disk untouched
    assert.ok(fs.existsSync(path.join(imagesDir, 'top-black-2.png')));
  });

  it('persists run to SQL via finderStore.insertRun and upsert', async () => {
    const pid = 'persist-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'left', url: `http://127.0.0.1:${serverPort}/good-image.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    // Should have called insertRun
    assert.equal(store._runs.length, 1);
    const run = store._runs[0];
    assert.equal(run.category, 'mouse');
    assert.equal(run.product_id, pid);
    assert.equal(typeof run.run_number, 'number');
    assert.equal(typeof run.ran_at, 'string');
    assert.ok(run.selected);
    assert.ok(run.prompt);
    assert.ok(run.response);

    // Should have called upsert
    assert.equal(store._upserts.length, 1);
    const upsert = store._upserts[0];
    assert.equal(upsert.category, 'mouse');
    assert.equal(upsert.product_id, pid);
    assert.equal(upsert.image_count, 1);
    assert.ok(Array.isArray(upsert.images));
    assert.equal(upsert.images[0].view, 'left');
    assert.equal(upsert.images[0].filename, 'left-black.png');
    assert.equal(upsert.images[0].variant_key, 'color:black');
  });

  it('persists JSON to disk via mergeProductImageDiscovery', async () => {
    const pid = 'json-persist-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    // Verify JSON file written
    const jsonPath = path.join(PRODUCT_ROOT, pid, 'product_images.json');
    assert.ok(fs.existsSync(jsonPath), 'product_images.json should be written');

    const doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    assert.ok(doc.selected);
    assert.ok(Array.isArray(doc.selected.images));
    assert.ok(doc.selected.images.length >= 1);
    assert.ok(Array.isArray(doc.runs));
    assert.ok(doc.runs.length >= 1);
    assert.equal(typeof doc.cooldown_until, 'string');
    assert.equal(typeof doc.run_count, 'number');
  });

  it('handles LLM failure gracefully (no crash)', async () => {
    const pid = 'llm-fail-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => { throw new Error('LLM exploded'); },
    });

    // Should not throw — errors collected in download_errors
    assert.equal(result.rejected, false);
    assert.equal(result.images.length, 0);
    assert.ok(result.download_errors.length > 0);
    assert.ok(result.download_errors[0].error.includes('LLM exploded'));
  });

  it('follows HTTP redirects', async () => {
    const pid = 'redirect-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/redirect-image.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].view, 'top');
    assert.ok(result.images[0].bytes > 0);
  });

  it('multiple variants: each gets separate LLM call and images', async () => {
    const pid = 'multi-variant-product';
    writeCefData(pid, {
      selected: {
        colors: ['black', 'white'],
        color_names: {},
        editions: {},
      },
    });

    let callCount = 0;
    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async (args) => {
        callCount++;
        return { result: {
          images: [
            { view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png` },
          ],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        }, usage: null };
      },
    });

    // Both variants processed
    assert.equal(result.variants_processed, 2);
    assert.equal(result.images.length, 2);

    // Each variant has its own filename
    const filenames = result.images.map(i => i.filename).sort();
    assert.ok(filenames.includes('top-black.png'));
    assert.ok(filenames.includes('top-white.png'));

    // LLM called once per variant
    assert.equal(callCount, 2);

    // Both persisted to SQL
    assert.equal(store._runs.length, 2);
    assert.equal(store._upserts.length, 2);
  });

  it('single-variant run: variantKey filters to one variant', async () => {
    const pid = 'single-variant-product';
    writeCefData(pid, {
      selected: {
        colors: ['black', 'white', 'blue'],
        color_names: {},
        editions: {},
      },
    });

    let callCount = 0;
    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:white',
      _callLlmOverride: async () => {
        callCount++;
        return { result: {
          images: [{ view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png` }],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        }, usage: null };
      },
    });

    assert.equal(result.variants_processed, 1);
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].variant_key, 'color:white');
    assert.equal(callCount, 1);
  });

  it('return shape: non-rejected result has expected top-level fields', async () => {
    const pid = 'return-shape-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.ok('images' in result);
    assert.ok('download_errors' in result);
    assert.ok('variants_processed' in result);
    assert.ok('rejected' in result);
    assert.equal(result.rejected, false);
    assert.ok(Array.isArray(result.images));
    assert.ok(Array.isArray(result.download_errors));
    assert.equal(typeof result.variants_processed, 'number');
  });

  it('skips images with missing url or view', async () => {
    const pid = 'skip-invalid-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: '' },
          { view: '', url: `http://127.0.0.1:${serverPort}/good-image.png` },
          { url: `http://127.0.0.1:${serverPort}/good-image.png` },
          { view: 'top' },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    // All should be skipped (empty url or missing view)
    assert.equal(result.images.length, 0);
  });

  it('edition variant uses edition slug in filename', async () => {
    const pid = 'edition-filename-product';
    writeCefData(pid, {
      selected: {
        colors: ['black+red'],
        color_names: {},
        editions: { 'cod-bo6': { colors: ['black+red'], display_name: 'Call of Duty BO6 Edition' } },
      },
    });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [{ view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png` }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    assert.equal(result.images.length, 1);
    // Filename uses slugified edition label, not the combo atoms
    assert.equal(result.images[0].filename, 'top-call-of-duty-bo6-edition.png');
    assert.equal(result.images[0].variant_key, 'edition:cod-bo6');
    assert.equal(result.images[0].variant_type, 'edition');
  });

  it('URL dedup gate: rejects same URL returned twice in single LLM response', async () => {
    const pid = 'url-dedup-intra-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png` },
          { view: 'left', url: `http://127.0.0.1:${serverPort}/good-image.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    // First download succeeds, second rejected as duplicate URL
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].view, 'top');
    assert.ok(result.download_errors.some(e => e.error.includes('duplicate URL')));
  });

  it('URL dedup gate: rejects URL already downloaded in previous run', async () => {
    const pid = 'url-dedup-cross-product';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    // Pre-populate product_images.json with a previous run containing this URL
    const pifDir = path.join(PRODUCT_ROOT, pid);
    fs.mkdirSync(pifDir, { recursive: true });
    fs.writeFileSync(path.join(pifDir, 'product_images.json'), JSON.stringify({
      runs: [{
        run_number: 1,
        status: 'completed',
        selected: { images: [{
          view: 'top',
          filename: 'top-black.png',
          url: `http://127.0.0.1:${serverPort}/good-image.png`,
          variant_key: 'color:black',
          quality_pass: true,
        }] },
      }],
      selected: { images: [{
        view: 'top',
        filename: 'top-black.png',
        url: `http://127.0.0.1:${serverPort}/good-image.png`,
        variant_key: 'color:black',
        quality_pass: true,
      }] },
      run_count: 1,
      cooldown_until: new Date().toISOString(),
    }));

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: {
        images: [
          { view: 'top', url: `http://127.0.0.1:${serverPort}/good-image.png` },
          { view: 'left', url: `http://127.0.0.1:${serverPort}/good-image-2.png` },
        ],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null }),
    });

    // Same URL as previous run rejected, new URL succeeds
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].view, 'left');
    assert.ok(result.download_errors.some(e => e.error.includes('duplicate URL')));
  });
});
