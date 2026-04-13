/**
 * Carousel Builder — runEvalView + runEvalHero contract tests.
 *
 * Each function handles ONE LLM call. The GUI fires N+1 of these
 * in parallel — one per view group + one for hero.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runEvalView, runEvalHero } from '../carouselBuild.js';

const TMP = path.join(os.tmpdir(), `eval-build-test-${Date.now()}`);
const PRODUCT_ID = 'p1';

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

function writeTestDoc(images) {
  const doc = {
    product_id: PRODUCT_ID,
    category: 'mouse',
    selected: { images },
    cooldown_until: '',
    last_ran_at: '',
    run_count: 1,
    next_run_number: 2,
    runs: [],
  };
  const dir = path.join(TMP, PRODUCT_ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product_images.json'), JSON.stringify(doc, null, 2));
}

function makeSpecDb(settings = {}) {
  return {
    getFinderStore: () => ({
      getSetting: (key) => settings[key] ?? '',
    }),
  };
}

before(() => fs.mkdirSync(TMP, { recursive: true }));
after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } });

/* ── runEvalView ────────────────────────────────────────────────── */

describe('runEvalView', () => {
  it('evaluates candidates for one view and persists', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'top-black-2.png', view: 'top' }),
    ]);
    let merged = false;
    const result = await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb({ evalThumbSize: '512' }),
      config: {},
      variantKey: 'color:black',
      view: 'top',
      productRoot: TMP,
      _evalViewFn: async ({ imagePaths, view }) => ({
        rankings: imagePaths.map((p, i) => ({
          filename: path.basename(p),
          rank: i + 1,
          best: i === 0,
          flags: [],
          reasoning: 'test',
        })),
      }),
      _mergeFn: (opts) => { merged = true; return { selected: { images: [] } }; },
    });
    assert.equal(result.rankings.length, 2);
    assert.equal(result.rankings[0].best, true);
    assert.equal(merged, true);
  });

  it('skips when no images match variant+view', async () => {
    writeTestDoc([
      makeImage({ filename: 'left-black.png', view: 'left' }),
    ]);
    const result = await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      view: 'top',
      productRoot: TMP,
      _evalViewFn: async () => { throw new Error('should not call'); },
      _mergeFn: () => ({}),
    });
    assert.equal(result.skipped, true);
  });

  it('calls onStageAdvance', async () => {
    writeTestDoc([makeImage()]);
    const stages = [];
    await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      view: 'top',
      productRoot: TMP,
      onStageAdvance: (s) => stages.push(s),
      _evalViewFn: async ({ imagePaths }) => ({
        rankings: [{ filename: path.basename(imagePaths[0]), rank: 1, best: true, flags: [], reasoning: 'ok' }],
      }),
      _mergeFn: () => ({}),
    });
    assert.ok(stages.includes('Evaluating'));
    assert.ok(stages.includes('Complete'));
  });

  it('passes category-specific evalCriteria to eval function', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'top-black-2.png', view: 'top' }),
    ]);
    let capturedCriteria = null;
    await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      view: 'top',
      productRoot: TMP,
      _evalViewFn: async (opts) => {
        capturedCriteria = opts.evalCriteria;
        return { rankings: [{ filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'ok' }] };
      },
      _mergeFn: () => ({}),
    });
    assert.ok(capturedCriteria, 'evalCriteria should be passed');
    assert.ok(capturedCriteria.includes('MOUSE'), 'should contain mouse-specific criteria');
    assert.ok(capturedCriteria.includes('TOP'), 'should reference top view');
  });

  it('uses DB override criteria when finder setting is set', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'top-black-2.png', view: 'top' }),
    ]);
    let capturedCriteria = null;
    await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb({ evalViewCriteria_top: 'CUSTOM DB CRITERIA' }),
      config: {},
      variantKey: 'color:black',
      view: 'top',
      productRoot: TMP,
      _evalViewFn: async (opts) => {
        capturedCriteria = opts.evalCriteria;
        return { rankings: [{ filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'ok' }] };
      },
      _mergeFn: () => ({}),
    });
    assert.equal(capturedCriteria, 'CUSTOM DB CRITERIA');
  });

  it('passes category-specific viewDescription (not generic)', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'top-black-2.png', view: 'top' }),
    ]);
    let capturedDesc = null;
    await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      view: 'top',
      productRoot: TMP,
      _evalViewFn: async (opts) => {
        capturedDesc = opts.viewDescription;
        return { rankings: [{ filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'ok' }] };
      },
      _mergeFn: () => ({}),
    });
    assert.ok(capturedDesc, 'viewDescription should be passed');
    // Mouse top description should mention mouse-specific details (button layout, shape outline)
    assert.ok(capturedDesc.includes('button'), 'mouse top should mention button layout');
  });
});

