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
import { runEvalView, runEvalHero, runEvalCarouselLoop } from '../carouselBuild.js';

const TMP = path.join(os.tmpdir(), `eval-build-test-${Date.now()}`);
const PRODUCT_ID = 'p1';

function makeImage(overrides = {}) {
  return {
    view: 'top',
    filename: 'top-black.png',
    url: 'https://example.com/top.png',
    variant_id: 'v_abc12345',
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

function makeSpecDb(settings = {}, overrides = {}) {
  return {
    getFinderStore: () => ({
      getSetting: (key) => settings[key] ?? '',
      updateSummaryField: () => {},
    }),
    ...overrides,
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

  it('passes product image dependency facts into view eval', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'top-black-2.png', view: 'top' }),
    ]);
    let seenFacts = null;
    await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(
        { evalThumbSize: '512' },
        {
          getCompiledRules: () => ({
            fields: {
              connection: { product_image_dependent: true, ui: { label: 'Connection' } },
            },
          }),
          getFieldCandidatesByProductAndField: (_productId, fieldKey) => {
            if (fieldKey === 'connection') return [{ status: 'resolved', value: 'wired', confidence: 96 }];
            return [];
          },
          getResolvedFieldCandidate: () => null,
        },
      ),
      config: {},
      variantKey: 'color:black',
      variantId: 'v_abc12345',
      view: 'top',
      productRoot: TMP,
      _evalViewFn: async ({ imagePaths, productImageIdentityFacts }) => {
        seenFacts = productImageIdentityFacts;
        return {
          rankings: imagePaths.map((p, i) => ({
            filename: path.basename(p),
            rank: i + 1,
            best: i === 0,
            flags: [],
            reasoning: 'test',
          })),
        };
      },
      _mergeFn: () => ({ selected: { images: [] } }),
    });

    assert.deepEqual(
      seenFacts.map((fact) => [fact.fieldKey, fact.value]),
      [['connection', 'wired']],
    );
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

  it('does not emit outer LLM call rows around the evaluator-owned call', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'top-black-2.png', view: 'top' }),
    ]);
    const llmCalls = [];
    await runEvalView({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      view: 'top',
      productRoot: TMP,
      onLlmCallComplete: (call) => llmCalls.push(call),
      _evalViewFn: async ({ imagePaths }) => ({
        rankings: [{ filename: path.basename(imagePaths[0]), rank: 1, best: true, flags: [], reasoning: 'ok' }],
      }),
      _mergeFn: () => ({}),
    });
    assert.deepEqual(llmCalls, []);
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
      _heroCallFn: async ({ candidates }) => ({ result: {
        heroes: candidates.map((c, i) => ({
          filename: c.filename,
          hero_rank: i + 1,
          reasoning: 'hero test',
        })),
      }, usage: null }),
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

  it('single hero candidate calls LLM for quality evaluation', async () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
    ]);
    let llmCalled = false;
    const heroResponse = {
      heroes: [{ filename: 'hero-black.png', hero_rank: 1, reasoning: 'Good lifestyle shot' }],
    };
    const result = await runEvalHero({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      _heroCallFn: async () => { llmCalled = true; return { result: heroResponse, usage: null }; },
      _mergeFn: () => ({}),
    });
    assert.equal(llmCalled, true, 'LLM must be called even for single hero candidate');
    assert.equal(result.heroes.length, 1);
    assert.equal(result.heroes[0].reasoning, 'Good lifestyle shot');
  });

  it('single hero candidate rejected by LLM returns empty heroes', async () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
    ]);
    let mergeCalled = false;
    const result = await runEvalHero({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      _heroCallFn: async () => ({ result: { heroes: [] }, usage: null }),
      _mergeFn: () => { mergeCalled = true; },
    });
    assert.equal(result.heroes.length, 0, 'rejected single hero must not appear');
    assert.equal(mergeCalled, true, 'merge must still be called with empty heroes');
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
        return { result: { heroes: [{ filename: 'hero-black.png', hero_rank: 1, reasoning: 'ok' }] }, usage: null };
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
      _heroCallFn: async ({ candidates }) => ({ result: {
        heroes: [{ filename: candidates[0].filename, hero_rank: 1, reasoning: 'ok' }],
      }, usage: null }),
      _mergeFn: () => ({}),
    });
    assert.ok(stages.includes('Heroes'));
    assert.ok(stages.includes('Complete'));
  });

  it('does not emit outer LLM call rows around the hero evaluator-owned call', async () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
      makeImage({ filename: 'hero-black-2.png', view: 'hero' }),
    ]);
    const llmCalls = [];
    await runEvalHero({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb(),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      onLlmCallComplete: (call) => llmCalls.push(call),
      _heroCallFn: async ({ candidates }) => ({ result: {
        heroes: [{ filename: candidates[0].filename, hero_rank: 1, reasoning: 'ok' }],
      }, usage: null }),
      _mergeFn: () => ({}),
    });
    assert.deepEqual(llmCalls, []);
  });
});

/* runEvalCarouselLoop */

