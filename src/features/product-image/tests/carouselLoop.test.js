/**
 * Carousel Loop Orchestrator — contract tests.
 *
 * Verifies that `runCarouselLoop` correctly loops per variant:
 *   views (focused, one at a time) → heroes → done.
 *
 * Uses _callLlmOverride + local HTTP server for image downloads.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import sharp from 'sharp';
import { runCarouselLoop } from '../productImageFinder.js';

/* ── Helpers ──────────────────────────────────────────────────────── */

const TMP_ROOT = path.join(os.tmpdir(), `pif-loop-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

function writeCefData(productId, cefData) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'color_edition.json'), JSON.stringify(cefData));
}

function makeFinderStoreStub(settingsOverrides = {}) {
  const settings = {
    satisfactionThreshold: '1',
    heroEnabled: 'true',
    heroCount: '1',
    viewAttemptBudget: '3',
    viewAttemptBudgets: '',
    heroAttemptBudget: '2',
    reRunBudget: '0',
    ...settingsOverrides,
  };
  const runs = [];
  const upserts = [];
  return {
    getSetting: (key) => settings[key] || '',
    insertRun: (run) => runs.push(run),
    upsert: (data) => upserts.push(data),
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
  product_id: 'loop-test-001',
  category: 'mouse',
  brand: 'TestBrand',
  model: 'LoopMouse',
  base_model: 'LoopMouse',
};

const SIMPLE_CEF = {
  selected: {
    colors: ['black'],
    color_names: {},
    editions: {},
  },
  runs: [],
};

/* ── Test image server ─────────────────────────────────────────── */

let testPngBuffer;
let testServer;
let serverPort;

function createNoisyPixels(width, height, channels = 3) {
  const buf = Buffer.alloc(width * height * channels);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 255) | 0;
  return buf;
}

before(async () => {
  fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
  testPngBuffer = await sharp(createNoisyPixels(1000, 800), { raw: { width: 1000, height: 800, channels: 3 } }).png().toBuffer();

  testServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': testPngBuffer.length });
    res.end(testPngBuffer);
  });
  await new Promise((resolve) => testServer.listen(0, resolve));
  serverPort = testServer.address().port;
});

after(() => {
  testServer?.close();
  cleanup(TMP_ROOT);
});

/* ── LLM call counter factory ──────────────────────────────────── */

/**
 * Creates a mock LLM that returns images for specified views.
 * Tracks call count and args per call.
 */
function createMockLlm(viewsPerCall = ['top']) {
  const calls = [];
  const callLlm = async (domainArgs) => {
    calls.push(domainArgs);
    return { result: {
      images: viewsPerCall.map((view) => ({
        view,
        url: `http://localhost:${serverPort}/img-${calls.length}-${view}.png`,
        source_page: 'https://example.com',
        alt_text: `${view} image`,
      })),
      discovery_log: { urls_checked: [`http://localhost:${serverPort}`], queries_run: ['test query'], notes: [] },
    }, usage: null };
  };
  return { callLlm, calls };
}

/* ── Tests ─────────────────────────────────────────────────────── */

