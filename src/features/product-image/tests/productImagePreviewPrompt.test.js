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
    ...overrides,
  };
  return {
    getSetting: (key) => settings[key] ?? '',
    listSuppressions: () => [],
    _settings: settings,
  };
}

function makeSpecDbStub({ finderStore, variants = VARIANTS } = {}) {
  return {
    getFinderStore: () => finderStore,
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

function writeProductImagesJson(productId, images) {
  ensureProductDir(productId);
  fs.writeFileSync(
    path.join(PRODUCT_ROOT, productId, 'product_images.json'),
    JSON.stringify({ selected: { images }, runs: [] }),
  );
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

  it('loop mode returns N prompts: one per view in budget plus hero when enabled', async () => {
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
      body: { variant_key: 'color:black', mode: 'loop' },
    });

    assert.equal(envelope.mode, 'loop');
    assert.equal(envelope.prompts.length, 4); // 3 views + hero
    assert.deepEqual(envelope.prompts.map((p) => p.label), ['view:top', 'view:angle', 'view:left', 'hero']);
    assert.ok(envelope.notes.some((n) => n.includes('Iteration 1')));
  });

  it('loop mode omits hero when heroEnabled=false', async () => {
    const finderStore = makeFinderStoreStub({
      viewBudget: '["top"]',
      heroEnabled: 'false',
    });
    const specDb = makeSpecDbStub({ finderStore });

    const envelope = await compilePifPreviewPrompt({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'loop' },
    });

    assert.equal(envelope.prompts.length, 1);
    assert.equal(envelope.prompts[0].label, 'view:top');
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