describe('runEvalCarouselLoop', () => {
  it('evaluates slots sequentially and passes prior winners as carousel context', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'front-black.png', view: 'front' }),
      makeImage({ filename: 'sangle-black.png', view: 'sangle' }),
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
    ]);

    const calls = [];
    const heroCalls = [];
    const progress = [];
    const slotCompletions = [];
    const result = await runEvalCarouselLoop({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb({
        viewBudget: '["top","front","sangle"]',
        heroEnabled: 'true',
        evalHeroCount: '1',
      }),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      onProgress: (message) => progress.push(message),
      onSlotComplete: (event) => slotCompletions.push({
        type: event.type,
        view: event.view,
        callNumber: event.callNumber,
        totalCalls: event.totalCalls,
      }),
      _evalViewFn: async ({ view, imagePaths, carouselContext }) => {
        calls.push({
          view,
          context: (carouselContext || []).map((item) => `${item.slot}:${item.filename}`),
        });
        return {
          rankings: [{
            filename: path.basename(imagePaths[0]),
            rank: 1,
            best: true,
            flags: [],
            reasoning: `${view} winner`,
          }],
        };
      },
      _heroCallFn: async ({ candidates }) => {
        heroCalls.push(candidates.map((candidate) => candidate.filename));
        return {
          result: {
            heroes: [{ filename: candidates[0].filename, hero_rank: 1, reasoning: 'hero winner' }],
            rejected: [],
          },
          usage: null,
        };
      },
    });

    assert.deepEqual(calls.map((call) => call.view), ['top', 'sangle', 'front']);
    assert.deepEqual(calls[0].context, []);
    assert.deepEqual(calls[1].context, ['top:top-black.png']);
    assert.deepEqual(calls[2].context, ['top:top-black.png', 'sangle:sangle-black.png']);
    assert.deepEqual(heroCalls, [['hero-black.png']]);
    assert.deepEqual(progress, [
      'Evaluating top — call 1/4, 3 remaining',
      'Evaluating sangle — call 2/4, 2 remaining',
      'Evaluating front — call 3/4, 1 remaining',
      'Evaluating hero — call 4/4, 0 remaining',
      'Complete',
    ]);
    assert.deepEqual(slotCompletions, [
      { type: 'view', view: 'top', callNumber: 1, totalCalls: 4 },
      { type: 'view', view: 'sangle', callNumber: 2, totalCalls: 4 },
      { type: 'view', view: 'front', callNumber: 3, totalCalls: 4 },
      { type: 'hero', view: 'hero', callNumber: 4, totalCalls: 4 },
    ]);
    assert.equal(result.views.length, 3);
    assert.equal(result.hero.heroes[0].filename, 'hero-black.png');
  });

  it('allows a slot eval to return null without blocking later slots', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'front-black.png', view: 'front' }),
    ]);

    const calls = [];
    const result = await runEvalCarouselLoop({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb({
        viewBudget: '["top","front"]',
        heroEnabled: 'false',
      }),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      _evalViewFn: async ({ view, imagePaths }) => {
        calls.push(view);
        if (view === 'top') {
          return {
            rankings: [{
              filename: path.basename(imagePaths[0]),
              best: false,
              flags: ['wrong_product'],
              reasoning: 'bad',
            }],
          };
        }
        return {
          rankings: [{
            filename: path.basename(imagePaths[0]),
            best: true,
            flags: [],
            reasoning: 'ok',
          }],
        };
      },
      _heroCallFn: async () => { throw new Error('hero disabled'); },
    });

    assert.deepEqual(calls, ['top', 'front']);
    assert.equal(result.views.length, 2);
    assert.ok(!result.views[0].rankings.some((ranking) => ranking.best));
    assert.equal(result.views[1].rankings[0].best, true);
  });

  it('evaluates collected non-budget canonical views after required budget views', async () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'front-black.png', view: 'front' }),
      makeImage({ filename: 'rear-black.png', view: 'rear' }),
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
    ]);

    const calls = [];
    const heroCalls = [];
    const result = await runEvalCarouselLoop({
      product: { product_id: PRODUCT_ID, category: 'mouse', brand: 'Razer', model: 'V3' },
      specDb: makeSpecDb({
        viewBudget: '["top","left"]',
        heroEnabled: 'true',
        evalHeroCount: '1',
      }),
      config: {},
      variantKey: 'color:black',
      productRoot: TMP,
      _evalViewFn: async ({ view, imagePaths }) => {
        calls.push(view);
        return {
          rankings: [{
            filename: path.basename(imagePaths[0]),
            best: true,
            flags: [],
            reasoning: `${view} winner`,
          }],
        };
      },
      _heroCallFn: async ({ candidates }) => {
        heroCalls.push(candidates.map((candidate) => candidate.filename));
        return {
          result: {
            heroes: [{ filename: candidates[0].filename, hero_rank: 1, reasoning: 'hero winner' }],
            rejected: [],
          },
          usage: null,
        };
      },
      _mergeFn: () => ({}),
    });

    assert.deepEqual(calls, ['top', 'front', 'rear']);
    assert.deepEqual(result.skipped, [{ view: 'left', reason: 'no_candidates' }]);
    assert.deepEqual(result.views.map((viewResult) => viewResult.view), ['top', 'front', 'rear']);
    assert.deepEqual(heroCalls, [['hero-black.png']]);
  });
});