describe('runCarouselLoop', () => {
  it('loops until complete: views then heroes', async () => {
    const pid = 'loop-complete';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '1',
      heroCount: '1',
      viewAttemptBudget: '3',
      heroAttemptBudget: '2',
    });
    const specDb = makeSpecDbStub(finderStore);

    // Return one view per call, cycling through budget views + hero
    let callIdx = 0;
    const viewSequence = ['top', 'left', 'angle', 'sangle', 'front', 'bottom', 'hero'];
    const calls = [];
    const callLlm = async (args) => {
      calls.push(args);
      const view = viewSequence[callIdx % viewSequence.length];
      callIdx++;
      return { result: {
        images: [{ view, url: `http://localhost:${serverPort}/${view}-${callIdx}.png`, source_page: '', alt_text: '' }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null };
    };

    const result = await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: callLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    assert.equal(result.rejected, false);
    assert.ok(result.totalLlmCalls >= 7, `expected >= 7 calls, got ${result.totalLlmCalls}`);
    assert.ok(result.images.length >= 7, `expected >= 7 images, got ${result.images.length}`);
  });

  it('stops early when satisfaction hit before budget', async () => {
    const pid = 'loop-early-stop';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '1',
      heroEnabled: 'false',
      viewAttemptBudget: '5',
    });
    const specDb = makeSpecDbStub(finderStore);

    // Each call returns ALL budget views as side-catches → 1 call satisfies everything
    const { callLlm, calls } = createMockLlm(['top', 'left', 'angle', 'sangle', 'front', 'bottom']);

    const result = await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: callLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    assert.equal(result.rejected, false);
    assert.equal(calls.length, 1, 'single call should satisfy all views via side-catches');
    assert.equal(result.totalLlmCalls, 1);
  });

  it('budget exhaustion moves to next view', async () => {
    const pid = 'loop-exhaust';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '3',
      heroEnabled: 'false',
      viewAttemptBudget: '2',
      // Explicit per-view budgets: all views at 2 (overrides category defaults)
      viewAttemptBudgets: '{"top":2,"left":2,"angle":2,"sangle":2,"front":2,"bottom":2}',
    });
    const specDb = makeSpecDbStub(finderStore);

    // Return only the focus view each time (no side catches), but only 1 image per call
    const calls = [];
    const callLlm = async (args) => {
      calls.push(args);
      // Find which view is priority in the viewConfig
      const priorityView = (args.viewConfig || []).find(v => v.priority)?.key || 'top';
      return { result: {
        images: [{ view: priorityView, url: `http://localhost:${serverPort}/${priorityView}-${calls.length}.png`, source_page: '', alt_text: '' }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null };
    };

    const result = await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: callLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    // With 6 budget views × 2 attempts each = 12 max calls, then exhaustion → complete
    assert.equal(result.rejected, false);
    assert.ok(result.totalLlmCalls <= 12, `expected <= 12 calls, got ${result.totalLlmCalls}`);
  });

  it('progress callback fires with correct callNumber', async () => {
    const pid = 'loop-progress';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '1',
      heroEnabled: 'false',
      viewAttemptBudget: '3',
    });
    const specDb = makeSpecDbStub(finderStore);

    const { callLlm } = createMockLlm(['top', 'left', 'angle', 'sangle', 'front', 'bottom']);

    const progressEvents = [];
    const result = await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: callLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
      onLoopProgress: (p) => progressEvents.push(p),
    });

    assert.ok(progressEvents.length > 0, 'should have progress events');
    // First event is the initial pre-call emission (callNumber 0)
    assert.equal(progressEvents[0].callNumber, 0);
    assert.equal(progressEvents[0].variant, 'color:black');
    assert.ok(typeof progressEvents[0].estimatedRemaining === 'number');
    // Second event is after the first LLM call completes
    if (progressEvents.length > 1) {
      assert.equal(progressEvents[1].callNumber, 1);
    }
  });

  it('rejects when no CEF data', async () => {
    const pid = 'loop-no-cef';
    // Don't write CEF data
    fs.mkdirSync(path.join(PRODUCT_ROOT, pid), { recursive: true });
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub(finderStore);

    const result = await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({ result: { images: [] }, usage: null }),
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    assert.equal(result.rejected, true);
    assert.equal(result.totalLlmCalls, 0);
  });

  it('re-run budget: satisfied views get reRunBudget calls, not viewAttemptBudget', async () => {
    const pid = 'loop-rerun';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '1',
      heroEnabled: 'true',
      heroCount: '1',
      viewAttemptBudget: '3',
      heroAttemptBudget: '2',
      reRunBudget: '1',
    });
    const specDb = makeSpecDbStub(finderStore);

    // First loop: fill everything (satisfaction=1, side-catches)
    const { callLlm: fillLlm } = createMockLlm(['top', 'left', 'angle', 'sangle', 'front', 'bottom', 'hero']);
    await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb, config: {}, productRoot: PRODUCT_ROOT,
      _callLlmOverride: fillLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    // Second loop: all views satisfied → each gets reRunBudget=1 call
    const rerunCalls = [];
    const rerunLlm = async (args) => {
      rerunCalls.push(args);
      return { result: {
        images: [{ view: 'top', url: `http://localhost:${serverPort}/rerun-${rerunCalls.length}.png`, source_page: '', alt_text: '' }],
        discovery_log: { urls_checked: [`http://rerun-${rerunCalls.length}`], queries_run: [], notes: [] },
      }, usage: null };
    };

    const result = await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb, config: {}, productRoot: PRODUCT_ROOT,
      _callLlmOverride: rerunLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    // 6 views × 1 re-run + 1 hero × 1 re-run = 7 calls
    assert.equal(result.rejected, false);
    assert.equal(rerunCalls.length, 7, `expected 7 re-run calls (6 views + 1 hero), got ${rerunCalls.length}`);
    assert.equal(result.totalLlmCalls, 7);
  });

  it('per-view attempt budgets: different views get different call counts', async () => {
    const pid = 'loop-perview';
    writeCefData(pid, {
      selected: { colors: ['black'], color_names: {}, editions: {} },
      runs: [],
    });
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '100',  // unreachable — forces exhaustion via budget
      heroEnabled: 'false',
      viewAttemptBudget: '10',
      viewAttemptBudgets: '{"top":3,"left":2}',
      viewBudget: '["top","left"]',
    });
    const specDb = makeSpecDbStub(finderStore);

    // Return only the focus view each call (no side catches)
    const calls = [];
    const callLlm = async (args) => {
      calls.push(args);
      const priorityView = (args.viewConfig || []).find(v => v.priority)?.key || 'top';
      return { result: {
        images: [{ view: priorityView, url: `http://localhost:${serverPort}/${priorityView}-${calls.length}.png`, source_page: '', alt_text: '' }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null };
    };

    const result = await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb, config: {}, productRoot: PRODUCT_ROOT,
      _callLlmOverride: callLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    assert.equal(result.rejected, false);
    // top: 3 calls, left: 2 calls = 5 total (not 10+10=20 from flat budget)
    assert.equal(result.totalLlmCalls, 5, `expected 5 calls (top:3 + left:2), got ${result.totalLlmCalls}`);
  });
});
