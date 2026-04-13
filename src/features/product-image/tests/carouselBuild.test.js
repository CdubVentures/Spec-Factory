/**
 * Carousel Builder orchestrator contract tests.
 *
 * Tests the top-level runCarouselBuild function which:
 * - Reads CEF data to discover variants
 * - Groups existing images by variant + view
 * - Evaluates each view group via evaluateViewCandidates
 * - Picks hero shots from winners
 * - Persists via mergeEvaluation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runCarouselBuild } from '../carouselBuild.js';

/* ── Factories ──────────────────────────────────────────────────── */

function makeProduct(overrides = {}) {
  return {
    product_id: 'p1',
    category: 'mouse',
    brand: 'Razer',
    model: 'DeathAdder V3',
    base_model: 'DeathAdder V3',
    variant: '',
    ...overrides,
  };
}

function makeImage(overrides = {}) {
  return {
    view: 'top',
    filename: 'top-black.png',
    url: 'https://example.com/top.png',
    variant_key: 'color:black',
    variant_label: 'Black',
    variant_type: 'color',
    quality_pass: true,
    ...overrides,
  };
}

function makeSpecDb({ settings = {}, cefData = null } = {}) {
  return {
    getFinderStore: () => ({
      getSetting: (key) => settings[key] ?? '',
    }),
    getProduct: () => ({ brand: 'Razer', model: 'DeathAdder V3', base_model: 'DeathAdder V3' }),
  };
}

function makeCefData({ colors = ['black'], colorNames = {}, editions = {} } = {}) {
  return {
    selected: { colors, color_names: colorNames, editions },
    runs: [],
  };
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function makeEvalViewFn(rankings = []) {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    // Return provided rankings filtered to filenames in this call
    const basenames = (opts.imagePaths || []).map(p => p.split('/').pop());
    const relevant = rankings.filter(r => basenames.includes(r.filename));
    if (relevant.length > 0) return { rankings: relevant };
    // Auto-elect single candidate
    if (basenames.length === 1) return { rankings: [{ filename: basenames[0], rank: 1, best: true, flags: [], reasoning: 'auto' }] };
    return { rankings: basenames.map((f, i) => ({ filename: f, rank: i + 1, best: i === 0, flags: [], reasoning: 'ok' })) };
  };
  fn.calls = calls;
  return fn;
}

