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
  };
  const colorNames = ['black', 'white', 'red', 'light-blue', 'dark-green'];
  const colors = [
    { name: 'black', hex: '#000000', css_var: '--color-black' },
    { name: 'white', hex: '#ffffff', css_var: '--color-white' },
    { name: 'red', hex: '#ef4444', css_var: '--color-red' },
    { name: 'light-blue', hex: '#60a5fa', css_var: '--color-light-blue' },
    { name: 'dark-green', hex: '#15803d', css_var: '--color-dark-green' },
  ];

  // ── Content: what MUST be in the prompt ──

  it('includes brand + model (product identity)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('Corsair'), 'brand');
    assert.ok(prompt.includes('M75 Air Wireless'), 'model');
  });

  it('does NOT include category, URLs, or web-browsing instructions', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.equal(prompt.includes('Category:'), false, 'no category label');
    assert.equal(prompt.includes('corsair.com'), false, 'no URLs');
    assert.equal(prompt.includes('Check the manufacturer'), false, 'no web-browsing instructions');
    assert.equal(prompt.includes('Amazon'), false, 'no retailer names');
  });

  it('includes registered color palette with hex values', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('black'), 'color name');
    assert.ok(prompt.includes('#000000'), 'black hex');
    assert.ok(prompt.includes('#ffffff'), 'white hex');
    assert.ok(prompt.includes('#ef4444'), 'red hex');
    assert.ok(prompt.includes('light-blue'), 'compound color name');
  });

  it('includes formatting rules (modifier-first, grey→gray, marketing→atom)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('modifier-first') || prompt.includes('Modifier-first') || prompt.includes('light-blue'), 'modifier naming');
    assert.ok(prompt.includes('grey') || prompt.includes('gray'), 'grey normalization');
  });

  it('includes edition formatting rules (kebab-case)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('kebab-case') || prompt.includes('kebab'), 'edition format');
  });

  it('includes response contract with colors, color_names, editions, default_color', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('colors'), 'colors in contract');
    assert.ok(prompt.includes('color_names'), 'color_names in contract');
    assert.ok(prompt.includes('editions'), 'editions in contract');
    assert.ok(prompt.includes('display_name'), 'display_name in contract');
    assert.ok(prompt.includes('default_color'), 'default_color in contract');
  });

  // ── First run: discovery mode ──

  it('first run: focuses on discovery, no selected state', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product, previousRuns: [] });
    assert.equal(prompt.includes('Currently selected'), false, 'no selected state on first run');
    assert.equal(prompt.includes('Validate'), false, 'no validation directive on first run');
  });

  // ── Subsequent runs: validate + select mode ──

  it('subsequent run: shows currently selected colors + editions', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors, product,
      previousRuns: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        selected: {
          colors: ['black', 'white'],
          editions: { 'launch-edition': { colors: ['black'] } },
          default_color: 'black',
        },
      }],
    });
    assert.ok(prompt.includes('Currently selected'), 'has selected section');
    assert.ok(prompt.includes('black'), 'selected color listed');
    assert.ok(prompt.includes('white'), 'selected color listed');
    assert.ok(prompt.includes('launch-edition'), 'selected edition listed');
  });

  it('subsequent run: shows color marketing names and edition display names in selected section', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors, product,
      previousRuns: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        selected: {
          colors: ['black', 'white+silver'],
          color_names: { 'white+silver': 'Frost White' },
          editions: {
            'cod-bo6-edition': { display_name: 'Call of Duty: Black Ops 6 Edition', colors: ['black+orange'] },
          },
          default_color: 'black',
        },
      }],
    });
    assert.ok(prompt.includes('Frost White'), 'color marketing name in selected section');
    assert.ok(prompt.includes('Call of Duty: Black Ops 6 Edition'), 'edition display name in selected section');
  });

  it('subsequent run: directs LLM to validate, discover, select, omit-to-reject', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors, product,
      previousRuns: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        selected: { colors: ['black'], editions: {}, default_color: 'black' },
      }],
    });
    assert.ok(prompt.includes('replaces') || prompt.includes('definitive'), 'response is authoritative');
    assert.ok(prompt.includes('omit') || prompt.includes('Omit'), 'omit = reject');
  });

  // ── Field studio SSOT wiring ──

  it('sources color guidance from field studio (hex visual similarity matching)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('visual similarity'), 'hex visual similarity from field studio');
    assert.ok(prompt.includes('nearest registered color by hex similarity'), 'hex fallback from field studio');
    assert.ok(prompt.includes('Dominant means the color with the most surface area'), 'dominant color explanation from field studio');
  });

  it('sources edition guidance from field studio (examples + display name rule)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('halo-infinite-edition'), 'edition example slug from field studio');
    assert.ok(prompt.includes('Do not return display names or title case'), 'display name rule from field studio');
  });

  it('includes field studio dynamic prefix group analysis', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(
      prompt.includes('Other colors') || prompt.includes('Additional variants'),
      'field studio dynamic prefix analysis',
    );
  });

  it('strips web-browsing instructions from field studio guidance', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.equal(prompt.includes('manufacturer product page'), false, 'no manufacturer page reference');
    assert.equal(prompt.includes('Best Buy'), false, 'no retailer reference');
    assert.equal(prompt.includes('Newegg'), false, 'no retailer reference');
    assert.equal(prompt.includes('community forums'), false, 'no forums reference');
  });

  // ── Edge cases ──

  it('handles empty colorNames gracefully', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: [], colors: [], product, previousRuns: [] });
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.length > 0);
  });

  it('does not duplicate variant when only full model is present', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors,
      product: { ...product, base_model: '', model: 'M75 Air Wireless White', variant: 'White' },
    });
    assert.ok(prompt.includes('Corsair M75 Air Wireless White'));
    assert.equal(prompt.includes('Corsair M75 Air Wireless White White'), false);
  });
});

describe('COLOR_EDITION_FINDER_SPEC', () => {
  it('has correct phase/reason/role', () => {
    assert.equal(COLOR_EDITION_FINDER_SPEC.phase, 'colorFinder');
    assert.equal(COLOR_EDITION_FINDER_SPEC.reason, 'color_edition_finding');
    assert.equal(COLOR_EDITION_FINDER_SPEC.role, 'triage');
  });

  it('system is a function and jsonSchema has expected properties', () => {
    assert.equal(typeof COLOR_EDITION_FINDER_SPEC.system, 'function');
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.colors);
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.color_names);
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.editions);
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.default_color);
  });
});
