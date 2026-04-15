/**
 * Characterization tests for PIF prompt builders.
 * WHY: Lock down current output BEFORE template extraction refactoring.
 * These tests assert key phrases that MUST survive the refactoring.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProductImageFinderPrompt,
  buildHeroImageFinderPrompt,
} from '../productImageLlmAdapter.js';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const PRODUCT = { brand: 'Logitech', model: 'G502 X Plus', base_model: 'G502 X', variant: 'black' };
const VIEW_CONFIG = [
  { key: 'top', priority: true, description: 'Bird\'s-eye shot from above' },
  { key: 'left', priority: true, description: 'Side profile from the left' },
  { key: 'bottom', priority: false, description: 'Underside view' },
];

// ── buildProductImageFinderPrompt ─────────────────────────────────────────────

describe('buildProductImageFinderPrompt — characterization', () => {

  it('is a function that returns a string', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 100);
  });

  it('includes brand and model in identity section', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('Logitech'));
    assert.ok(result.includes('G502 X Plus'));
    assert.ok(result.includes('IDENTITY'));
  });

  it('includes variant description for color type', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', variantType: 'color', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('"black" color variant'));
  });

  it('includes variant description for edition type', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'cod-bo6', variantType: 'edition', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('"cod-bo6" edition'));
  });

  it('includes priority views section', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('PRIORITY'));
    assert.ok(result.includes('"top"'));
    assert.ok(result.includes('"left"'));
    assert.ok(result.includes('Bird\'s-eye shot'));
  });

  it('includes additional views section', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('ADDITIONAL'));
    assert.ok(result.includes('"bottom"'));
  });

  it('includes all canonical view keys', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('top, bottom, left, right, front, rear, sangle, angle'));
  });

  it('includes image requirements section when no override', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('Image requirements:'));
    assert.ok(result.includes('Clean product shot'));
    assert.ok(result.includes('DIRECT link'));
  });

  it('replaces image requirements with promptOverride', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG,
      promptOverride: 'CUSTOM INSTRUCTIONS HERE',
    });
    assert.ok(result.includes('CUSTOM INSTRUCTIONS HERE'));
    assert.ok(!result.includes('Image requirements:'));
  });

  it('includes identity warning for easy ambiguity', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG, ambiguityLevel: 'easy' });
    assert.ok(result.includes('no known siblings'));
  });

  it('includes identity warning for medium ambiguity', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG,
      familyModelCount: 5, ambiguityLevel: 'medium',
    });
    assert.ok(result.includes('CAUTION'));
    assert.ok(result.includes('5 models'));
  });

  it('includes identity warning for hard ambiguity', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG,
      familyModelCount: 10, ambiguityLevel: 'hard',
    });
    assert.ok(result.includes('HIGH AMBIGUITY'));
    assert.ok(result.includes('TRIPLE-CHECK'));
  });

  it('includes sibling exclusion line when siblings provided', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG,
      siblingsExcluded: ['G502 Hero', 'G502 SE'],
    });
    assert.ok(result.includes('Known sibling models to EXCLUDE'));
    assert.ok(result.includes('G502 Hero'));
    assert.ok(result.includes('G502 SE'));
  });

  it('omits sibling line when no siblings', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG, siblingsExcluded: [] });
    assert.ok(!result.includes('Known sibling models to EXCLUDE'));
  });

  it('includes previous discovery section when provided', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG,
      previousDiscovery: { urlsChecked: ['https://example.com/img1.jpg'], queriesRun: ['logitech g502 x plus black'] },
    });
    assert.ok(result.includes('Previous searches'));
    assert.ok(result.includes('https://example.com/img1.jpg'));
    assert.ok(result.includes('logitech g502 x plus black'));
  });

  it('omits previous discovery section when empty', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.ok(!result.includes('Previous searches'));
  });

  it('includes JSON return format', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('Return JSON'));
    assert.ok(result.includes('"images"'));
    assert.ok(result.includes('"discovery_log"'));
  });

  it('includes search strategy section', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', viewConfig: VIEW_CONFIG });
    assert.ok(result.includes('Search strategy'));
  });
});

// ── buildHeroImageFinderPrompt ────────────────────────────────────────────────

describe('buildHeroImageFinderPrompt — characterization', () => {

  it('is a function that returns a string', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 100);
  });

  it('includes brand and model in identity section', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.ok(result.includes('Logitech'));
    assert.ok(result.includes('G502 X Plus'));
    assert.ok(result.includes('IDENTITY'));
  });

  it('includes lifestyle/contextual guidance', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.ok(result.includes('lifestyle') || result.includes('contextual'));
    assert.ok(result.includes('IN CONTEXT') || result.includes('real-world environment') || result.includes('desk'));
  });

  it('includes hard rejects section', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.ok(result.includes('HARD REJECTS') || result.includes('do NOT return'));
    assert.ok(result.includes('watermark') || result.includes('Watermarks'));
  });

  it('uses hero view name', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.ok(result.includes('"hero"'));
  });

  it('includes identity warning for easy ambiguity', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', ambiguityLevel: 'easy' });
    assert.ok(result.includes('no known siblings'));
  });

  it('includes identity warning for hard ambiguity', () => {
    const result = buildHeroImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      familyModelCount: 8, ambiguityLevel: 'hard',
    });
    assert.ok(result.includes('HIGH AMBIGUITY'));
    assert.ok(result.includes('TRIPLE-CHECK'));
  });

  it('includes sibling exclusion when provided', () => {
    const result = buildHeroImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      siblingsExcluded: ['G502 Hero'],
    });
    assert.ok(result.includes('EXCLUDE'));
    assert.ok(result.includes('G502 Hero'));
  });

  it('includes previous discovery when provided', () => {
    const result = buildHeroImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      previousDiscovery: { urlsChecked: ['https://example.com'], queriesRun: ['query1'] },
    });
    assert.ok(result.includes('Previous searches'));
    assert.ok(result.includes('https://example.com'));
  });

  it('replaces instructions with promptOverride', () => {
    const result = buildHeroImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      promptOverride: 'MY CUSTOM HERO INSTRUCTIONS',
    });
    assert.ok(result.includes('MY CUSTOM HERO INSTRUCTIONS'));
    assert.ok(!result.includes('WHAT MAKES A GOOD HERO IMAGE'));
  });

  it('includes JSON return format', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.ok(result.includes('Return JSON'));
    assert.ok(result.includes('"images"'));
    assert.ok(result.includes('"discovery_log"'));
  });
});
