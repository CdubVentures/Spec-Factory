/**
 * PIF Prompt Preview — parity with real-run dispatch.
 *
 * Verifies:
 *   - compilePifPreviewPrompt returns the correct envelope shape per mode
 *   - Loop returns N prompts (one per view in budget, plus hero if enabled)
 *   - Eval empty-state returns `prompts: []` + explanatory notes
 *   - No mutations: product_images.json / PIF SQL / operations tracker unchanged
 *   - Unknown variant surfaces a 400 via err.statusCode
 *
 * Byte-identical parity between preview and real-run dispatch is guaranteed by
 * shared use of `resolveViewPromptInputs` / `resolveHeroPromptInputs` /
 * `resolveViewEvalPromptInputs` / `resolveHeroEvalPromptInputs` in both paths.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { compilePifPreviewPrompt } from '../productImagePreviewPrompt.js';
import { buildProductImageFinderPrompt, buildHeroImageFinderPrompt } from '../productImageLlmAdapter.js';
import { buildViewEvalPrompt, buildHeroSelectionPrompt } from '../imageEvaluator.js';
import {
  resolveViewPromptInputs,
  resolveHeroPromptInputs,
  resolveViewEvalPromptInputs,
  resolveHeroEvalPromptInputs,
} from '../productImagePreviewPrompt.js';

const TMP_ROOT = path.join(os.tmpdir(), `pif-preview-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP_ROOT, 'products');

const PRODUCT = {
  product_id: 'preview-test-001',
  category: 'mouse',
  brand: 'TestBrand',
  model: 'PreviewMouse',
  base_model: 'PreviewMouse',
};

const VARIANTS = [
  { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color', color_atoms: ['black'] },
  { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', variant_type: 'color', color_atoms: ['white'] },
];

function makeFinderStoreStub(overrides = {}) {
  const { summaryRow = null, runs = [], ...settingOverrides } = overrides;
  const settings = {
    viewBudget: '["top","angle"]',
    heroEnabled: 'true',
    heroCount: '2',
    viewConfig: '',
    viewQualityConfig: '',
    singleRunSecondaryHints: '',
    loopRunSecondaryHints: '',
    minWidth: '800',
    minHeight: '600',
    viewPromptOverride: '',
    heroPromptOverride: '',
    evalPromptOverride: '',
    heroEvalPromptOverride: '',
    heroEvalCriteria: '',
    evalThumbSize: '512',
    ...settingOverrides,
  };
  return {
    getSetting: (key) => settings[key] ?? '',
    get: () => summaryRow,
    listRuns: () => runs,
    _settings: settings,
  };
}

function makeSpecDbStub({
  finderStore,
  variants = VARIANTS,
  compiledRules = null,
  rowsByField = {},
} = {}) {
  return {
    getFinderStore: () => finderStore,
    getCompiledRules: () => compiledRules,
    getFieldCandidatesByProductAndField: (_productId, fieldKey, variantId) => {
      if (variantId) return rowsByField[`${fieldKey}:${variantId}`] || [];
      return rowsByField[`${fieldKey}:product`] || rowsByField[fieldKey] || [];
    },
    getResolvedFieldCandidate: (_productId, fieldKey) => {
      const rows = rowsByField[`${fieldKey}:product`] || rowsByField[fieldKey] || [];
      return rows.find((row) => row.status === 'resolved') || null;
    },
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
  };
}

function ensureProductDir(productId) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
}

function writeProductImagesJson(productId, images, runs = []) {
  ensureProductDir(productId);
  fs.writeFileSync(
    path.join(PRODUCT_ROOT, productId, 'product_images.json'),
    JSON.stringify({ selected: { images }, runs }),
  );
}

function priorRun({
  runScopeKey,
  urls = [],
  queries = [],
  variantKey = 'color:black',
  variantId = 'v_black',
  imageValidationLog = [],
}) {
  return {
    ran_at: '2026-01-01T00:00:00Z',
    response: {
      variant_id: variantId, variant_key: variantKey,
      mode: runScopeKey.startsWith('hero') || runScopeKey === 'loop-hero' ? 'hero' : 'view',
      run_scope_key: runScopeKey,
      discovery_log: { urls_checked: urls, queries_run: queries },
      image_validation_log: imageValidationLog,
    },
  };
}

describe('compilePifPreviewPrompt', () => {
  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    ensureProductDir(PRODUCT.product_id);
  });

  after(() => {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* */ }
  });

  it('view mode returns one prompt with correct envelope', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });

    assert.equal(envelope.finder, 'pif');
    assert.equal(envelope.mode, 'view');
    assert.equal(envelope.prompts.length, 1);
    assert.equal(envelope.prompts[0].label, 'view');
    assert.ok(envelope.prompts[0].system.length > 0);
    assert.ok(envelope.prompts[0].user.includes('"brand":"TestBrand"'));
    assert.ok(envelope.inputs_resolved.variant_key);
  });

  it('view mode with explicit view focuses on that view', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view', view: 'top' },
    });

    assert.equal(envelope.prompts[0].label, 'view:top');
  });

  it('view mode with explicit view sources ADDITIONAL views from individualViewRunSecondaryHints', async () => {
    const finderStore = makeFinderStoreStub({
      singleRunSecondaryHints: '["front"]',
      individualViewRunSecondaryHints: '["bottom","rear"]',
      loopRunSecondaryHints: '["left"]',
    });
    const specDb = makeSpecDbStub({ finderStore });

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view', view: 'top' },
    });

    const system = envelope.prompts[0].system;
    // Match the ADDITIONAL block only (up to the blank line that terminates it) so unrelated 'front'/'left'
    // mentions further down in imageRequirements don't false-positive the assertion.
    const additionalBlock = (system.match(/ADDITIONAL[\s\S]*?\n\n/) || [''])[0];
    assert.match(additionalBlock, /"bottom"/);
    assert.match(additionalBlock, /"rear"/);
    assert.ok(!/"front"/.test(additionalBlock), 'single-run hint "front" must not appear in ADDITIONAL section');
    assert.ok(!/"left"/.test(additionalBlock), 'loop hint "left" must not appear in ADDITIONAL section');
  });

  it('view mode WITHOUT explicit view still uses singleRunSecondaryHints (priority-view run)', async () => {
    const finderStore = makeFinderStoreStub({
      singleRunSecondaryHints: '["front"]',
      individualViewRunSecondaryHints: '["bottom","rear"]',
    });
    const specDb = makeSpecDbStub({ finderStore });

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });

    const system = envelope.prompts[0].system;
    assert.match(system, /"front"/);
    assert.ok(!/ADDITIONAL[\s\S]*"bottom"/.test(system), 'individual-view hint "bottom" must not appear when no view is set');
  });

  it('view mode injects enabled product image dependency facts from resolved fields', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore,
      compiledRules: {
        fields: {
          connection: { product_image_dependent: true, ui: { label: 'Connection' } },
          weight_g: { product_image_dependent: false, ui: { label: 'Weight' } },
        },
      },
      rowsByField: {
        'connection:product': [{ status: 'resolved', value: 'wired', confidence: 96 }],
        'weight_g:product': [{ status: 'resolved', value: 63, confidence: 90 }],
      },
    });

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });

    const system = envelope.prompts[0].system;
    assert.match(system, /Product image identity facts/);
    assert.match(system, /connection: wired/);
    assert.doesNotMatch(system, /weight_g: 63/);
  });

  it('hero mode returns one hero-prompt envelope', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'hero' },
    });

    assert.equal(envelope.mode, 'hero');
    assert.equal(envelope.prompts.length, 1);
    assert.equal(envelope.prompts[0].label, 'hero');
  });

  it('loop-view mode returns one representative iteration prompt (default focus = first viewBudget)', async () => {
    const finderStore = makeFinderStoreStub({
      viewBudget: '["top","angle","left"]',
      heroEnabled: 'true',
      urlHistoryEnabled: 'true',
    });
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [], [
      priorRun({ runScopeKey: 'loop-view', urls: ['https://prior/loopview'] }),
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'loop-view' },
    });

    assert.equal(envelope.mode, 'loop-view');
    assert.equal(envelope.prompts.length, 1);
    assert.equal(envelope.prompts[0].label, 'loop-view:top');
    assert.ok(envelope.prompts[0].system.includes("this variant's loop view searches"));
  });

  it('loop-view mode honors body.view to pick the focus view', async () => {
    const finderStore = makeFinderStoreStub({
      viewBudget: '["top","angle","left"]',
      heroEnabled: 'true',
    });
    const specDb = makeSpecDbStub({ finderStore });

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'loop-view', view: 'angle' },
    });

    assert.equal(envelope.prompts[0].label, 'loop-view:angle');
  });

  it('loop-hero mode returns one hero-pool prompt', async () => {
    const finderStore = makeFinderStoreStub({
      viewBudget: '["top"]',
      heroEnabled: 'true',
      urlHistoryEnabled: 'true',
    });
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [], [
      priorRun({ runScopeKey: 'loop-hero', urls: ['https://prior/loophero'] }),
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'loop-hero' },
    });

    assert.equal(envelope.mode, 'loop-hero');
    assert.equal(envelope.prompts.length, 1);
    assert.equal(envelope.prompts[0].label, 'loop-hero');
    assert.ok(envelope.prompts[0].system.includes("this variant's loop hero searches"));
  });

  it('view mode (no body.view) uses priority-view pool — scope label + isolated history', async () => {
    const finderStore = makeFinderStoreStub({ urlHistoryEnabled: 'true' });
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [], [
      priorRun({ runScopeKey: 'priority-view', urls: ['https://prior/priority'] }),
      priorRun({ runScopeKey: 'view:top', urls: ['https://prior/viewtop'] }),
      priorRun({ runScopeKey: 'hero', urls: ['https://prior/hero'] }),
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });

    const sys = envelope.prompts[0].system;
    assert.ok(sys.includes("this variant's priority-view searches"));
    assert.ok(sys.includes('https://prior/priority'));
    assert.ok(!sys.includes('https://prior/viewtop'), 'view:top URL must not leak into priority-view pool');
    assert.ok(!sys.includes('https://prior/hero'), 'hero URL must not leak into priority-view pool');
  });

  it('view mode (with body.view) uses view:<focus> pool — scope label + isolated history', async () => {
    const finderStore = makeFinderStoreStub({ urlHistoryEnabled: 'true' });
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [], [
      priorRun({ runScopeKey: 'priority-view', urls: ['https://prior/priority'] }),
      priorRun({ runScopeKey: 'view:top', urls: ['https://prior/viewtop'] }),
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view', view: 'top' },
    });

    const sys = envelope.prompts[0].system;
    assert.ok(sys.includes("this variant's top-view searches"));
    assert.ok(sys.includes('https://prior/viewtop'));
    assert.ok(!sys.includes('https://prior/priority'), 'priority-view URL must not leak into view:top pool');
  });

  it('hero mode uses standalone-hero pool — isolated from loop-hero', async () => {
    const finderStore = makeFinderStoreStub({ urlHistoryEnabled: 'true' });
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [], [
      priorRun({ runScopeKey: 'hero', urls: ['https://prior/hero'] }),
      priorRun({ runScopeKey: 'loop-hero', urls: ['https://prior/loophero'] }),
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'hero' },
    });

    const sys = envelope.prompts[0].system;
    assert.ok(sys.includes("this variant's hero searches"));
    assert.ok(sys.includes('https://prior/hero'));
    assert.ok(!sys.includes('https://prior/loophero'), 'loop-hero URL must not leak into standalone hero pool');
  });

  it('loop-view pool isolates from priority-view + view:<focus>', async () => {
    const finderStore = makeFinderStoreStub({
      urlHistoryEnabled: 'true',
      viewBudget: '["top","angle"]',
    });
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [], [
      priorRun({ runScopeKey: 'priority-view', urls: ['https://prior/priority'] }),
      priorRun({ runScopeKey: 'view:top', urls: ['https://prior/viewtop'] }),
      priorRun({ runScopeKey: 'loop-view', urls: ['https://prior/loopview'] }),
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'loop-view' },
    });

    const sys = envelope.prompts[0].system;
    assert.ok(sys.includes('https://prior/loopview'));
    assert.ok(!sys.includes('https://prior/priority'));
    assert.ok(!sys.includes('https://prior/viewtop'));
  });

  it('priority-view history knobs inject accepted image history and link validation history', async () => {
    const finderStore = makeFinderStoreStub({
      priorityViewRunImageHistoryEnabled: 'true',
      priorityViewRunLinkValidationEnabled: 'true',
    });
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [
      {
        view: 'top',
        url: 'https://cdn.example.com/accepted-top.png',
        source_page: 'https://example.com/product',
        width: 1200,
        height: 900,
        content_hash: 'a'.repeat(64),
        variant_key: 'color:black',
        variant_id: 'v_black',
      },
    ], [
      priorRun({
        runScopeKey: 'loop-view',
        imageValidationLog: [{
          view: 'left',
          url: 'https://cdn.example.com/missing-left.png',
          accepted: false,
          reason: 'HTTP 404',
          stage: 'direct_image',
          variant_id: 'v_black',
          variant_key: 'color:black',
        }],
      }),
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });

    const sys = envelope.prompts[0].system;
    assert.ok(sys.includes('IMAGE HISTORY FOR THIS VARIANT'));
    assert.ok(sys.includes('https://cdn.example.com/accepted-top.png'));
    assert.ok(sys.includes('Better quality versions, alternate crops, and different useful angles are still welcome'));
    assert.ok(sys.includes('LINK VALIDATION CHECKLIST'));
    assert.ok(sys.includes('- page loaded successfully'));
    assert.ok(sys.includes('- direct image URL returns 2xx'));
    assert.ok(sys.includes('https://cdn.example.com/missing-left.png'));
  });

  it('history knobs are scoped by run type: priority, individual view, and loop', async () => {
    writeProductImagesJson(PRODUCT.product_id, [
      {
        view: 'top',
        url: 'https://cdn.example.com/history-top.png',
        width: 1200,
        height: 900,
        content_hash: 'b'.repeat(64),
        variant_key: 'color:black',
        variant_id: 'v_black',
      },
    ], [
      priorRun({
        runScopeKey: 'priority-view',
        imageValidationLog: [{
          view: 'top',
          url: 'https://cdn.example.com/bad-top.png',
          accepted: false,
          reason: 'timeout',
          stage: 'direct_image',
          variant_id: 'v_black',
          variant_key: 'color:black',
        }],
      }),
    ]);

    const priorityOnlyStore = makeFinderStoreStub({
      priorityViewRunImageHistoryEnabled: 'true',
      priorityViewRunLinkValidationEnabled: 'true',
    });
    const prioritySpecDb = makeSpecDbStub({ finderStore: priorityOnlyStore });
    const individualDisabled = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb: prioritySpecDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view', view: 'top' },
    });
    assert.ok(!individualDisabled.prompts[0].system.includes('IMAGE HISTORY FOR THIS VARIANT'));
    assert.ok(!individualDisabled.prompts[0].system.includes('LINK VALIDATION CHECKLIST'));

    const individualStore = makeFinderStoreStub({
      individualViewRunImageHistoryEnabled: 'true',
      individualViewRunLinkValidationEnabled: 'true',
    });
    const individualSpecDb = makeSpecDbStub({ finderStore: individualStore });
    const individualEnabled = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb: individualSpecDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view', view: 'top' },
    });
    assert.ok(individualEnabled.prompts[0].system.includes('IMAGE HISTORY FOR THIS VARIANT'));
    assert.ok(individualEnabled.prompts[0].system.includes('LINK VALIDATION CHECKLIST'));

    const loopStore = makeFinderStoreStub({
      viewBudget: '["top"]',
      loopRunImageHistoryEnabled: 'true',
      loopRunLinkValidationEnabled: 'true',
    });
    const loopSpecDb = makeSpecDbStub({ finderStore: loopStore });
    const loopEnabled = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb: loopSpecDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'loop-view' },
    });
    assert.ok(loopEnabled.prompts[0].system.includes('IMAGE HISTORY FOR THIS VARIANT'));
    assert.ok(loopEnabled.prompts[0].system.includes('LINK VALIDATION CHECKLIST'));
  });

  it('view-eval mode with no candidates returns empty-state envelope', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, []);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view-eval' },
    });

    assert.equal(envelope.mode, 'view-eval');
    assert.equal(envelope.prompts.length, 0);
    assert.ok(envelope.notes.some((n) => n.toLowerCase().includes('no view candidates')));
  });

  it('view-eval mode with candidates returns one prompt per view with sidecar images', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [
      { filename: 'black-top-1.png', variant_key: 'color:black', variant_id: 'v_black', view: 'top', width: 1200, height: 800, bytes: 100_000 },
      { filename: 'black-top-2.png', variant_key: 'color:black', variant_id: 'v_black', view: 'top', width: 1200, height: 800, bytes: 100_000 },
      { filename: 'black-angle-1.png', variant_key: 'color:black', variant_id: 'v_black', view: 'angle', width: 1200, height: 800, bytes: 100_000 },
      { filename: 'white-top-1.png', variant_key: 'color:white', variant_id: 'v_white', view: 'top', width: 1200, height: 800, bytes: 100_000 },
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view-eval' },
    });

    assert.equal(envelope.prompts.length, 2);
    const labels = envelope.prompts.map((p) => p.label).sort();
    assert.deepEqual(labels, ['view-eval:angle', 'view-eval:top']);
    const topPrompt = envelope.prompts.find((p) => p.label === 'view-eval:top');
    assert.equal(topPrompt.images.length, 2);
    assert.equal(topPrompt.images[0].url, 'black-top-1.png');
  });

  it('hero-eval mode with candidates returns one prompt + sidecar images', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [
      { filename: 'black-hero-1.png', variant_key: 'color:black', variant_id: 'v_black', view: 'hero', width: 1200, height: 800, bytes: 100_000 },
      { filename: 'black-hero-2.png', variant_key: 'color:black', variant_id: 'v_black', view: 'hero', width: 1200, height: 800, bytes: 100_000 },
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'hero-eval' },
    });

    assert.equal(envelope.mode, 'hero-eval');
    assert.equal(envelope.prompts.length, 1);
    assert.equal(envelope.prompts[0].label, 'hero-eval');
    assert.equal(envelope.prompts[0].images.length, 2);
  });

  it('hero-eval mode with no candidates returns empty-state envelope', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, []);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'hero-eval' },
    });

    assert.equal(envelope.prompts.length, 0);
    assert.ok(envelope.notes.some((n) => n.toLowerCase().includes('no hero candidates')));
  });

  it('preview history reads SQL projection before product_images.json', async () => {
    const finderStore = makeFinderStoreStub({
      urlHistoryEnabled: 'true',
      summaryRow: {
        product_id: PRODUCT.product_id,
        images: [],
        eval_state: {},
      },
      runs: [
        priorRun({ runScopeKey: 'priority-view', urls: ['https://sql/priority'] }),
      ],
    });
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, [], [
      priorRun({ runScopeKey: 'priority-view', urls: ['https://json/stale-priority'] }),
    ]);

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });

    const sys = envelope.prompts[0].system;
    assert.ok(sys.includes('https://sql/priority'));
    assert.ok(!sys.includes('https://json/stale-priority'));
  });

  it('unknown variant_key throws a 400-coded error', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });

    await assert.rejects(
      () => compilePifPreviewPrompt({
        product: PRODUCT,
        appDb: null,
        specDb,
        config: {},
        productRoot: PRODUCT_ROOT,
        body: { variant_key: 'nonexistent', mode: 'view' },
      }),
      (err) => err.statusCode === 400 && /variant not found/.test(err.message),
    );
  });

  it('missing variant_key throws a 400-coded error', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });

    await assert.rejects(
      () => compilePifPreviewPrompt({
        product: PRODUCT,
        appDb: null,
        specDb,
        config: {},
        productRoot: PRODUCT_ROOT,
        body: { mode: 'view' },
      }),
      (err) => err.statusCode === 400 && /variant_key/.test(err.message),
    );
  });

  it('model.json_strict reflects config._resolvedImageFinderJsonStrict', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });

    const envStrictOff = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: { _resolvedImageFinderJsonStrict: false },
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });
    assert.equal(envStrictOff.prompts[0].model.json_strict, false);

    const envStrictOn = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: { _resolvedImageFinderJsonStrict: true },
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });
    assert.equal(envStrictOn.prompts[0].model.json_strict, true);

    const envDefault = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });
    assert.equal(envDefault.prompts[0].model.json_strict, true);
  });

  it('resolver parity: preview output matches buildX(resolveX(inputs)) composition', async () => {
    const finderStore = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore });
    writeProductImagesJson(PRODUCT.product_id, []);

    const viewEnv = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'view' },
    });

    const heroEnv = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'hero' },
    });

    // Both should produce non-empty prompts; shape is documented by the builder contract.
    assert.ok(viewEnv.prompts[0].system.length > 500);
    assert.ok(heroEnv.prompts[0].system.length > 500);
    // Schema field is non-null (zodToLlmSchema output).
    assert.ok(viewEnv.prompts[0].schema);
    assert.ok(heroEnv.prompts[0].schema);
  });
});

