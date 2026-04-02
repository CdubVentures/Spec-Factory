import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildColorEditionFinderPrompt,
  COLOR_EDITION_FINDER_SPEC,
} from '../colorEditionLlmAdapter.js';

describe('buildColorEditionFinderPrompt', () => {
  const product = {
    product_id: 'mouse-001',
    category: 'mouse',
    brand: 'Corsair',
    model: 'M75 Air Wireless',
    variant: '',
    seed_urls: ['https://corsair.com/m75'],
  };
  const colorNames = ['black', 'white', 'red', 'light-blue', 'dark-green'];
  const colors = [
    { name: 'black', hex: '#000000', css_var: '--color-black' },
    { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    { name: 'light-blue', hex: '#60a5fa', css_var: '--color-light-blue' },
    { name: 'dark-green', hex: '#15803d', css_var: '--color-dark-green' },
  ];

  it('includes product identity in prompt', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('Corsair'), 'brand');
    assert.ok(prompt.includes('M75 Air Wireless'), 'model');
    assert.ok(prompt.includes('mouse'), 'category');
  });

  it('includes registered colors as preferred enum', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('black'));
    assert.ok(prompt.includes('white'));
    assert.ok(prompt.includes('light-blue'));
  });

  it('includes color extraction guidance (reasoning note)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    // The reasoning note includes modifier-first naming guidance
    assert.ok(prompt.includes('modifier-first') || prompt.includes('light-') || prompt.includes('Modifier'));
  });

  it('includes edition extraction guidance', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('kebab-case') || prompt.includes('editions'));
  });

  it('includes new_colors instruction', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('new_colors') || prompt.includes('hex'));
  });

  it('includes seed URLs when available', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('corsair.com'));
  });

  it('includes hex values for registered colors', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('#000000'), 'black hex');
    assert.ok(prompt.includes('#ffffff'), 'white hex');
    assert.ok(prompt.includes('#ef4444'), 'red hex');
  });

  it('reads extraction guidance from field rules SSOT (not hardcoded)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    // Color guidance from buildColorReasoningNote via getEgPresetForKey
    assert.ok(prompt.includes('Discover every color variant'), 'color discovery instruction');
    assert.ok(prompt.includes('dominant visual order'), 'dominant-first explanation');
    // Edition guidance from buildEgEditionFieldRule via getEgPresetForKey
    assert.ok(prompt.includes('special, limited, or collaboration edition'), 'edition discovery instruction');
    assert.ok(prompt.includes('kebab-case'), 'edition formatting');
  });

  it('handles empty colorNames gracefully', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: [], colors: [], product });
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.length > 0);
  });
});

describe('COLOR_EDITION_FINDER_SPEC', () => {
  it('has correct phase', () => {
    assert.equal(COLOR_EDITION_FINDER_SPEC.phase, 'colorFinder');
  });

  it('has correct reason', () => {
    assert.equal(COLOR_EDITION_FINDER_SPEC.reason, 'color_edition_finding');
  });

  it('has correct role', () => {
    assert.equal(COLOR_EDITION_FINDER_SPEC.role, 'triage');
  });

  it('system is a function (dynamic prompt)', () => {
    assert.equal(typeof COLOR_EDITION_FINDER_SPEC.system, 'function');
  });

  it('jsonSchema is an object', () => {
    assert.equal(typeof COLOR_EDITION_FINDER_SPEC.jsonSchema, 'object');
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties);
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.colors);
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.editions);
  });
});
