/**
 * Characterization tests for CEF prompt builders — identity warning + siblings.
 *
 * Post-Stage 5: identity warning + siblings are sourced from the unified
 * builder in src/core/llm/prompts/identityContext.js. Wording is the
 * unified text shared across CEF, PIF, RDF. Customization lives in the
 * global prompt registry (globalPrompts.identityWarningMedium etc.).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildColorEditionFinderPrompt,
  buildVariantIdentityCheckPrompt,
} from '../colorEditionLlmAdapter.js';

const PRODUCT = { brand: 'Corsair', model: 'M75 Air Wireless', base_model: 'M75 Air', variant: '' };
const COLORS = [
  { name: 'black', hex: '#000000', css_var: '--color-black' },
  { name: 'white', hex: '#ffffff', css_var: '--color-white' },
];
const COLOR_NAMES = ['black', 'white'];

const REGISTRY = [
  { variant_id: 'v_aaa11111', variant_key: 'color:black', variant_type: 'color', variant_label: 'black', color_atoms: ['black'], edition_slug: null, created_at: '2026-01-01T00:00:00Z' },
];

/* ── buildColorEditionFinderPrompt: identity warning matrix ────────── */

describe('buildColorEditionFinderPrompt — identity warning characterization', () => {
  it('familyModelCount=1 emits positive "no known siblings" line (easy tier)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: COLOR_NAMES, colors: COLORS, product: PRODUCT, familyModelCount: 1, ambiguityLevel: 'easy' });
    assert.ok(prompt.includes('no known siblings'));
    assert.ok(!prompt.includes('CAUTION'));
    assert.ok(!prompt.includes('HIGH AMBIGUITY'));
  });

  it('familyModelCount=2 + medium emits CAUTION with count + brand + model + fieldDomainNoun', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: COLOR_NAMES, colors: COLORS, product: PRODUCT, familyModelCount: 2, ambiguityLevel: 'medium' });
    assert.ok(prompt.includes('CAUTION'));
    assert.ok(prompt.includes('2 models'));
    assert.ok(prompt.includes('Corsair'));
    assert.ok(prompt.includes('M75 Air Wireless'));
    assert.ok(prompt.includes('colors or editions'));
  });

  it('familyModelCount=5 + hard emits HIGH AMBIGUITY with TRIPLE-CHECK', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: COLOR_NAMES, colors: COLORS, product: PRODUCT, familyModelCount: 5, ambiguityLevel: 'hard' });
    assert.ok(prompt.includes('HIGH AMBIGUITY'));
    assert.ok(prompt.includes('TRIPLE-CHECK'));
    assert.ok(prompt.includes('5 models'));
    assert.ok(prompt.includes('M75 Air Wireless'));
    assert.ok(prompt.includes('colors or editions'));
  });

  it('identity warning scopes to the exact model (quoted) for medium tier', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: COLOR_NAMES, colors: COLORS, product: PRODUCT, familyModelCount: 2, ambiguityLevel: 'medium' });
    assert.ok(prompt.includes('"M75 Air Wireless"'));
  });
});

describe('buildColorEditionFinderPrompt — siblings exclusion characterization', () => {
  it('no siblings + familyModelCount=1 emits no sibling exclusion line', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: COLOR_NAMES, colors: COLORS, product: PRODUCT, familyModelCount: 1, siblingModels: [] });
    assert.ok(!prompt.includes('This product is NOT'));
  });

  it('siblings + familyModelCount=2 emits unified exclusion line', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames: COLOR_NAMES, colors: COLORS, product: PRODUCT,
      familyModelCount: 2, ambiguityLevel: 'medium',
      siblingModels: ['M75 RGB', 'M75 Wireless'],
    });
    assert.ok(prompt.includes('CAUTION'));
    assert.ok(prompt.includes('This product is NOT: M75 RGB, M75 Wireless'));
    assert.ok(prompt.includes('Do not use colors or editions from those models'));
  });

  it('empty siblings but high familyModelCount still emits CAUTION without sibling list', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames: COLOR_NAMES, colors: COLORS, product: PRODUCT,
      familyModelCount: 3, ambiguityLevel: 'medium',
      siblingModels: [],
    });
    assert.ok(prompt.includes('CAUTION'));
    assert.ok(!prompt.includes('This product is NOT'));
  });
});

/* ── buildVariantIdentityCheckPrompt: identity warning matrix ──────── */

describe('buildVariantIdentityCheckPrompt — identity warning characterization', () => {
  it('familyModelCount=1 emits "no known siblings" line (easy tier)', () => {
    const prompt = buildVariantIdentityCheckPrompt({
      product: PRODUCT, existingRegistry: REGISTRY,
      newColors: ['black'], newColorNames: {}, newEditions: {},
      familyModelCount: 1, ambiguityLevel: 'easy',
    });
    assert.ok(prompt.includes('no known siblings'));
    assert.ok(!prompt.includes('CAUTION'));
    assert.ok(!prompt.includes('HIGH AMBIGUITY'));
  });

  it('familyModelCount=2 + medium emits CAUTION with count + model + fieldDomainNoun', () => {
    const prompt = buildVariantIdentityCheckPrompt({
      product: PRODUCT, existingRegistry: REGISTRY,
      newColors: ['black'], newColorNames: {}, newEditions: {},
      familyModelCount: 2, ambiguityLevel: 'medium',
    });
    assert.ok(prompt.includes('CAUTION'));
    assert.ok(prompt.includes('2 models'));
    assert.ok(prompt.includes('M75 Air Wireless'));
    assert.ok(prompt.includes('colors or editions'));
  });

  it('familyModelCount=4 + hard emits HIGH AMBIGUITY + TRIPLE-CHECK', () => {
    const prompt = buildVariantIdentityCheckPrompt({
      product: PRODUCT, existingRegistry: REGISTRY,
      newColors: ['black'], newColorNames: {}, newEditions: {},
      familyModelCount: 4, ambiguityLevel: 'hard',
    });
    assert.ok(prompt.includes('HIGH AMBIGUITY'));
    assert.ok(prompt.includes('TRIPLE-CHECK'));
    assert.ok(prompt.includes('4 models'));
    assert.ok(prompt.includes('colors or editions'));
  });

  it('CAUTION + siblings emits unified exclusion line', () => {
    const prompt = buildVariantIdentityCheckPrompt({
      product: PRODUCT, existingRegistry: REGISTRY,
      newColors: ['black'], newColorNames: {}, newEditions: {},
      familyModelCount: 2, ambiguityLevel: 'medium',
      siblingModels: ['M75 RGB', 'M75 Wireless'],
    });
    assert.ok(prompt.includes('This product is NOT: M75 RGB, M75 Wireless'));
    assert.ok(prompt.includes('Do not use colors or editions from those models'));
  });
});
