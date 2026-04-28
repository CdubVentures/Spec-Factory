/**
 * Deduplication contract tests for Product Image Finder.
 *
 * WHY: The download loop has two dedup layers:
 *   1. URL dedup — blocks re-downloading the exact same normalized URL
 *   2. Content hash — blocks byte-identical files served at different URLs
 *
 * These tests verify both layers independently and together.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import sharp from 'sharp';
import { runProductImageFinder } from '../productImageFinder.js';
import { writeProductImages } from '../productImageStore.js';

/* ── Helpers ──────────────────────────────────────────────────────── */

const TMP_ROOT = path.join(os.tmpdir(), `pif-dedup-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

function writeCefData(productId, cefData) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'color_edition.json'), JSON.stringify(cefData));
}

function makeFinderStoreStub(overrides = {}) {
  const settings = { ...overrides };
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

const DEFAULT_VARIANTS = [
  { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'] },
];

function makeSpecDbStub(finderStore, variants = DEFAULT_VARIANTS) {
  return {
    getFinderStore: () => finderStore,
    getAllProducts: () => [],
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
  };
}

const PRODUCT = {
  product_id: 'mouse-dedup-001',
  category: 'mouse',
  brand: 'TestBrand',
  model: 'DedupModel X',
  base_model: 'DedupModel',
};

// WHY: sharp compresses solid-color PNGs to <15KB, which fails the default
// 50KB minFileSize quality gate. Random noise doesn't compress well.
function createNoisyPixels(width, height, channels = 3) {
  const buf = Buffer.alloc(width * height * channels);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 255) | 0;
  return buf;
}

function makeLlmOverride(images) {
  return async () => ({
    result: {
      images,
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    },
    usage: null,
  });
}

/* ── Test image creation + HTTP server ────────────────────────────── */

let bufferA;   // 1000x800 noisy PNG (passes quality gate)
let bufferB;   // 1000x800 DIFFERENT noisy PNG (different hash)
let testServer;
let port;

/* ── Tests ────────────────────────────────────────────────────────── */

describe('dedup: URL dedup self-heal + content hash gate', () => {
  before(async () => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });

    bufferA = await sharp(createNoisyPixels(1000, 800), { raw: { width: 1000, height: 800, channels: 3 } }).png().toBuffer();
    bufferB = await sharp(createNoisyPixels(1000, 800), { raw: { width: 1000, height: 800, channels: 3 } }).png().toBuffer();

    testServer = http.createServer((req, res) => {
      if (req.url === '/img-a.png' || req.url === '/img-a-alias.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bufferA.length });
        res.end(bufferA);
      } else if (req.url === '/img-b.png') {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bufferB.length });
        res.end(bufferB);
      } else if (req.url === '/page-ok') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body>ok</body></html>');
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        port = testServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    // WHY: close() alone only stops new connections — lingering keep-alives
    // keep the event loop busy and block the suite from exiting.
    testServer?.closeAllConnections?.();
    await new Promise((resolve) => (testServer ? testServer.close(resolve) : resolve()));
    cleanup(TMP_ROOT);
  });

  it('URL dedup self-heals from disk: rejects previously downloaded URL', async () => {
    const pid = 'url-selfheal';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    // Pre-populate product_images.json with an existing image at the URL the LLM will suggest
    const existingUrl = `http://127.0.0.1:${port}/img-a.png`;
    writeProductImages({
      productId: pid,
      productRoot: PRODUCT_ROOT,
      data: {
        product_id: pid,
        category: 'mouse',
        selected: {
          images: [{
            view: 'top', filename: 'top-black.png', url: existingUrl,
            source_page: '', alt_text: '', bytes: 1000, width: 1000, height: 800,
            quality_pass: true, variant_key: 'color:black', variant_label: 'black',
            variant_type: 'color', downloaded_at: new Date().toISOString(),
            original_filename: 'top-black.png', bg_removed: false, original_format: 'png',
          }],
        },
        runs: [],
        run_count: 1,
        next_run_number: 2,
      },
    });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        { view: 'top', url: existingUrl },
      ]),
    });

    assert.equal(result.images.length, 0, 'should download 0 images (URL dedup)');
    assert.ok(result.download_errors.length > 0, 'should have download errors');
    assert.ok(
      result.download_errors[0].error.includes('duplicate URL'),
      `expected "duplicate URL" error, got: ${result.download_errors[0].error}`,
    );
  });

  it('content hash rejects byte-identical file at different URL', async () => {
    const pid = 'hash-dedup';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        { view: 'top', url: `http://127.0.0.1:${port}/img-a.png` },
        { view: 'top', url: `http://127.0.0.1:${port}/img-a-alias.png` },
      ]),
    });

    assert.equal(result.images.length, 1, 'only first image should survive');
    assert.ok(
      result.download_errors.some(e => e.error.includes('duplicate content')),
      `expected "duplicate content" error, got: ${JSON.stringify(result.download_errors)}`,
    );
  });

  it('content_hash field is stored on downloaded image entries', async () => {
    const pid = 'hash-stored';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        { view: 'top', url: `http://127.0.0.1:${port}/img-a.png` },
      ]),
    });

    assert.equal(result.images.length, 1);
    const img = result.images[0];
    assert.equal(typeof img.content_hash, 'string', 'content_hash should be a string');
    assert.equal(img.content_hash.length, 64, 'content_hash should be 64-char SHA-256 hex');
    assert.match(img.content_hash, /^[0-9a-f]{64}$/, 'content_hash should be lowercase hex');
  });

  it('persists per-candidate image validation history on the run response', async () => {
    const pid = 'validation-history';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        {
          view: 'top',
          url: `http://127.0.0.1:${port}/img-a.png`,
          source_page: 'https://example.com/product',
        },
        {
          view: 'top',
          url: `http://127.0.0.1:${port}/img-a-alias.png`,
          source_page: 'https://example.com/product',
        },
      ]),
    });

    assert.equal(result.images.length, 1);
    const runResponse = store._runs[0]?.response;
    assert.ok(Array.isArray(runResponse?.image_validation_log), 'run response should persist image_validation_log');
    assert.equal(runResponse.image_validation_log.length, 2);

    const accepted = runResponse.image_validation_log.find((entry) => entry.accepted === true);
    assert.equal(accepted.url, `http://127.0.0.1:${port}/img-a.png`);
    assert.equal(accepted.stage, 'accepted');
    assert.equal(accepted.direct_image.status_code, 200);
    assert.equal(accepted.direct_image.content_type, 'image/png');
    assert.equal(accepted.dimensions.ok, true);
    assert.equal(accepted.content_hash.ok, true);
    assert.equal(accepted.content_hash.value.length, 64);

    const duplicate = runResponse.image_validation_log.find((entry) => entry.accepted === false);
    assert.equal(duplicate.stage, 'content_hash');
    assert.equal(duplicate.reason, 'duplicate content');
    assert.ok(duplicate.content_hash.duplicate_of);
  });

  it('link validation rejects candidates whose source_page does not load', async () => {
    const pid = 'source-page-validation';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub({
      priorityViewRunLinkValidationEnabled: 'true',
    });
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        {
          view: 'top',
          url: `http://127.0.0.1:${port}/img-a.png`,
          source_page: `http://127.0.0.1:${port}/missing-page`,
        },
        {
          view: 'top',
          url: `http://127.0.0.1:${port}/img-b.png`,
          source_page: `http://127.0.0.1:${port}/page-ok`,
        },
      ]),
    });

    assert.equal(result.images.length, 1);
    assert.ok(result.download_errors.some((entry) => entry.error.includes('source page failed')));

    const validationLog = store._runs[0]?.response?.image_validation_log || [];
    const rejected = validationLog.find((entry) => entry.stage === 'source_page');
    assert.equal(rejected.page.ok, false);
    assert.equal(rejected.page.status_code, 404);

    const accepted = validationLog.find((entry) => entry.accepted === true);
    assert.equal(accepted.page.ok, true);
    assert.equal(accepted.page.status_code, 200);
  });

  it('different file content passes both dedup gates', async () => {
    const pid = 'hash-different';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        { view: 'top', url: `http://127.0.0.1:${port}/img-a.png` },
        { view: 'top', url: `http://127.0.0.1:${port}/img-b.png` },
      ]),
    });

    assert.equal(result.images.length, 2, 'both genuinely different images should download');
    assert.notEqual(
      result.images[0].content_hash,
      result.images[1].content_hash,
      'different images should have different content_hash values',
    );
  });

  it('old images without content_hash are skipped during hash set construction', async () => {
    const pid = 'hash-legacy';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    // Pre-populate with an image entry that has NO content_hash field
    // and serve the same bytes at a new URL — should download (no hash to match)
    writeProductImages({
      productId: pid,
      productRoot: PRODUCT_ROOT,
      data: {
        product_id: pid,
        category: 'mouse',
        selected: {
          images: [{
            view: 'top', filename: 'top-black.png', url: `http://127.0.0.1:${port}/img-a.png`,
            source_page: '', alt_text: '', bytes: 1000, width: 1000, height: 800,
            quality_pass: true, variant_key: 'color:black', variant_label: 'black',
            variant_type: 'color', downloaded_at: new Date().toISOString(),
            original_filename: 'top-black.png', bg_removed: false, original_format: 'png',
            // NOTE: no content_hash field — simulates pre-hash era image
          }],
        },
        runs: [],
        run_count: 1,
        next_run_number: 2,
      },
    });

    const store = makeFinderStoreStub();
    const result = await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        // Different URL serving same bytes — URL dedup won't catch it,
        // and hash set has nothing to compare against (old entry has no hash)
        { view: 'top', url: `http://127.0.0.1:${port}/img-a-alias.png` },
      ]),
    });

    assert.equal(result.images.length, 1, 'should download (no stored hash to match against)');
    assert.equal(typeof result.images[0].content_hash, 'string', 'new download should have content_hash');
    assert.equal(result.images[0].content_hash.length, 64, 'content_hash should be 64-char hex');
  });

  it('onVariantPersisted fires once per variant after the per-variant store.upsert', async () => {
    const pid = 'tick-multi-variant';
    writeCefData(pid, { selected: { colors: ['black', 'white'], color_names: {}, editions: {} } });

    const variants = [
      { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'] },
      { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', variant_type: 'color', color_atoms: ['white'] },
    ];
    const store = makeFinderStoreStub();
    const ticks = [];

    await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb: makeSpecDbStub(store, variants),
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        { view: 'top', url: `http://127.0.0.1:${port}/img-a.png` },
      ]),
      onVariantPersisted: (event) => ticks.push(event),
    });

    // One tick per variant, in iteration order, fired AFTER store.upsert.
    assert.equal(ticks.length, 2, `expected 2 ticks, got ${ticks.length}`);
    assert.deepEqual(ticks.map((t) => t.variantKey), ['color:black', 'color:white']);
    assert.deepEqual(ticks.map((t) => t.variantId), ['v_black', 'v_white']);
    // Tick must trail the SQL upsert — same count of upserts as ticks.
    assert.equal(store._upserts.length, 2, 'upsert count must match tick count');
  });

  it('persists each variant run, summary, and progress tick inside one SQL transaction', async () => {
    const pid = 'tick-transaction';
    writeCefData(pid, { selected: { colors: ['black'], color_names: {}, editions: {} } });

    const events = [];
    let transactionDepth = 0;
    const variants = [
      { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'] },
    ];
    const store = {
      getSetting: () => '',
      insertRun: (run) => events.push({ type: 'insertRun', depth: transactionDepth, run }),
      upsert: (row) => events.push({ type: 'upsert', depth: transactionDepth, row }),
    };
    const specDb = {
      ...makeSpecDbStub(store, variants),
      db: {
        transaction: (work) => (...args) => {
          events.push({ type: 'begin', depth: transactionDepth });
          transactionDepth += 1;
          try {
            return work(...args);
          } finally {
            transactionDepth -= 1;
            events.push({ type: 'commit', depth: transactionDepth });
          }
        },
      },
    };

    await runProductImageFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: {},
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: makeLlmOverride([
        { view: 'top', url: `http://127.0.0.1:${port}/img-a.png` },
      ]),
      onVariantPersisted: (event) => events.push({ type: 'persisted', depth: transactionDepth, event }),
    });

    assert.deepEqual(
      events.map((event) => `${event.type}:${event.depth}`),
      ['begin:0', 'insertRun:1', 'upsert:1', 'persisted:1', 'commit:0'],
    );
  });
});
