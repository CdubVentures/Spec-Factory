/**
 * Carousel Builder — view evaluation engine contract tests.
 *
 * Covers: prompt builders, orchestrator (evaluateViewCandidates),
 * caller factory, and eval persistence (mergeEvaluation).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildViewEvalPrompt,
  buildHeroSelectionPrompt,
  evaluateViewCandidates,
  createImageEvaluatorCallLlm,
  mergeEvaluation,
} from '../imageEvaluator.js';

/* ── Factories ──────────────────────────────────────────────────── */

function makeProduct(overrides = {}) {
  return {
    brand: 'Razer',
    model: 'DeathAdder V3',
    base_model: 'DeathAdder V3',
    variant: 'Black',
    ...overrides,
  };
}

function makeImage(overrides = {}) {
  return {
    view: 'top',
    filename: 'top-black.png',
    url: 'https://example.com/top.png',
    source_page: 'https://example.com',
    alt_text: 'Top view',
    bytes: 50000,
    width: 800,
    height: 600,
    quality_pass: true,
    variant_key: 'color:black',
    variant_label: 'Black',
    variant_type: 'color',
    downloaded_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const STUB_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';
function stubThumbnail() { return Promise.resolve(STUB_B64); }

/* ── buildViewEvalPrompt ────────────────────────────────────────── */

describe('buildViewEvalPrompt', () => {
  const defaults = {
    product: makeProduct(),
    variantLabel: 'Black',
    variantType: 'color',
    view: 'top',
    viewDescription: "Bird's-eye shot looking directly down at the product from above",
    candidateCount: 3,
    promptOverride: '',
  };

  it('returns a string containing product brand and model', () => {
    const result = buildViewEvalPrompt(defaults);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('Razer'));
    assert.ok(result.includes('DeathAdder V3'));
  });

  it('contains the view name', () => {
    const result = buildViewEvalPrompt(defaults);
    assert.ok(result.includes('top'));
  });

  it('contains the view-specific description', () => {
    const result = buildViewEvalPrompt(defaults);
    assert.ok(result.includes("Bird's-eye shot"));
  });

  it('different views produce different descriptions', () => {
    const topPrompt = buildViewEvalPrompt(defaults);
    const leftPrompt = buildViewEvalPrompt({
      ...defaults,
      view: 'left',
      viewDescription: 'Strict side profile from the left at eye level',
    });
    assert.ok(topPrompt.includes("Bird's-eye shot"));
    assert.ok(leftPrompt.includes('side profile'));
    assert.ok(!topPrompt.includes('side profile'));
    assert.ok(!leftPrompt.includes("Bird's-eye shot"));
  });

  it('contains candidate count reference', () => {
    const result = buildViewEvalPrompt(defaults);
    assert.ok(result.includes('3'));
  });

  it('contains evaluation criteria keywords', () => {
    const result = buildViewEvalPrompt(defaults);
    assert.ok(result.toLowerCase().includes('watermark'));
    assert.ok(result.toLowerCase().includes('crop'));
    assert.ok(result.toLowerCase().includes('sharp'));
  });

  it('describes the JSON response format', () => {
    const result = buildViewEvalPrompt(defaults);
    assert.ok(result.includes('rankings'));
  });

  it('uses edition phrasing for variantType=edition', () => {
    const result = buildViewEvalPrompt({ ...defaults, variantType: 'edition', variantLabel: 'COD BO6' });
    assert.ok(result.includes('edition'));
  });

  it('uses color variant phrasing for variantType=color', () => {
    const result = buildViewEvalPrompt(defaults);
    assert.ok(result.includes('color'));
  });

  it('promptOverride replaces default criteria', () => {
    const result = buildViewEvalPrompt({ ...defaults, promptOverride: 'CUSTOM EVAL RULES HERE' });
    assert.ok(result.includes('CUSTOM EVAL RULES HERE'));
    // Default criteria section header should be absent when override is provided
    assert.ok(!result.includes('Evaluation criteria'));
  });

  it('tolerates missing product fields', () => {
    const result = buildViewEvalPrompt({ ...defaults, product: {} });
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });
});

/* ── buildHeroSelectionPrompt ───────────────────────────────────── */

describe('buildHeroSelectionPrompt', () => {
  const defaults = {
    product: makeProduct(),
    variantLabel: 'Black',
    variantType: 'color',
    viewWinners: [
      { view: 'top', filename: 'top-black.png' },
      { view: 'left', filename: 'left-black.png' },
      { view: 'angle', filename: 'angle-black.png' },
    ],
    promptOverride: '',
  };

  it('returns a string containing brand and model', () => {
    const result = buildHeroSelectionPrompt(defaults);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('Razer'));
    assert.ok(result.includes('DeathAdder V3'));
  });

  it('lists view winner filenames', () => {
    const result = buildHeroSelectionPrompt(defaults);
    assert.ok(result.includes('top-black.png'));
    assert.ok(result.includes('left-black.png'));
    assert.ok(result.includes('angle-black.png'));
  });

  it('lists view names', () => {
    const result = buildHeroSelectionPrompt(defaults);
    assert.ok(result.includes('top'));
    assert.ok(result.includes('left'));
    assert.ok(result.includes('angle'));
  });

  it('contains hero/carousel language', () => {
    const result = buildHeroSelectionPrompt(defaults);
    assert.ok(result.includes('hero') || result.includes('Hero'));
    assert.ok(result.includes('carousel') || result.includes('Carousel'));
  });

  it('promptOverride replaces default criteria', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, promptOverride: 'MY HERO RULES' });
    assert.ok(result.includes('MY HERO RULES'));
  });

  it('handles empty viewWinners', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, viewWinners: [] });
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('tolerates missing product fields', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, product: {} });
    assert.equal(typeof result, 'string');
  });
});

