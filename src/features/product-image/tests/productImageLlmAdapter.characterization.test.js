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
const PRIORITY_VIEWS = [
  { key: 'top', description: 'Bird\'s-eye shot from above' },
  { key: 'left', description: 'Side profile from the left' },
];
const ADDITIONAL_VIEWS = [
  { key: 'bottom', description: 'Underside view' },
];

// ── buildProductImageFinderPrompt ─────────────────────────────────────────────

describe('buildProductImageFinderPrompt — characterization', () => {

  it('is a function that returns a string', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 100);
  });

  it('includes brand and model in identity section', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('Logitech'));
    assert.ok(result.includes('G502 X Plus'));
    assert.ok(result.includes('IDENTITY'));
  });

  it('includes variant description for color type', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', variantType: 'color', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('"black" color variant'));
  });

  it('includes variant description for edition type', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'cod-bo6', variantType: 'edition', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('"cod-bo6" edition'));
  });

  it('includes priority views section', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('PRIORITY'));
    assert.ok(result.includes('"top"'));
    assert.ok(result.includes('"left"'));
    assert.ok(result.includes('Bird\'s-eye shot'));
  });

  it('includes additional views section', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('ADDITIONAL'));
    assert.ok(result.includes('"bottom"'));
  });

  it('includes all canonical view keys', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('top, bottom, left, right, front, rear, sangle, angle'));
  });

  it('includes image requirements section when no override', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('Image requirements:'));
    assert.ok(result.includes('Clean product shot'));
    assert.ok(result.includes('View slot rule'));
    assert.ok(result.includes('Query intent is not view evidence'));
    assert.ok(result.includes('Multiple unique clean images for the same actual view are useful'));
    assert.ok(result.includes('DIRECT link'));
    assert.ok(result.includes('NOT: lifestyle photos'));
  });

  it('includes product image identity facts when provided', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT,
      variantLabel: 'black',
      priorityViews: PRIORITY_VIEWS,
      additionalViews: ADDITIONAL_VIEWS,
      productImageIdentityFacts: [
        { fieldKey: 'connection', label: 'Connection', value: 'wired' },
      ],
    });
    assert.ok(result.includes('Product image identity facts'));
    assert.ok(result.includes('connection: wired'));
    assert.ok(result.includes('source-identity filters'));
  });

  it('treats promptOverride as a full prompt template override', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS,
      promptOverride: 'CUSTOM TEMPLATE {{BRAND}} {{MODEL}}\n{{PRODUCT_IMAGE_IDENTITY_FACTS}}\n{{PRIORITY_VIEWS}}\n{{IMAGE_REQUIREMENTS}}\n{{ALL_VIEW_KEYS}}',
      productImageIdentityFacts: [
        { fieldKey: 'connection', label: 'Connection', value: 'wired' },
      ],
    });
    assert.ok(result.startsWith('CUSTOM TEMPLATE Logitech G502 X Plus'));
    assert.ok(result.includes('connection: wired'));
    assert.ok(result.includes('PRIORITY'));
    assert.ok(result.includes('Image requirements:'));
    assert.ok(result.includes('View slot rule'));
    assert.ok(result.includes('top, bottom, left, right, front, rear, sangle, angle'));
    assert.ok(!result.includes('{{BRAND}}'));
    assert.ok(!result.includes('{{IMAGE_REQUIREMENTS}}'));
    assert.ok(!result.includes('Find high-resolution product images for:'));
  });

  it('includes identity warning for easy ambiguity', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS, ambiguityLevel: 'easy' });
    assert.ok(result.includes('no known siblings'));
  });

  it('includes identity warning for medium ambiguity', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS,
      familyModelCount: 5, ambiguityLevel: 'medium',
    });
    assert.ok(result.includes('CAUTION'));
    assert.ok(result.includes('5 models'));
  });

  it('includes identity warning for hard ambiguity', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS,
      familyModelCount: 10, ambiguityLevel: 'hard',
    });
    assert.ok(result.includes('HIGH AMBIGUITY'));
    assert.ok(result.includes('TRIPLE-CHECK'));
  });

  it('includes unified sibling exclusion line when siblings provided', () => {
    // Wording sourced from src/core/llm/prompts/globalPromptRegistry.js::siblingsExclusion.
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS,
      siblingsExcluded: ['G502 Hero', 'G502 SE'],
    });
    assert.ok(result.includes('This product is NOT: G502 Hero, G502 SE'));
    assert.ok(result.includes('Do not use product images from those models'));
  });

  it('omits sibling line when no siblings', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS, siblingsExcluded: [] });
    assert.ok(!result.includes('This product is NOT'));
  });

  it('includes previous discovery section when provided', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS,
      previousDiscovery: { urlsChecked: ['https://example.com/img1.jpg'], queriesRun: ['logitech g502 x plus black'] },
    });
    assert.ok(result.includes('Previous searches'));
    assert.ok(result.includes('https://example.com/img1.jpg'));
    assert.ok(result.includes('logitech g502 x plus black'));
  });

  it('omits previous discovery section when empty', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(!result.includes('Previous searches'));
  });

  it('includes JSON return format', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('Return JSON'));
    assert.ok(result.includes('"images"'));
    assert.ok(result.includes('"discovery_log"'));
  });

  it('includes search strategy section', () => {
    const result = buildProductImageFinderPrompt({ product: PRODUCT, variantLabel: 'black', priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS });
    assert.ok(result.includes('Search strategy'));
  });

  it('renders priority views in caller-supplied order', () => {
    const ordered = [
      { key: 'angle', description: 'Rear/top 3/4' },
      { key: 'top',   description: 'Bird\'s-eye' },
      { key: 'left',  description: 'Side profile' },
    ];
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      priorityViews: ordered, additionalViews: [],
    });
    const angleIdx = result.indexOf('"angle"');
    const topIdx   = result.indexOf('"top"');
    const leftIdx  = result.indexOf('"left"');
    assert.ok(angleIdx > 0 && topIdx > 0 && leftIdx > 0, 'all three keys must appear');
    assert.ok(angleIdx < topIdx, 'angle must render before top');
    assert.ok(topIdx < leftIdx, 'top must render before left');
  });

  it('omits ADDITIONAL section when additionalViews is empty', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      priorityViews: PRIORITY_VIEWS, additionalViews: [],
    });
    assert.ok(!result.includes('ADDITIONAL'), 'no ADDITIONAL header when hints list is empty');
  });

  it('omits "For additional views" guidance sentence when additionalViews is empty', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      priorityViews: PRIORITY_VIEWS, additionalViews: [],
    });
    assert.ok(!result.includes('For additional views'), 'guidance line omitted when no hints');
    // Priority guidance stays.
    assert.ok(result.includes('For each priority view'));
  });

  it('includes "For additional views" guidance sentence when hints exist', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      priorityViews: PRIORITY_VIEWS, additionalViews: ADDITIONAL_VIEWS,
    });
    assert.ok(result.includes('For additional views, include any clean product shots'));
  });

  it('ADDITIONAL section shows only supplied hint views, no auto-dump', () => {
    const result = buildProductImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      priorityViews: [{ key: 'top', description: 'Bird\'s-eye' }],
      additionalViews: [{ key: 'rear', description: 'Back of product' }],
    });
    assert.ok(result.includes('ADDITIONAL'));
    assert.ok(result.includes('"rear"'));
    // Views NOT passed as priority or hints must not appear in the structured sections.
    const structuralSections = result.split('Every image you return MUST')[0];
    assert.ok(!structuralSections.includes('"bottom"'));
    assert.ok(!structuralSections.includes('"right"'));
    assert.ok(!structuralSections.includes('"front"'));
    assert.ok(!structuralSections.includes('"sangle"'));
    assert.ok(!structuralSections.includes('"angle"'));
    assert.ok(!structuralSections.includes('"left"'));
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

  it('treats hero discovery as broad lead-image candidate gathering', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.ok(result.includes('product-page hero image'));
    assert.ok(result.includes('studio'));
    assert.ok(result.includes('cutout'));
    assert.ok(result.includes('lifestyle'));
    assert.ok(result.includes('kit layout'));
    assert.ok(result.includes('Corsair-style product cards'));
    assert.ok(result.includes('card crop'));
    assert.ok(result.includes('original source image'));
    assert.ok(result.includes('Ordinary flat catalog view-slot shots'));
    assert.ok(result.includes('technical/detail documentation'));
    assert.ok(!result.includes('These are NOT cutout/studio shots'));
    assert.ok(!result.includes('White or plain background studio cutouts'));
    assert.ok(!result.includes('cannot find a contextual lifestyle shot'));
    assert.ok(!result.includes('feet/skate'));
  });

  it('includes hard rejects section', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.ok(result.includes('DO NOT RETURN'));
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

  it('includes unified sibling exclusion when provided', () => {
    // Wording sourced from src/core/llm/prompts/globalPromptRegistry.js::siblingsExclusion.
    const result = buildHeroImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      siblingsExcluded: ['G502 Hero'],
    });
    assert.ok(result.includes('This product is NOT: G502 Hero'));
    assert.ok(result.includes('Do not use product images from those models'));
  });

  it('includes previous discovery when provided', () => {
    const result = buildHeroImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      previousDiscovery: { urlsChecked: ['https://example.com'], queriesRun: ['query1'] },
    });
    assert.ok(result.includes('Previous searches'));
    assert.ok(result.includes('https://example.com'));
  });

  it('treats promptOverride as a full hero prompt template override', () => {
    const result = buildHeroImageFinderPrompt({
      product: PRODUCT, variantLabel: 'black',
      promptOverride: 'CUSTOM HERO TEMPLATE {{BRAND}} {{MODEL}}\n{{HERO_INSTRUCTIONS}}\n{{DISCOVERY_LOG_SHAPE}}',
    });
    assert.ok(result.startsWith('CUSTOM HERO TEMPLATE Logitech G502 X Plus'));
    assert.ok(result.includes('GOOD HERO CANDIDATES'));
    assert.ok(result.includes('discovery_log'));
    assert.ok(!result.includes('{{BRAND}}'));
    assert.ok(!result.includes('{{HERO_INSTRUCTIONS}}'));
    assert.ok(!result.includes('Every image you return MUST use the view name "hero".'));
  });

  it('includes JSON return format', () => {
    const result = buildHeroImageFinderPrompt({ product: PRODUCT, variantLabel: 'black' });
    assert.ok(result.includes('Return JSON'));
    assert.ok(result.includes('"images"'));
    assert.ok(result.includes('"discovery_log"'));
  });
});