function makeMergeFn() {
  const calls = [];
  const fn = (opts) => {
    calls.push(opts);
    return { selected: { images: [] } };
  };
  fn.calls = calls;
  return fn;
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe('runCarouselBuild', () => {
  const baseOpts = () => ({
    product: makeProduct(),
    specDb: makeSpecDb({ settings: { evalEnabled: 'true', evalThumbSize: '512', evalPromptOverride: '', heroEvalPromptOverride: '', evalHeroCount: '3' } }),
    config: {},
    logger: null,
    productRoot: '/fake/root',
  });

  it('evaluates all views for a single variant', async () => {
    const evalFn = makeEvalViewFn();
    const mergeFn = makeMergeFn();
    const result = await runCarouselBuild({
      ...baseOpts(),
      _readCefFn: () => makeCefData({ colors: ['black'] }),
      _readImagesFn: () => ({
        selected: {
          images: [
            makeImage({ view: 'top', filename: 'top-black.png' }),
            makeImage({ view: 'top', filename: 'top-black-2.png' }),
            makeImage({ view: 'left', filename: 'left-black.png' }),
          ],
        },
      }),
      _evalViewFn: evalFn,
      _mergeFn: mergeFn,
      _heroCallFn: async () => ({ heroes: [] }),
    });
    // Should have called evalView for 'top' (2 images) and 'left' (1 image)
    assert.equal(evalFn.calls.length, 2);
    const views = evalFn.calls.map(c => c.view).sort();
    assert.deepStrictEqual(views, ['left', 'top']);
    assert.equal(mergeFn.calls.length, 1);
    assert.equal(result.variantsProcessed, 1);
  });

  it('groups images by view correctly', async () => {
    const evalFn = makeEvalViewFn();
    await runCarouselBuild({
      ...baseOpts(),
      _readCefFn: () => makeCefData({ colors: ['black'] }),
      _readImagesFn: () => ({
        selected: {
          images: [
            makeImage({ view: 'top', filename: 'top-black.png' }),
            makeImage({ view: 'top', filename: 'top-black-2.png' }),
            makeImage({ view: 'top', filename: 'top-black-3.png' }),
            makeImage({ view: 'left', filename: 'left-black.png' }),
          ],
        },
      }),
      _evalViewFn: evalFn,
      _mergeFn: makeMergeFn(),
      _heroCallFn: async () => ({ heroes: [] }),
    });
    const topCall = evalFn.calls.find(c => c.view === 'top');
    const leftCall = evalFn.calls.find(c => c.view === 'left');
    assert.equal(topCall.imagePaths.length, 3);
    assert.equal(leftCall.imagePaths.length, 1);
  });

  it('skips variants with no images', async () => {
    const evalFn = makeEvalViewFn();
    const mergeFn = makeMergeFn();
    const result = await runCarouselBuild({
      ...baseOpts(),
      _readCefFn: () => makeCefData({ colors: ['black', 'white'] }),
      _readImagesFn: () => ({
        selected: {
          images: [
            makeImage({ view: 'top', filename: 'top-black.png', variant_key: 'color:black' }),
          ],
        },
      }),
      _evalViewFn: evalFn,
      _mergeFn: mergeFn,
      _heroCallFn: async () => ({ heroes: [] }),
    });
    // Only black has images, white is skipped
    assert.equal(mergeFn.calls.length, 1);
    assert.equal(mergeFn.calls[0].variantKey, 'color:black');
  });

  it('collects winners and runs hero selection', async () => {
    let heroCalled = false;
    let heroArgs = null;
    await runCarouselBuild({
      ...baseOpts(),
      _readCefFn: () => makeCefData({ colors: ['black'] }),
      _readImagesFn: () => ({
        selected: {
          images: [
            makeImage({ view: 'top', filename: 'top-black.png' }),
            makeImage({ view: 'top', filename: 'top-black-2.png' }),
            makeImage({ view: 'left', filename: 'left-black.png' }),
          ],
        },
      }),
      _evalViewFn: makeEvalViewFn(),
      _mergeFn: makeMergeFn(),
      _heroCallFn: async (args) => {
        heroCalled = true;
        heroArgs = args;
        return { heroes: [{ filename: 'top-black.png', hero_rank: 1, reasoning: 'best' }] };
      },
    });
    assert.equal(heroCalled, true);
    // Hero call should receive the winners from view evals
    assert.ok(heroArgs);
  });

  it('calls onStageAdvance with expected stages', async () => {
    const stages = [];
    await runCarouselBuild({
      ...baseOpts(),
      onStageAdvance: (name) => stages.push(name),
      _readCefFn: () => makeCefData({ colors: ['black'] }),
      _readImagesFn: () => ({
        selected: { images: [makeImage()] },
      }),
      _evalViewFn: makeEvalViewFn(),
      _mergeFn: makeMergeFn(),
      _heroCallFn: async () => ({ heroes: [] }),
    });
    assert.ok(stages.includes('Evaluating'));
    assert.ok(stages.includes('Complete'));
  });

  it('calls onVariantProgress with index and total', async () => {
    const progress = [];
    await runCarouselBuild({
      ...baseOpts(),
      onVariantProgress: (idx, total, key) => progress.push({ idx, total, key }),
      _readCefFn: () => makeCefData({ colors: ['black', 'white'] }),
      _readImagesFn: () => ({
        selected: {
          images: [
            makeImage({ variant_key: 'color:black', filename: 'top-black.png' }),
            makeImage({ variant_key: 'color:white', filename: 'top-white.png' }),
          ],
        },
      }),
      _evalViewFn: makeEvalViewFn(),
      _mergeFn: makeMergeFn(),
      _heroCallFn: async () => ({ heroes: [] }),
    });
    assert.equal(progress.length, 2);
    assert.equal(progress[0].idx, 0);
    assert.equal(progress[0].total, 2);
    assert.equal(progress[1].idx, 1);
  });

  it('handles no images at all gracefully', async () => {
    const result = await runCarouselBuild({
      ...baseOpts(),
      _readCefFn: () => makeCefData({ colors: ['black'] }),
      _readImagesFn: () => ({ selected: { images: [] } }),
      _evalViewFn: makeEvalViewFn(),
      _mergeFn: makeMergeFn(),
      _heroCallFn: async () => ({ heroes: [] }),
    });
    assert.equal(result.variantsProcessed, 0);
  });

  it('rejects when CEF data missing', async () => {
    const result = await runCarouselBuild({
      ...baseOpts(),
      _readCefFn: () => null,
      _readImagesFn: () => ({ selected: { images: [] } }),
      _evalViewFn: makeEvalViewFn(),
      _mergeFn: makeMergeFn(),
      _heroCallFn: async () => ({ heroes: [] }),
    });
    assert.equal(result.rejected, true);
    assert.ok(result.rejections.some(r => r.reason_code === 'no_cef_data'));
  });

  it('respects evalEnabled=false and skips entirely', async () => {
    const evalFn = makeEvalViewFn();
    const result = await runCarouselBuild({
      ...baseOpts(),
      specDb: makeSpecDb({ settings: { evalEnabled: 'false' } }),
      _readCefFn: () => makeCefData({ colors: ['black'] }),
      _readImagesFn: () => ({
        selected: { images: [makeImage()] },
      }),
      _evalViewFn: evalFn,
      _mergeFn: makeMergeFn(),
      _heroCallFn: async () => ({ heroes: [] }),
    });
    assert.equal(evalFn.calls.length, 0);
    assert.equal(result.rejected, true);
    assert.ok(result.rejections.some(r => r.reason_code === 'eval_disabled'));
  });

  it('filters to single variant when variantKey specified', async () => {
    const mergeFn = makeMergeFn();
    await runCarouselBuild({
      ...baseOpts(),
      variantKey: 'color:black',
      _readCefFn: () => makeCefData({ colors: ['black', 'white'] }),
      _readImagesFn: () => ({
        selected: {
          images: [
            makeImage({ variant_key: 'color:black', filename: 'top-black.png' }),
            makeImage({ variant_key: 'color:white', filename: 'top-white.png' }),
          ],
        },
      }),
      _evalViewFn: makeEvalViewFn(),
      _mergeFn: mergeFn,
      _heroCallFn: async () => ({ heroes: [] }),
    });
    assert.equal(mergeFn.calls.length, 1);
    assert.equal(mergeFn.calls[0].variantKey, 'color:black');
  });
});