/* ── evaluateViewCandidates ─────────────────────────────────────── */

describe('evaluateViewCandidates', () => {
  const baseOpts = {
    view: 'top',
    product: makeProduct(),
    variantLabel: 'Black',
    variantType: 'color',
    size: 512,
    promptOverride: '',
    createThumbnail: stubThumbnail,
  };

  it('0 candidates returns empty rankings, no LLM call', async () => {
    let called = false;
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: [],
      callLlm: async () => { called = true; return {}; },
    });
    assert.deepStrictEqual(result, { rankings: [] });
    assert.equal(called, false);
  });

  it('1 candidate auto-elects without LLM call', async () => {
    let called = false;
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png'],
      callLlm: async () => { called = true; return {}; },
    });
    assert.equal(called, false);
    assert.equal(result.rankings.length, 1);
    assert.equal(result.rankings[0].best, true);
    assert.equal(result.rankings[0].rank, 1);
    assert.deepStrictEqual(result.rankings[0].flags, []);
    assert.ok(result.rankings[0].reasoning.includes('auto'));
  });

  it('1 candidate uses path.basename for filename', async () => {
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/some/deep/path/top-black.png'],
      callLlm: async () => ({}),
    });
    assert.equal(result.rankings[0].filename, 'top-black.png');
  });

  it('2+ candidates calls callLlm', async () => {
    let called = false;
    const mockResponse = {
      rankings: [
        { filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'Best shot' },
        { filename: 'top-black-2.png', rank: 2, best: false, flags: ['cropped'], reasoning: 'Cropped edges' },
      ],
    };
    await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => { called = true; return mockResponse; },
    });
    assert.equal(called, true);
  });

  it('2+ candidates passes thumbnails as base64 data URIs', async () => {
    let capturedArgs = null;
    await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async (args) => {
        capturedArgs = args;
        return {
          rankings: [
            { filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'ok' },
            { filename: 'top-black-2.png', rank: 2, best: false, flags: [], reasoning: 'ok' },
          ],
        };
      },
    });
    assert.ok(capturedArgs);
    assert.ok(Array.isArray(capturedArgs.images));
    assert.equal(capturedArgs.images.length, 2);
    assert.ok(capturedArgs.images[0].file_uri.startsWith('data:image/png;base64,'));
    assert.equal(capturedArgs.images[0].mime_type, 'image/png');
  });

  it('2+ candidates parses LLM response into rankings', async () => {
    const mockResponse = {
      rankings: [
        { filename: 'top-black.png', rank: 1, best: true, flags: ['watermark'], reasoning: 'Has watermark but best angle' },
        { filename: 'top-black-2.png', rank: 2, best: false, flags: [], reasoning: 'Clean but blurry' },
      ],
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => mockResponse,
    });
    assert.equal(result.rankings.length, 2);
    assert.equal(result.rankings[0].filename, 'top-black.png');
    assert.equal(result.rankings[0].best, true);
    assert.deepStrictEqual(result.rankings[0].flags, ['watermark']);
  });

  it('LLM returns unknown filename: that entry is dropped', async () => {
    const mockResponse = {
      rankings: [
        { filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'ok' },
        { filename: 'UNKNOWN.png', rank: 2, best: false, flags: [], reasoning: 'mystery' },
      ],
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => mockResponse,
    });
    assert.equal(result.rankings.length, 1);
    assert.equal(result.rankings[0].filename, 'top-black.png');
  });

  it('LLM returns empty rankings', async () => {
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => ({ rankings: [] }),
    });
    assert.deepStrictEqual(result, { rankings: [] });
  });
});

