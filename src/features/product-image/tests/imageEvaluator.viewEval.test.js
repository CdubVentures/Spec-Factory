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

  it('includes product image identity guardrails when provided', () => {
    const result = buildViewEvalPrompt({
      ...defaults,
      productImageIdentityFacts: [
        { fieldKey: 'connection', label: 'Connection', value: 'wired' },
      ],
    });
    assert.ok(result.includes('Product image identity guardrails'));
    assert.ok(result.includes('connection: wired'));
    assert.ok(result.includes('wrong_product'));
    assert.ok(result.includes('dependency_status'));
    assert.ok(result.includes('aligned'));
    assert.ok(result.includes('mismatch'));
    assert.ok(result.toLowerCase().includes('fewer accurate images'));
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

  it('treats promptOverride as a full view-eval prompt template override', () => {
    const result = buildViewEvalPrompt({
      ...defaults,
      promptOverride: 'CUSTOM VIEW EVAL {{IDENTITY}}\n{{PRODUCT_IMAGE_IDENTITY_FACTS}}\n{{VIEW_LINE}}\n{{COUNT_LINE}}\n{{CRITERIA}}',
      productImageIdentityFacts: [
        { fieldKey: 'connection', label: 'Connection', value: 'wired' },
      ],
    });
    assert.ok(result.startsWith('CUSTOM VIEW EVAL Product: Razer DeathAdder V3'));
    assert.ok(result.includes('connection: wired'));
    assert.ok(result.includes('View: "top"'));
    assert.ok(result.includes('You are evaluating 3 candidate images'));
    assert.ok(result.includes('Evaluation criteria'));
    assert.ok(!result.includes('{{IDENTITY}}'));
    assert.ok(!result.includes('Images are labeled Image 1'));
  });

  it('evalCriteria replaces default criteria when no promptOverride', () => {
    const result = buildViewEvalPrompt({ ...defaults, evalCriteria: 'CATEGORY SPECIFIC CRITERIA' });
    assert.ok(result.includes('CATEGORY SPECIFIC CRITERIA'));
  });

  it('promptOverride template can still include evalCriteria through CRITERIA', () => {
    const result = buildViewEvalPrompt({
      ...defaults,
      promptOverride: 'OVERRIDE TEMPLATE\n{{CRITERIA}}',
      evalCriteria: 'CATEGORY CRITERIA WINS',
    });
    assert.ok(result.includes('OVERRIDE TEMPLATE'));
    assert.ok(result.includes('CATEGORY CRITERIA WINS'));
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

  it('includes carousel context and duplicate-to-null guidance when previous slots exist', () => {
    const result = buildViewEvalPrompt({
      ...defaults,
      carouselContext: [
        { slot: 'front', filename: 'front-black.png' },
      ],
    });
    const lower = result.toLowerCase();
    assert.ok(result.includes('Existing carousel slots'));
    assert.ok(result.includes('front: front-black.png'));
    assert.ok(lower.includes('not selectable'));
    assert.ok(lower.includes('near-duplicate'));
    assert.ok(lower.includes('null'));
  });

  it('requires per-candidate classification for carousel extras', () => {
    const result = buildViewEvalPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(lower.includes('classify every candidate'));
    assert.ok(lower.includes('actual_view'));
    assert.ok(lower.includes('usable_as_carousel_extra'));
    assert.ok(lower.includes('query intent'));
    assert.ok(lower.includes('meaningfully different'));
    assert.ok(lower.includes('same composition'));
    assert.ok(lower.includes('slight zoom'));
  });

  it('rejects visually distinct sibling variants before ranking view quality', () => {
    const result = buildViewEvalPrompt(defaults);
    const lower = result.toLowerCase();

    assert.ok(lower.includes('variant identity gate'));
    assert.ok(lower.includes('same model is not enough'));
    assert.ok(lower.includes('visually distinct sibling'));
    assert.ok(lower.includes('wrong_product'));
    assert.ok(lower.includes('trust the pixels'));
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

  it('treats promptOverride as a full hero-eval prompt template override', () => {
    const result = buildHeroSelectionPrompt({
      ...defaults,
      promptOverride: 'CUSTOM HERO EVAL {{IDENTITY}}\n{{COUNT_LINE}}\n{{CRITERIA}}\n{{HERO_COUNT}}',
    });
    assert.ok(result.startsWith('CUSTOM HERO EVAL Product: Razer DeathAdder V3'));
    assert.ok(result.includes('You are evaluating 3 hero/marketing image candidates'));
    assert.ok(result.includes('Hero image evaluation criteria'));
    assert.ok(result.includes('3'));
    assert.ok(!result.includes('{{IDENTITY}}'));
    assert.ok(!result.includes('These are hero images for a product page'));
  });

  it('heroCriteria replaces default criteria when no promptOverride', () => {
    const result = buildHeroSelectionPrompt({ ...defaults, heroCriteria: 'CATEGORY HERO CRITERIA' });
    assert.ok(result.includes('CATEGORY HERO CRITERIA'));
  });

  it('promptOverride template can still include heroCriteria through CRITERIA', () => {
    const result = buildHeroSelectionPrompt({
      ...defaults,
      promptOverride: 'OVERRIDE TEMPLATE\n{{CRITERIA}}',
      heroCriteria: 'CATEGORY HERO WINS',
    });
    assert.ok(result.includes('OVERRIDE TEMPLATE'));
    assert.ok(result.includes('CATEGORY HERO WINS'));
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

  it('rejects hero candidates from visually distinct sibling variants', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();

    assert.ok(lower.includes('variant identity gate'));
    assert.ok(lower.includes('same model is not enough'));
    assert.ok(lower.includes('visually distinct sibling'));
    assert.ok(lower.includes('wrong_product'));
    assert.ok(lower.includes('trust the pixels'));
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

  it('keeps lifestyle shots, promotional renders, and kits eligible when they pass gates', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();
    assert.ok(lower.includes('lifestyle'), 'should still allow lifestyle images');
    assert.ok(lower.includes('promotional render'), 'should still allow promotional renders');
    assert.ok(lower.includes('kit'), 'should still allow kit layouts');
  });

  it('rejects isolated cutouts and marketing-collateral lineups as heroes', () => {
    const result = buildHeroSelectionPrompt(defaults);
    const lower = result.toLowerCase();

    assert.ok(lower.includes('isolated cutout'));
    assert.ok(lower.includes('plain') || lower.includes('empty background'));
    assert.ok(lower.includes('marketing collateral'));
    assert.ok(lower.includes('target product') && lower.includes('dominant'));
    assert.ok(lower.includes('small') && lower.includes('secondary'));
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

  it('outranked losers in rejected (no flags) get reasoning in rankings', async () => {
    const mockResponse = {
      winner: { filename: 'top-black.png', reasoning: 'Best' },
      rejected: [{ filename: 'top-black-2.png', reasoning: 'Lower resolution than winner' }],
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/top-black.png', '/images/top-black-2.png'],
      callLlm: async () => ({ result: mockResponse, usage: {} }),
    });
    assert.equal(result.rankings.length, 2);
    const loser = result.rankings.find(r => r.filename === 'top-black-2.png');
    assert.ok(loser);
    assert.equal(loser.best, false);
    assert.deepStrictEqual(loser.flags, []);
    assert.equal(loser.reasoning, 'Lower resolution than winner');
  });

  it('candidates not in winner or rejected are absent from rankings', async () => {
    const mockResponse = {
      winner: { filename: 'top-black.png', reasoning: 'Best' },
      // top-black-2.png not in rejected at all
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

  it('passes existing carousel slots as non-selectable context after candidate images', async () => {
    let capturedArgs = null;
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: ['/images/sangle-black.png', '/images/sangle-black-2.png'],
      imageMetadata: [
        { width: 800, height: 600, bytes: 50000 },
        { width: 700, height: 500, bytes: 45000 },
      ],
      carouselContext: [
        {
          slot: 'front',
          filename: 'front-black.png',
          imagePath: '/images/front-black.png',
          width: 900,
          height: 650,
          bytes: 60000,
        },
      ],
      callLlm: async (args) => {
        capturedArgs = args;
        return {
          result: { winner: { filename: 'sangle-black.png', reasoning: 'distinct from front slot' } },
          usage: {},
        };
      },
    });

    assert.ok(capturedArgs, 'callLlm must receive args');
    assert.equal(capturedArgs.images.length, 3, 'two candidates plus one context thumbnail');
    assert.ok(capturedArgs.userText.includes('Image 1: sangle-black.png'));
    assert.ok(capturedArgs.userText.includes('Existing carousel slots'));
    assert.ok(capturedArgs.userText.includes('Context 1: front: front-black.png'));
    assert.ok(capturedArgs.userText.toLowerCase().includes('not selectable'));
    assert.equal(result.rankings[0].filename, 'sangle-black.png');
    assert.equal(result.rankings[0].best, true);
  });

  it('maps candidate visual classification metadata into rankings', async () => {
    const mockResponse = {
      winner: { filename: 'top-black.png', reasoning: 'Best true top view' },
      candidates: [
        {
          filename: 'top-black.png',
          actual_view: 'top',
          matches_requested_view: true,
          usable_as_required_view: true,
          usable_as_carousel_extra: true,
          quality: 'pass',
          duplicate: false,
          dependency_status: 'aligned',
          dependency_mismatch_keys: [],
          reasoning: 'Clean top view.',
        },
        {
          filename: 'front-search-top.png',
          actual_view: 'top',
          matches_requested_view: false,
          usable_as_required_view: true,
          usable_as_carousel_extra: true,
          quality: 'pass',
          duplicate: false,
          dependency_status: 'mismatch',
          dependency_mismatch_keys: ['connection'],
          reasoning: 'Found by front query but pixels show top view.',
        },
        {
          filename: 'generic-product.png',
          actual_view: 'generic',
          matches_requested_view: false,
          usable_as_required_view: false,
          usable_as_carousel_extra: true,
          quality: 'borderline',
          duplicate: false,
          dependency_status: 'unknown',
          dependency_mismatch_keys: [],
          reasoning: 'Useful generic product cutout.',
        },
      ],
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      imagePaths: [
        '/images/top-black.png',
        '/images/front-search-top.png',
        '/images/generic-product.png',
      ],
      callLlm: async () => ({ result: mockResponse, usage: {} }),
    });
    const top = result.rankings.find(r => r.filename === 'top-black.png');
    const reclassified = result.rankings.find(r => r.filename === 'front-search-top.png');
    const generic = result.rankings.find(r => r.filename === 'generic-product.png');
    assert.equal(top.best, true);
    assert.equal(top.actualView, 'top');
    assert.equal(top.matchesRequestedView, true);
    assert.equal(top.dependencyStatus, 'aligned');
    assert.deepEqual(top.dependencyMismatchKeys, []);
    assert.equal(reclassified.best, false);
    assert.equal(reclassified.actualView, 'top');
    assert.equal(reclassified.matchesRequestedView, false);
    assert.equal(reclassified.usableAsRequiredView, true);
    assert.equal(reclassified.usableAsCarouselExtra, true);
    assert.equal(reclassified.dependencyStatus, 'mismatch');
    assert.deepEqual(reclassified.dependencyMismatchKeys, ['connection']);
    assert.equal(generic.actualView, 'generic');
    assert.equal(generic.quality, 'borderline');
    assert.equal(generic.dependencyStatus, 'unknown');
  });

  it('does not mark a winner best when candidate classification says it is the wrong view', async () => {
    const mockResponse = {
      winner: { filename: 'front-search-top.png', reasoning: 'Looks clean' },
      candidates: [
        {
          filename: 'front-search-top.png',
          actual_view: 'top',
          matches_requested_view: false,
          usable_as_required_view: true,
          usable_as_carousel_extra: true,
          quality: 'pass',
          duplicate: false,
          reasoning: 'Clean image, but it is not the requested front view.',
        },
      ],
    };
    const result = await evaluateViewCandidates({
      ...baseOpts,
      view: 'front',
      imagePaths: ['/images/front-search-top.png'],
      callLlm: async () => ({ result: mockResponse, usage: {} }),
    });
    assert.equal(result.rankings.length, 1);
    assert.equal(result.rankings[0].best, false);
    assert.equal(result.rankings[0].actualView, 'top');
    assert.equal(result.rankings[0].usableAsCarouselExtra, true);
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

  it('persists candidate classification fields by filename match', () => {
    writeTestDoc([
      makeImage({ filename: 'front-search-top.png', view: 'front' }),
    ]);
    const viewResults = new Map([
      ['front', {
        rankings: [
          {
            filename: 'front-search-top.png',
            best: false,
            flags: [],
            reasoning: 'Found during front eval but actual pixels show top.',
            actualView: 'top',
            matchesRequestedView: false,
            usableAsRequiredView: true,
            usableAsCarouselExtra: true,
            duplicate: false,
            quality: 'pass',
            dependencyStatus: 'mismatch',
            dependencyMismatchKeys: ['connection'],
          },
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
    assert.equal(img.eval_best, false);
    assert.equal(img.eval_actual_view, 'top');
    assert.equal(img.eval_matches_requested_view, false);
    assert.equal(img.eval_usable_as_required_view, true);
    assert.equal(img.eval_usable_as_carousel_extra, true);
    assert.equal(img.eval_duplicate, false);
    assert.equal(img.eval_quality, 'pass');
    assert.equal(img.eval_dependency_status, 'mismatch');
    assert.deepEqual(img.eval_dependency_mismatch_keys, ['connection']);
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

  it('hero rejected entries apply eval_flags + eval_reasoning to matching images', () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero' }),
      makeImage({ filename: 'hero-black-2.png', view: 'hero' }),
    ]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults: new Map(),
      heroResults: {
        heroes: [],
        rejected: [
          { filename: 'hero-black.png', reasoning: 'Mouse is not the focal point' },
          { filename: 'hero-black-2.png', flags: ['watermark'], reasoning: 'Getty watermark visible' },
        ],
      },
    });
    const hero1 = result.selected.images.find(i => i.filename === 'hero-black.png');
    const hero2 = result.selected.images.find(i => i.filename === 'hero-black-2.png');
    assert.deepStrictEqual(hero1.eval_flags, []);
    assert.equal(hero1.eval_reasoning, 'Mouse is not the focal point');
    assert.equal(hero1.hero, undefined);
    assert.deepStrictEqual(hero2.eval_flags, ['watermark']);
    assert.equal(hero2.eval_reasoning, 'Getty watermark visible');
  });

  it('hero re-eval clears old eval_flags/eval_reasoning on hero-view images', () => {
    writeTestDoc([
      makeImage({ filename: 'hero-black.png', view: 'hero', eval_flags: ['watermark'], eval_reasoning: 'old rejection' }),
    ]);
    const result = mergeEvaluation({
      productId: PRODUCT_ID,
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      viewResults: new Map(),
      heroResults: { heroes: [{ filename: 'hero-black.png', hero_rank: 1, reasoning: 'Clean and usable' }] },
    });
    const img = result.selected.images[0];
    assert.equal(img.hero, true);
    assert.equal(img.hero_rank, 1);
    // Old rejection flags should be cleared since this hero was now accepted
    assert.equal(img.eval_flags, undefined);
    // Accepted hero gets fresh reasoning from the hero response
    assert.equal(img.eval_reasoning, 'Clean and usable');
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
