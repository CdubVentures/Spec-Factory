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

// WHY: override the per-view quality gate for every canonical view + hero so tiny
// test fixtures (100×100) pass. Category defaults (e.g. mouse.top = 300×600) beat
// the flat minWidth/minHeight finalFallback, so we have to supply viewQualityConfig
// directly — see resolveViewQualityConfig in viewQualityDefaults.js.
const TEST_VIEW_QUALITY_CONFIG = JSON.stringify(
  Object.fromEntries(
    ['top', 'bottom', 'left', 'right', 'front', 'rear', 'angle', 'sangle', 'hero']
      .map((v) => [v, { minWidth: 50, minHeight: 50, minFileSize: 100 }]),
  ),
);

function makeFinderStoreStub(settingsOverrides = {}) {
  const settings = {
    satisfactionThreshold: '1',
    heroEnabled: 'true',
    heroCount: '1',
    viewAttemptBudget: '3',
    viewAttemptBudgets: '',
    heroAttemptBudget: '2',
    reRunBudget: '0',
    viewQualityConfig: TEST_VIEW_QUALITY_CONFIG,
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

function makeSpecDbStub(finderStore, variants = DEFAULT_VARIANTS) {
  return {
    getFinderStore: () => finderStore,
    getAllProducts: () => [],
    // WHY: variants.listActive is SSOT for variants at runtime (replaced CEF JSON reads).
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
  };
}

// Matches SIMPLE_CEF's single color variant. Tests with different variants can override.
const DEFAULT_VARIANTS = [
  { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'] },
];

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

let testServer;
let serverPort;

function createNoisyPixels(width, height, channels = 3) {
  const buf = Buffer.alloc(width * height * channels);
  for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 255) | 0;
  return buf;
}

before(async () => {
  fs.mkdirSync(PRODUCT_ROOT, { recursive: true });

  // WHY: Each request returns unique bytes so downloaded images produce distinct
  // content hashes. Production code dedupes by content hash to block the LLM from
  // returning the same image at different URLs — if the server returned identical
  // bytes every time, every download after the first would be rejected as a dupe
  // and the loop couldn't exercise satisfaction, side-catches, or re-run budget.
  // WHY: 100×100 (not 1000×800) cuts sharp encode time from ~300ms to ~5ms per
  // request. The finder's quality gate is lowered to match via makeFinderStoreStub.
  const IMG_DIM = 100;
  testServer = http.createServer(async (req, res) => {
    const uniqueBuf = await sharp(
      createNoisyPixels(IMG_DIM, IMG_DIM),
      { raw: { width: IMG_DIM, height: IMG_DIM, channels: 3 } },
    ).png().toBuffer();
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': uniqueBuf.length });
    res.end(uniqueBuf);
  });
  await new Promise((resolve) => testServer.listen(0, resolve));
  serverPort = testServer.address().port;
});

after(async () => {
  // WHY: close() alone only stops new connections — lingering keep-alives
  // keep the event loop busy and block the suite from exiting.
  testServer?.closeAllConnections?.();
  await new Promise((resolve) => (testServer ? testServer.close(resolve) : resolve()));
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitUntil(predicate, timeoutMs = 500) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

/* ── Tests ─────────────────────────────────────────────────────── */

describe('runCarouselLoop', () => {
  it('starts the hero lane before the ordered view lane finishes', async () => {
    const pid = 'loop-hero-parallel';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '100',
      heroEnabled: 'true',
      heroCount: '1',
      viewAttemptBudget: '1',
      viewAttemptBudgets: '{"top":1}',
      heroAttemptBudget: '1',
      viewBudget: '["top"]',
    });
    const specDb = makeSpecDbStub(finderStore);
    const blockedTop = createDeferred();
    const calls = [];

    const callLlm = async (args) => {
      const focus = args.priorityViews?.[0]?.key || 'hero';
      const mode = focus === 'hero' ? 'hero' : 'view';
      calls.push({ mode, focus });
      if (mode === 'view' && focus === 'top') {
        return blockedTop.promise;
      }
      return { result: {
        images: [{ view: 'hero', url: `http://localhost:${serverPort}/hero-parallel.png`, source_page: '', alt_text: '' }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      }, usage: null };
    };

    const runPromise = runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: callLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    const viewStarted = await waitUntil(() => calls.some((c) => c.mode === 'view' && c.focus === 'top'));
    assert.equal(viewStarted, true, 'top view should start first');
    const heroStartedBeforeTopResolved = await waitUntil(() => calls.some((c) => c.mode === 'hero'), 250);

    blockedTop.resolve({ result: {
      images: [{ view: 'top', url: `http://localhost:${serverPort}/top-parallel.png`, source_page: '', alt_text: '' }],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    }, usage: null });
    const result = await runPromise;

    assert.equal(heroStartedBeforeTopResolved, true, 'hero should run in parallel with the view lane');
    assert.equal(result.rejected, false);
    assert.deepEqual(calls.map((c) => `${c.mode}:${c.focus}`).sort(), ['hero:hero', 'view:top']);
  });

  it('loops until complete across ordered views and hero lane', async () => {
    const pid = 'loop-complete';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '1',
      heroCount: '1',
      viewAttemptBudget: '3',
      heroAttemptBudget: '2',
    });
    const specDb = makeSpecDbStub(finderStore);

    const calls = [];
    const callLlm = async (args) => {
      calls.push(args);
      const view = args.priorityViews?.[0]?.key || 'hero';
      return { result: {
        images: [{ view, url: `http://localhost:${serverPort}/${view}-${calls.length}.png`, source_page: '', alt_text: '' }],
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
    assert.ok(calls.some((args) => (args.priorityViews || []).length === 0), 'hero lane should issue a hero call');
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
      // Loop mode sends exactly one entry in priorityViews — the focus view.
      const priorityView = (args.priorityViews || [])[0]?.key || 'top';
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
    // WHY: empty variants simulates "no CEF data" — variants table is the SSOT
    const specDb = makeSpecDbStub(finderStore, []);

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

  it('aborts without persisting empty runs when the LLM provider circuit is open', async () => {
    const pid = 'loop-provider-circuit-open';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '3',
      heroEnabled: 'true',
      heroCount: '1',
      viewAttemptBudget: '2',
      viewAttemptBudgets: '{"top":2}',
      heroAttemptBudget: '2',
      viewBudget: '["top"]',
    });
    const specDb = makeSpecDbStub(finderStore);
    const providerError = "Provider 'lab-openai' circuit open (24 consecutive failures). Retry after cooldown.";

    await assert.rejects(
      runCarouselLoop({
        product: { ...PRODUCT, product_id: pid },
        specDb,
        config: {},
        productRoot: PRODUCT_ROOT,
        _callLlmOverride: async () => {
          throw new Error(providerError);
        },
        _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
      }),
      /PIF loop LLM unavailable/,
    );

    assert.equal(finderStore._runs.length, 0, 'provider outages must not persist normal zero-image runs');
    assert.equal(finderStore._upserts.length, 0, 'provider outages must not update selected image state');
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
      const priorityView = (args.priorityViews || [])[0]?.key || 'top';
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

  it('loop mode sends exactly one priority view and no additional views by default', async () => {
    const pid = 'loop-prompt-contract';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '1',
      heroEnabled: 'false',
      viewAttemptBudget: '1',
      viewBudget: '["top","left","angle"]',
    });
    const specDb = makeSpecDbStub(finderStore);

    const { callLlm, calls } = createMockLlm(['top']);

    await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb, config: {}, productRoot: PRODUCT_ROOT,
      _callLlmOverride: callLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    assert.ok(calls.length > 0, 'at least one loop call');
    for (const c of calls) {
      assert.equal(c.priorityViews.length, 1, 'loop mode always has exactly one priority view');
      assert.equal(c.additionalViews.length, 0, 'no additional views when loopRunSecondaryHints is empty');
    }
  });

  it('loop mode injects loopRunSecondaryHints into additionalViews (focus excluded)', async () => {
    const pid = 'loop-hints';
    writeCefData(pid, SIMPLE_CEF);
    const finderStore = makeFinderStoreStub({
      satisfactionThreshold: '1',
      heroEnabled: 'false',
      viewAttemptBudget: '1',
      viewBudget: '["top","left"]',
      loopRunSecondaryHints: '["rear","bottom"]',
    });
    const specDb = makeSpecDbStub(finderStore);

    const { callLlm, calls } = createMockLlm(['top']);

    await runCarouselLoop({
      product: { ...PRODUCT, product_id: pid },
      specDb, config: {}, productRoot: PRODUCT_ROOT,
      _callLlmOverride: callLlm,
      _modelDirOverride: path.join(TMP_ROOT, 'no-model'),
    });

    assert.ok(calls.length > 0);
    for (const c of calls) {
      const additionalKeys = c.additionalViews.map((v) => v.key).sort();
      const focusKey = c.priorityViews[0].key;
      // Hints should be present, minus the focus key itself.
      assert.deepEqual(additionalKeys, ['bottom', 'rear'].filter((k) => k !== focusKey).sort());
    }
  });
});