/* ── createImageEvaluatorCallLlm ────────────────────────────────── */

describe('createImageEvaluatorCallLlm', () => {
  it('returns a function', () => {
    const mockDeps = {
      callRoutedLlmFn: async () => ({}),
      config: {},
      logger: { info: () => {}, error: () => {} },
    };
    const callLlm = createImageEvaluatorCallLlm(mockDeps);
    assert.equal(typeof callLlm, 'function');
  });
});

/* ── mergeEvaluation ────────────────────────────────────────────── */

describe('mergeEvaluation', () => {
  const TMP = path.join(os.tmpdir(), `eval-merge-test-${Date.now()}`);
  const PRODUCT_ID = 'test-product';
  const PRODUCT_ROOT = TMP;

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
    return doc;
  }

  function readTestDoc() {
    const raw = fs.readFileSync(path.join(TMP, PRODUCT_ID, 'product_images.json'), 'utf8');
    return JSON.parse(raw);
  }

  before(() => fs.mkdirSync(TMP, { recursive: true }));
  after(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ } });

  it('clears old eval fields on matching variant', () => {
    writeTestDoc([
      makeImage({ eval_best: true, eval_flags: ['watermark'], eval_reasoning: 'old', hero: true, hero_rank: 1 }),
    ]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults: new Map(),
      heroResults: null,
    });
    const img = result.selected.images[0];
    assert.equal(img.eval_best, undefined);
    assert.equal(img.eval_flags, undefined);
    assert.equal(img.eval_reasoning, undefined);
    assert.equal(img.hero, undefined);
    assert.equal(img.hero_rank, undefined);
  });

  it('applies fresh eval results by filename match', () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png' }),
      makeImage({ filename: 'top-black-2.png', view: 'top' }),
    ]);
    const viewResults = new Map([
      ['top', {
        rankings: [
          { filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'Sharp and clean' },
          { filename: 'top-black-2.png', rank: 2, best: false, flags: ['cropped'], reasoning: 'Edges cut off' },
        ],
      }],
    ]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults,
      heroResults: null,
    });
    const img1 = result.selected.images.find(i => i.filename === 'top-black.png');
    const img2 = result.selected.images.find(i => i.filename === 'top-black-2.png');
    assert.equal(img1.eval_best, true);
    assert.deepStrictEqual(img1.eval_flags, []);
    assert.equal(img1.eval_reasoning, 'Sharp and clean');
    assert.equal(img2.eval_best, false);
    assert.deepStrictEqual(img2.eval_flags, ['cropped']);
  });

  it('does not touch images from other variants', () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', variant_key: 'color:black', eval_best: true }),
      makeImage({ filename: 'top-blue.png', variant_key: 'color:blue', eval_best: true, eval_reasoning: 'keep me' }),
    ]);
    mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults: new Map(),
      heroResults: null,
    });
    const doc = readTestDoc();
    const blue = doc.selected.images.find(i => i.variant_key === 'color:blue');
    assert.equal(blue.eval_best, true);
    assert.equal(blue.eval_reasoning, 'keep me');
  });

  it('applies hero results when provided', () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png' }),
      makeImage({ filename: 'angle-black.png', view: 'angle' }),
    ]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults: new Map(),
      heroResults: {
        heroes: [
          { filename: 'top-black.png', hero_rank: 1, reasoning: 'Best showcase' },
          { filename: 'angle-black.png', hero_rank: 2, reasoning: 'Good angle' },
        ],
      },
    });
    const top = result.selected.images.find(i => i.filename === 'top-black.png');
    const angle = result.selected.images.find(i => i.filename === 'angle-black.png');
    assert.equal(top.hero, true);
    assert.equal(top.hero_rank, 1);
    assert.equal(angle.hero, true);
    assert.equal(angle.hero_rank, 2);
  });

  it('heroResults=null skips hero application', () => {
    writeTestDoc([makeImage()]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults: new Map(),
      heroResults: null,
    });
    assert.equal(result.selected.images[0].hero, undefined);
  });

  it('unknown filename in eval results is silently skipped', () => {
    writeTestDoc([makeImage({ filename: 'top-black.png' })]);
    const viewResults = new Map([
      ['top', {
        rankings: [
          { filename: 'NOPE.png', rank: 1, best: true, flags: [], reasoning: 'ghost' },
        ],
      }],
    ]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults,
      heroResults: null,
    });
    // No crash, image untouched (eval fields cleared but not set)
    assert.equal(result.selected.images[0].eval_best, undefined);
  });

  it('returns null when file not found', () => {
    const result = mergeEvaluation({
      productId: 'nonexistent-product',
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults: new Map(),
      heroResults: null,
    });
    assert.equal(result, null);
  });

  it('preserves non-eval fields on images', () => {
    writeTestDoc([makeImage({ filename: 'top-black.png', url: 'https://example.com/top.png', bytes: 50000 })]);
    const viewResults = new Map([
      ['top', {
        rankings: [
          { filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'good' },
        ],
      }],
    ]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults,
      heroResults: null,
    });
    const img = result.selected.images[0];
    assert.equal(img.url, 'https://example.com/top.png');
    assert.equal(img.bytes, 50000);
    assert.equal(img.view, 'top');
  });

  it('multiple views in viewResults all applied', () => {
    writeTestDoc([
      makeImage({ filename: 'top-black.png', view: 'top' }),
      makeImage({ filename: 'left-black.png', view: 'left' }),
    ]);
    const viewResults = new Map([
      ['top', { rankings: [{ filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'top winner' }] }],
      ['left', { rankings: [{ filename: 'left-black.png', rank: 1, best: true, flags: ['badge'], reasoning: 'left winner' }] }],
    ]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults,
      heroResults: null,
    });
    const top = result.selected.images.find(i => i.filename === 'top-black.png');
    const left = result.selected.images.find(i => i.filename === 'left-black.png');
    assert.equal(top.eval_best, true);
    assert.equal(top.eval_reasoning, 'top winner');
    assert.equal(left.eval_best, true);
    assert.deepStrictEqual(left.eval_flags, ['badge']);
  });

  it('idempotent: running twice produces same result', () => {
    writeTestDoc([makeImage({ filename: 'top-black.png' })]);
    const viewResults = new Map([
      ['top', { rankings: [{ filename: 'top-black.png', rank: 1, best: true, flags: [], reasoning: 'winner' }] }],
    ]);
    const opts = { productId: PRODUCT_ID, productRoot: PRODUCT_ROOT, variantKey: 'color:black', viewResults, heroResults: null };
    mergeEvaluation(opts);
    const result = mergeEvaluation(opts);
    const img = result.selected.images[0];
    assert.equal(img.eval_best, true);
    assert.equal(img.eval_reasoning, 'winner');
  });
});