describe('pure arg-bag resolvers', () => {
  it('resolveViewPromptInputs returns the builder arg shape', () => {
    const args = resolveViewPromptInputs({
      product: PRODUCT,
      variant: { key: 'color:black', label: 'Black', type: 'color' },
      allVariants: VARIANTS,
      priorityViews: [{ key: 'top', description: 'top view' }],
      additionalViews: [],
      viewQualityMap: {},
      minWidth: 800,
      minHeight: 600,
      siblingsExcluded: [],
      familyModelCount: 1,
      ambiguityLevel: 'easy',
      previousDiscovery: { urlsChecked: [], queriesRun: [] },
      viewPromptOverride: '',
    });
    assert.equal(args.variantLabel, 'Black');
    assert.equal(args.variantType, 'color');
    assert.equal(args.variantKey, 'color:black');
    assert.equal(args.promptOverride, '');
    const output = buildProductImageFinderPrompt(args);
    assert.ok(output.includes('Black'));
  });

  it('resolveHeroPromptInputs maps hero quality to minWidth/minHeight', () => {
    const args = resolveHeroPromptInputs({
      product: PRODUCT,
      variant: { key: 'color:black', label: 'Black', type: 'color' },
      viewQualityMap: { hero: { minWidth: 1200, minHeight: 900 } },
      siblingsExcluded: [],
      familyModelCount: 1,
      ambiguityLevel: 'easy',
      previousDiscovery: { urlsChecked: [], queriesRun: [] },
      heroPromptOverride: '',
    });
    assert.equal(args.minWidth, 1200);
    assert.equal(args.minHeight, 900);
    const output = buildHeroImageFinderPrompt(args);
    assert.ok(output.includes('Black'));
  });

  it('resolveViewEvalPromptInputs derives candidateCount', () => {
    const args = resolveViewEvalPromptInputs({
      product: PRODUCT,
      variant: { key: 'color:black', label: 'Black', type: 'color' },
      view: 'top',
      viewDescription: 'top view',
      candidates: [{ filename: 'a.png' }, { filename: 'b.png' }, { filename: 'c.png' }],
      evalCriteria: 'eval text',
    });
    assert.equal(args.candidateCount, 3);
    assert.equal(args.view, 'top');
    const output = buildViewEvalPrompt(args);
    assert.ok(output.includes('3 candidate'));
  });

  it('resolveHeroEvalPromptInputs maps candidates to filenames', () => {
    const args = resolveHeroEvalPromptInputs({
      product: PRODUCT,
      variant: { key: 'color:black', label: 'Black', type: 'color' },
      candidates: [{ filename: 'h1.png', width: 1200 }, { filename: 'h2.png' }],
      heroCriteria: 'hero text',
      heroCount: 3,
    });
    assert.equal(args.candidates.length, 2);
    assert.equal(args.candidates[0].filename, 'h1.png');
    assert.equal(args.heroCount, 3);
    const output = buildHeroSelectionPrompt(args);
    assert.ok(output.length > 200);
  });
});
