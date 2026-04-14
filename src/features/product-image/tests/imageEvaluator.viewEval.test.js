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
    variant_id: 'v_abc12345',
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
    assert.ok(result.includes('winner'));
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

  it('evalCriteria replaces default criteria when no promptOverride', () => {
    const result = buildViewEvalPrompt({ ...defaults, evalCriteria: 'CATEGORY SPECIFIC CRITERIA' });
    assert.ok(result.includes('CATEGORY SPECIFIC CRITERIA'));
  });

  it('promptOverride beats evalCriteria', () => {
    const result = buildViewEvalPrompt({
      ...defaults,
      promptOverride: 'OVERRIDE WINS',
      evalCriteria: 'CATEGORY CRITERIA LOSES',
    });
    assert.ok(result.includes('OVERRIDE WINS'));
    assert.ok(!result.includes('CATEGORY CRITERIA LOSES'));
  });

  it('falls back to default criteria when neither override nor evalCriteria', () => {
    const result = buildViewEvalPrompt({ ...defaults, promptOverride: '', evalCriteria: '' });
    assert.ok(result.toLowerCase().includes('watermark'));
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
    candidates: [
      { filename: 'hero-black.png' },
      { filename: 'hero-black-2.png' },
      { filename: 'hero-black-3.png' },
    ],
    promptOverride: '',
  };

  it('returns a string containing brand and model', () => {
    const result = buildHeroSelectionPrompt(defaults);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('Razer'));
    assert.ok(result.includes('DeathAdder V3'));
  });

  it('contains candidate count in prompt', () => {
    const result = buildHeroSelectionPrompt(defaults);
    // WHY: Filenames are sent in the user message (userText), not the system prompt.
    // The system prompt contains the count so the LLM knows how many to expect.
    assert.ok(result.includes('3'), 'should reference 3 candidates');
    assert.ok(result.includes('evaluating'), 'should describe evaluation task');
  });

  it('contains hero language', () => {
    const result = buildHeroSelectionPrompt(defaults);
    assert.ok(result.includes('hero') || result.includes('Hero'));
  });

  it('contains candidate count', () => {
    const result = buildHeroSelectionPrompt(defaults);
    assert.ok(result.includes('3'));
  });

  it('promptOverride replaces default criteria', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, promptOverride: 'MY HERO RULES' });
    assert.ok(result.includes('MY HERO RULES'));
  });

  it('heroCriteria replaces default criteria when no promptOverride', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, heroCriteria: 'CATEGORY HERO CRITERIA' });
    assert.ok(result.includes('CATEGORY HERO CRITERIA'));
  });

  it('promptOverride beats heroCriteria', () => {
    const result = buildHeroSelectionPrompt({
      ...defaults,
      promptOverride: 'OVERRIDE WINS',
      heroCriteria: 'CATEGORY HERO LOSES',
    });
    assert.ok(result.includes('OVERRIDE WINS'));
    assert.ok(!result.includes('CATEGORY HERO LOSES'));
  });

  it('handles empty candidates', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, candidates: [] });
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  it('tolerates missing product fields', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, product: {} });
    assert.equal(typeof result, 'string');
  });

  it('respects heroCount parameter', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, heroCount: 5 });
    assert.ok(result.includes('5'));
  });

  // — Source safety: the primary gate —

  it('rejects editorial/review site photos as copyright risk', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(lower.includes('review site') || lower.includes('editorial'),
      'must explicitly reject review site / editorial photos');
    assert.ok(lower.includes('copyright') || lower.includes('copyrighted'),
      'must explain WHY review site photos are rejected — copyright');
  });

  it('requires manufacturer/official source provenance', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(lower.includes('manufacturer') || lower.includes('official') || lower.includes('press kit') || lower.includes('brand'),
      'must describe what a safe source looks like — manufacturer/official/press kit');
  });

  it('describes editorial photo tells so LLM can visually identify them', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(lower.includes('lab') || lower.includes('test environment') || lower.includes('desk clutter') || lower.includes('hands'),
      'must describe visual tells of editorial photos so LLM can spot them');
  });

  // — Cleanliness gate —

  it('rejects watermarks and overlays', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(lower.includes('watermark'), 'must mention watermarks as disqualification');
    assert.ok(lower.includes('badge') || lower.includes('overlay') || lower.includes('sticker'),
      'must mention badges/overlays as disqualification');
  });

  // — Quality gate —

  it('contains image quality criteria', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(lower.includes('blur') || lower.includes('sharp') || lower.includes('resolution') || lower.includes('compress'),
      'must mention image quality requirements');
  });

  // — Identity gate —

  it('requires correct product identity', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(lower.includes('wrong') || lower.includes('correct model') || lower.includes('identity'),
      'must require correct product identity');
  });

  // — Diversity as tiebreaker, not art direction —

  it('prefers diverse shots when picking multiple heroes', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    const hasDiversity = lower.includes('different') || lower.includes('duplicate') || lower.includes('diversity');
    assert.ok(hasDiversity, 'should prefer diverse shots when multiple heroes selected');
  });

  // — NOT an art director —

  it('does not play art director with composition rules', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(!lower.includes('clear star'), 'should not impose composition requirements');
    assert.ok(!lower.includes('obvious focal point'), 'should not impose focal point requirements');
    assert.ok(!lower.includes('well-framed'), 'should not impose framing requirements');
  });

  it('accepts any image type — cutouts, lifestyle, renders, kits', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(!lower.includes('not cutout'), 'should not reject cutouts');
    assert.ok(!lower.includes('not product image'), 'should not reject product images');
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

  it('1 candidate calls LLM for quality evaluation', async () => {
    let called = false;
    const mockResponse = {
      winner: { filename: 'top-black.png', reasoning: 'Clean shot, no issues' },
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png'],
      callLlm: async () => { called = true; return { result: mockResponse, usage: {} }; },
    });
    assert.equal(called, true, 'LLM must be called even for single candidate');
    assert.equal(result.rankings.length, 1);
    assert.equal(result.rankings[0].best, true);
    assert.equal(result.rankings[0].reasoning, 'Clean shot, no issues');
  });

  it('1 candidate rejected by LLM returns no winner', async () => {
    const mockResponse = {
      winner: null,
      rejected: [{ filename: 'top-black.png', flags: ['wrong_product'] }],
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png'],
      callLlm: async () => ({ result: mockResponse, usage: {} }),
    });
    assert.ok(!result.rankings.some(r => r.best), 'rejected single candidate must not be eval_best');
    assert.equal(result.rankings.length, 1);
    assert.deepStrictEqual(result.rankings[0].flags, ['wrong_product']);
  });

  it('1 candidate passes thumbnail to LLM as base64 data URI', async () => {
    let capturedArgs = null;
    await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png'],
      callLlm: async (args) => {
        capturedArgs = args;
        return {
          result: { winner: { filename: 'top-black.png', reasoning: 'ok' } },
          usage: {},
        };
      },
    });
    assert.ok(capturedArgs, 'callLlm must receive args');
    assert.ok(Array.isArray(capturedArgs.images));
    assert.equal(capturedArgs.images.length, 1);
    assert.ok(capturedArgs.images[0].file_uri.startsWith('data:image/png;base64,'));
  });

  it('2+ candidates calls callLlm', async () => {
    let called = false;
    const mockResponse = {
      winner: { filename: 'top-black.png', reasoning: 'Best shot' },
      rejected: [{ filename: 'top-black-2.png', flags: ['cropped'] }],
    };
    await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => { called = true; return { result: mockResponse, usage: {} }; },
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
          result: { winner: { filename: 'top-black.png', reasoning: 'ok' } },
          usage: {},
        };
      },
    });
    assert.ok(capturedArgs);
    assert.ok(Array.isArray(capturedArgs.images));
    assert.equal(capturedArgs.images.length, 2);
    assert.ok(capturedArgs.images[0].file_uri.startsWith('data:image/png;base64,'));
    assert.equal(capturedArgs.images[0].mime_type, 'image/png');
  });

  it('2+ candidates: winner gets eval_best=true, rejected get flags + reasoning', async () => {
    const mockResponse = {
      winner: { filename: 'top-black.png', reasoning: 'Sharp and well-composed' },
      rejected: [{ filename: 'top-black-2.png', flags: ['watermark'], reasoning: 'Has visible watermark overlay' }],
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => ({ result: mockResponse, usage: {} }),
    });
    const winner = result.rankings.find(r => r.filename === 'top-black.png');
    const rejected = result.rankings.find(r => r.filename === 'top-black-2.png');
    assert.ok(winner);
    assert.equal(winner.best, true);
    assert.equal(winner.reasoning, 'Sharp and well-composed');
    assert.ok(rejected);
    assert.equal(rejected.best, false);
    assert.deepStrictEqual(rejected.flags, ['watermark']);
    assert.equal(rejected.reasoning, 'Has visible watermark overlay');
  });

  it('candidates not in winner or rejected are absent from rankings', async () => {
    const mockResponse = {
      winner: { filename: 'top-black.png', reasoning: 'Best' },
      // top-black-2.png not rejected — just lower quality, no flags
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => ({ result: mockResponse, usage: {} }),
    });
    assert.equal(result.rankings.length, 1);
    assert.equal(result.rankings[0].filename, 'top-black.png');
    assert.equal(result.rankings[0].best, true);
  });

  it('LLM returns unknown winner filename: dropped', async () => {
    const mockResponse = {
      winner: { filename: 'UNKNOWN.png', reasoning: 'ghost' },
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => ({ result: mockResponse, usage: {} }),
    });
    assert.deepStrictEqual(result.rankings, []);
  });

  it('LLM returns no winner: empty rankings', async () => {
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => ({ result: {}, usage: {} }),
    });
    assert.deepStrictEqual(result.rankings, []);
  });

  it('LLM returns null winner (all rejected): flags + reasoning applied, no eval_best', async () => {
    const mockResponse = {
      winner: null,
      rejected: [
        { filename: 'top-black.png', flags: ['watermark'], reasoning: 'Getty watermark visible' },
        { filename: 'top-black-2.png', flags: ['wrong_product'], reasoning: 'Shows different mouse model' },
      ],
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => ({ result: mockResponse, usage: {} }),
    });
    // No winner — no eval_best=true in rankings
    assert.ok(!result.rankings.some(r => r.best));
    // Both rejected with flags + reasoning
    assert.equal(result.rankings.length, 2);
    assert.deepStrictEqual(result.rankings[0].flags, ['watermark']);
    assert.equal(result.rankings[0].reasoning, 'Getty watermark visible');
    assert.deepStrictEqual(result.rankings[1].flags, ['wrong_product']);
    assert.equal(result.rankings[1].reasoning, 'Shows different mouse model');
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

  it('clears old eval fields on matching variant+view', () => {
    writeTestDoc([
      makeImage({ eval_best: true, eval_flags: ['watermark'], eval_reasoning: 'old', hero: true, hero_rank: 1 }),
    ]);
    // WHY: Pass the view in viewResults so the clear targets it.
    // Hero fields are cleared when heroResults is provided.
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults: new Map([['top', { rankings: [] }]]),
      heroResults: { heroes: [] },
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
          { filename: 'top-black.png', best: true, flags: [], reasoning: 'Sharp and clean' },
          { filename: 'top-black-2.png', best: false, flags: ['cropped'], reasoning: '' },
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
          { filename: 'NOPE.png', best: true, flags: [], reasoning: 'ghost' },
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
          { filename: 'top-black.png', best: true, flags: [], reasoning: 'good' },
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
      ['top', { rankings: [{ filename: 'top-black.png', best: true, flags: [], reasoning: 'top winner' }] }],
      ['left', { rankings: [{ filename: 'left-black.png', best: true, flags: ['badge'], reasoning: 'left winner' }] }],
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
      ['top', { rankings: [{ filename: 'top-black.png', best: true, flags: [], reasoning: 'winner' }] }],
    ]);
    const opts = { productId: PRODUCT_ID, productRoot: PRODUCT_ROOT, variantKey: 'color:black', viewResults, heroResults: null };
    mergeEvaluation(opts);
    const result = mergeEvaluation(opts);
    const img = result.selected.images[0];
    assert.equal(img.eval_best, true);
    assert.equal(img.eval_reasoning, 'winner');
  });
});
