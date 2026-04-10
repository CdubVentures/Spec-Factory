import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildColorEditionFinderPrompt,
  accumulateUrlsChecked,
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

  // ── Core content ──

  it('includes brand + model in target line', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('Corsair'), 'brand');
    assert.ok(prompt.includes('M75 Air Wireless'), 'model');
  });

  it('includes identity rule referencing the model', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('IDENTITY'), 'identity section present');
    assert.ok(prompt.includes('"Corsair M75 Air Wireless"'), 'model quoted in identity rule');
  });

  it('includes registered color palette with hex values', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('#000000'), 'black hex');
    assert.ok(prompt.includes('#ffffff'), 'white hex');
    assert.ok(prompt.includes('light-blue'), 'compound color name');
  });

  it('includes color formatting rules (modifier-first, grey→gray)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('Modifier-first') || prompt.includes('modifier-first'), 'modifier naming');
    assert.ok(prompt.includes('grey') && prompt.includes('gray'), 'grey normalization');
  });

  it('includes edition formatting rules (kebab-case)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('kebab-case'), 'edition format');
  });

  it('includes response contract with all fields', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('colors'), 'colors in contract');
    assert.ok(prompt.includes('color_names'), 'color_names in contract');
    assert.ok(prompt.includes('editions'), 'editions in contract');
    assert.ok(prompt.includes('display_name'), 'display_name in contract');
    assert.ok(prompt.includes('default_color'), 'default_color in contract');
    assert.ok(prompt.includes('siblings_excluded'), 'siblings_excluded in contract');
    assert.ok(prompt.includes('discovery_log'), 'discovery_log in contract');
  });

  it('does NOT include SKU fields (SKU-free)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.equal(prompt.includes('color_skus'), false, 'no color_skus');
    assert.equal(prompt.includes('known_sku'), false, 'no known_sku');
  });

  it('includes search instructions with multiple approaches', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('HOW TO SEARCH'), 'has search instructions');
    assert.ok(prompt.includes('Amazon') || prompt.includes('retailer'), 'mentions retailers');
    assert.ok(prompt.includes('limited edition') || prompt.includes('special edition'), 'mentions editions search');
  });

  // ── First run: empty known inputs ──

  it('first run: known_colors is empty', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product, previousRuns: [] });
    assert.ok(prompt.includes('known_colors: []'), 'known_colors empty');
  });

  // ── Subsequent run: known inputs from previous run ──

  it('subsequent run: injects known_colors from previous selected', () => {
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
    assert.ok(prompt.includes('known_colors'), 'known_colors input');
    assert.ok(prompt.includes('black'), 'known color value');
    assert.ok(prompt.includes('white'), 'known color value');
  });

  it('subsequent run: injects known_editions from previous selected', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors, product,
      previousRuns: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        selected: {
          colors: ['black'],
          editions: { 'launch-edition': { colors: ['black'] }, 'cyberpunk-2077-edition': { colors: ['black'] } },
          default_color: 'black',
        },
      }],
    });
    assert.ok(prompt.includes('known_editions'), 'known_editions input');
    assert.ok(prompt.includes('launch-edition'), 'known edition slug');
    assert.ok(prompt.includes('cyberpunk-2077-edition'), 'known edition slug');
  });

  it('subsequent run: injects known_color_names from previous selected', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors, product,
      previousRuns: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        selected: {
          colors: ['black', 'white+silver'],
          color_names: { 'white+silver': 'Frost White' },
          editions: {},
          default_color: 'black',
        },
      }],
    });
    assert.ok(prompt.includes('known_color_names'), 'known_color_names input');
    assert.ok(prompt.includes('Frost White'), 'known color marketing name');
  });

  it('subsequent run: injects urls_already_checked from previous discovery_log', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors, product,
      previousRuns: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        selected: { colors: ['black'], editions: {}, default_color: 'black' },
        response: {
          colors: ['black'], editions: {}, default_color: 'black',
          discovery_log: {
            confirmed_from_known: [], added_new: ['black'], rejected_from_known: [],
            urls_checked: ['https://corsair.com/m75', 'https://amazon.com/dp/B123'],
            queries_run: [],
          },
        },
      }],
    });
    assert.ok(prompt.includes('urls_already_checked'), 'urls_already_checked input');
    assert.ok(prompt.includes('https://corsair.com/m75'), 'url from previous run');
  });

  // ── Edge cases ──

  it('handles empty colorNames gracefully', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: [], colors: [], product, previousRuns: [] });
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.length > 0);
  });

  it('prompt is compact (under 8000 chars with small palette)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.length < 8000, `prompt is ${prompt.length} chars, should be under 8000`);
  });
});

describe('accumulateUrlsChecked', () => {
  it('returns empty arrays for empty runs', () => {
    const result = accumulateUrlsChecked([]);
    assert.deepEqual(result.urlsAlreadyChecked, []);
    assert.deepEqual(result.domainsAlreadyChecked, []);
  });

  it('extracts urls and domains from single run', () => {
    const result = accumulateUrlsChecked([{
      run_number: 1,
      response: {
        discovery_log: {
          urls_checked: ['https://corsair.com/m75', 'https://amazon.com/dp/B123'],
        },
      },
    }]);
    assert.deepEqual(result.urlsAlreadyChecked, ['https://corsair.com/m75', 'https://amazon.com/dp/B123']);
    assert.ok(result.domainsAlreadyChecked.includes('corsair.com'), 'corsair domain');
    assert.ok(result.domainsAlreadyChecked.includes('amazon.com'), 'amazon domain');
  });

  it('unions urls across multiple runs, no duplicates', () => {
    const result = accumulateUrlsChecked([
      {
        run_number: 1,
        response: {
          discovery_log: {
            urls_checked: ['https://corsair.com/m75', 'https://amazon.com/dp/B123'],
          },
        },
      },
      {
        run_number: 2,
        response: {
          discovery_log: {
            urls_checked: ['https://corsair.com/m75', 'https://bestbuy.com/sku/123'],
          },
        },
      },
    ]);
    assert.equal(result.urlsAlreadyChecked.length, 3, '3 unique urls');
    assert.ok(result.urlsAlreadyChecked.includes('https://bestbuy.com/sku/123'));
    assert.ok(result.domainsAlreadyChecked.includes('bestbuy.com'));
  });

  it('handles runs without discovery_log gracefully (v1 backward compat)', () => {
    const result = accumulateUrlsChecked([
      { run_number: 1, response: { colors: ['black'] } },
      { run_number: 2, response: {} },
      { run_number: 3 },
    ]);
    assert.deepEqual(result.urlsAlreadyChecked, []);
    assert.deepEqual(result.domainsAlreadyChecked, []);
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

  it('jsonSchema includes siblings_excluded and discovery_log', () => {
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.siblings_excluded, 'siblings_excluded in schema');
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.discovery_log, 'discovery_log in schema');
  });
});