/* ── runEvalHero ────────────────────────────────────────────────── */

describe('runEvalHero', () => {
  it('evaluates hero-view candidates and persists', async () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
      makeImage({ filename: 'hero-black-2.png', view: 'hero' }),
      makeImage({ filename: 'top-black.png', view: 'top' }),
    ]);
    let mergedHeroes = null;
    const result = await runEvalHero({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      _heroCallFn: async ({ candidates }) => ({
        heroes: candidates.map((c, i) => ({
          filename: c.filename,
          hero_rank: i + 1,
          reasoning: 'hero test',
        })),
      }),
      _mergeFn: (opts) => { mergedHeroes = opts.heroResults; return {}; },
    });
    assert.equal(result.heroes.length, 2);
    assert.equal(result.heroes[0].hero_rank, 1);
    assert.equal(result.heroes[0].filename, 'hero-black.png');
    assert.ok(mergedHeroes);
  });

  it('skips when no hero-view images exist', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
    ]);
    const result = await runEvalHero({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      _heroCallFn: async () => { throw new Error('should not call'); },
      _mergeFn: () => ({}),
    });
    assert.equal(result.skipped, true);
  });

  it('auto-elects single hero candidate without LLM call', async () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
    ]);
    let llmCalled = false;
    const result = await runEvalHero({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      _heroCallFn: async () => { llmCalled = true; return { heroes: [] }; },
      _mergeFn: () => ({}),
    });
    assert.equal(llmCalled, false, 'single candidate should auto-elect without LLM');
    assert.equal(result.heroes.length, 1);
    assert.equal(result.heroes[0].filename, 'hero-black.png');
    assert.equal(result.heroes[0].hero_rank, 1);
    assert.ok(result.heroes[0].reasoning.includes('auto'));
  });

  it('passes category-specific heroCriteria to hero call', async () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
      makeImage({ filename: 'hero-black-2.png', view: 'hero' }),
    ]);
    let capturedCriteria = null;
    await runEvalHero({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      _heroCallFn: async (opts) => {
        capturedCriteria = opts.heroCriteria;
        return { heroes: [{ filename: 'hero-black.png', hero_rank: 1, reasoning: 'ok' }] };
      },
      _mergeFn: () => ({}),
    });
    assert.ok(capturedCriteria, 'heroCriteria should be passed');
    assert.ok(capturedCriteria.includes('MOUSE'), 'should contain mouse-specific hero criteria');
  });

  it('calls onStageAdvance', async () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
      makeImage({ filename: 'hero-black-2.png', view: 'hero' }),
    ]);
    const stages = [];
    await runEvalHero({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      onStageAdvance: (s) => stages.push(s),
      _heroCallFn: async ({ candidates }) => ({
        heroes: [{ filename: candidates[0].filename, hero_rank: 1, reasoning: 'ok' }],
      }),
      _mergeFn: () => ({}),
    });
    assert.ok(stages.includes('Heroes'));
    assert.ok(stages.includes('Complete'));
  });
});
