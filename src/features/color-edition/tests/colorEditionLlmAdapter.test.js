import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildColorEditionFinderPrompt,
  COLOR_EDITION_FINDER_SPEC,
  buildVariantIdentityCheckPrompt,
  VARIANT_IDENTITY_CHECK_SPEC,
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

  it('includes brand + model in target line', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('Corsair'), 'brand');
    assert.ok(prompt.includes('M75 Air Wireless'), 'model');
  });

  it('includes identity constraint with quoted product name', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('"Corsair M75 Air Wireless"'), 'quoted product name');
    assert.ok(prompt.includes('siblings_excluded'), 'mentions siblings_excluded');
  });

  it('includes registered color palette with hex values', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('#000000'), 'black hex');
    assert.ok(prompt.includes('#ffffff'), 'white hex');
    assert.ok(prompt.includes('light-blue'), 'compound color name');
  });

  it('includes color formatting rules (modifier-first, grey→gray)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('modifier-first') || prompt.includes('Modifier-first'), 'modifier naming');
    assert.ok(prompt.includes('grey') && prompt.includes('gray'), 'grey normalization');
  });

  it('includes edition formatting rules (kebab-case)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('kebab-case'), 'edition format');
  });

  it('includes response contract fields', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('colors'), 'colors');
    assert.ok(prompt.includes('color_names'), 'color_names');
    assert.ok(prompt.includes('editions'), 'editions');
    assert.ok(prompt.includes('display_name'), 'display_name');
    assert.ok(prompt.includes('default_color'), 'default_color');
    assert.ok(prompt.includes('siblings_excluded'), 'siblings_excluded');
    assert.ok(prompt.includes('discovery_log'), 'discovery_log');
  });

  it('does NOT include SKU fields', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.equal(prompt.includes('color_skus'), false, 'no color_skus');
    assert.equal(prompt.includes('known_sku'), false, 'no known_sku');
  });

  it('mentions collaboration/limited editions and retailers', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('collaboration') || prompt.includes('limited'), 'mentions edition types');
    assert.ok(prompt.includes('retailer'), 'mentions retailers');
  });

  it('first run: no known findings section', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product, previousRuns: [] });
    assert.equal(prompt.includes('Previous findings'), false, 'no known section on first run');
  });

  it('subsequent run: injects known colors and editions from previous selected', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors, product,
      previousRuns: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        selected: {
          colors: ['black', 'white'],
          color_names: { 'white': 'Frost White' },
          editions: { 'launch-edition': { colors: ['black'] }, 'cod-bo6-edition': { colors: ['black'] } },
          default_color: 'black',
        },
      }],
    });
    assert.ok(prompt.includes('Previous findings'), 'has known section');
    assert.ok(prompt.includes('black'), 'known color');
    assert.ok(prompt.includes('white'), 'known color');
    assert.ok(prompt.includes('Frost White'), 'known color name');
    assert.ok(prompt.includes('launch-edition'), 'known edition');
    assert.ok(prompt.includes('cod-bo6-edition'), 'known edition');
  });

  it('subsequent run: does NOT inject urls from previous discovery_log', () => {
    const prompt = buildColorEditionFinderPrompt({
      colorNames, colors, product,
      previousRuns: [{
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        selected: { colors: ['black'], editions: {}, default_color: 'black' },
        response: {
          colors: ['black'], editions: {}, default_color: 'black',
          discovery_log: {
            confirmed_from_known: [], added_new: ['black'], rejected_from_known: [],
            urls_checked: ['https://corsair.com/m75'],
            queries_run: [],
          },
        },
      }],
    });
    assert.ok(!prompt.includes('https://corsair.com/m75'), 'urls must not be fed forward');
    assert.ok(!prompt.includes('urls already checked'), 'no urls section in prompt');
  });

  it('handles empty colorNames gracefully', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames: [], colors: [], product, previousRuns: [] });
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.length > 0);
  });

  it('injects the shared value-confidence rubric for overall per-item confidence', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.includes('Overall confidence'), 'rubric heading present');
    assert.ok(prompt.includes('90+'), 'rubric band 90+ present');
    assert.ok(prompt.includes('30-49'), 'rubric band 30-49 present');
    assert.ok(prompt.toLowerCase().includes('not inflate'), 'inflation warning present');
  });

  it('response contract shows per-color + per-edition value-level confidence field', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    // Item-level confidence sits next to "name" on colors[] items and next to
    // "display_name" on editions[<slug>] — distinct from the per-source
    // confidence on each evidence_refs entry.
    assert.ok(
      /"name":\s*"atom"[^{]*?"confidence":\s*0-100/.test(prompt),
      'colors[] item example must show "confidence" adjacent to "name"',
    );
    assert.ok(
      /"display_name":[^{]*?"confidence":\s*0-100/.test(prompt),
      'editions[<slug>] example must show "confidence" adjacent to "display_name"',
    );
  });

  it('prompt is compact (under 8000 chars with small palette)', () => {
    const prompt = buildColorEditionFinderPrompt({ colorNames, colors, product });
    assert.ok(prompt.length < 8000, `prompt is ${prompt.length} chars`);
  });
});

describe('COLOR_EDITION_FINDER_SPEC', () => {
  it('has correct phase/reason/role', () => {
    assert.equal(COLOR_EDITION_FINDER_SPEC.phase, 'colorFinder');
    assert.equal(COLOR_EDITION_FINDER_SPEC.reason, 'color_edition_finding');
    assert.equal(COLOR_EDITION_FINDER_SPEC.role, 'triage');
  });

  it('jsonSchema has expected properties including v2 fields', () => {
    assert.equal(typeof COLOR_EDITION_FINDER_SPEC.system, 'function');
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.colors);
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.editions);
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.siblings_excluded);
    assert.ok(COLOR_EDITION_FINDER_SPEC.jsonSchema.properties.discovery_log);
  });
});

/* ── buildVariantIdentityCheckPrompt ───────────────────────────── */

describe('buildVariantIdentityCheckPrompt', () => {
  const product = { brand: 'Corsair', model: 'M75 Air Wireless' };
  const existingRegistry = [
    { variant_id: 'v_aaa11111', variant_key: 'color:black', variant_type: 'color', variant_label: 'black', color_atoms: ['black'], edition_slug: null, created_at: '2026-01-01T00:00:00Z' },
    { variant_id: 'v_bbb22222', variant_key: 'color:ocean-blue', variant_type: 'color', variant_label: 'Ocean Blue', color_atoms: ['ocean-blue'], edition_slug: null, created_at: '2026-01-01T00:00:00Z' },
  ];

  it('contains product identity', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.includes('Corsair'));
    assert.ok(result.includes('M75 Air Wireless'));
  });

  it('contains existing registry variant_ids', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.includes('v_aaa11111'));
    assert.ok(result.includes('v_bbb22222'));
  });

  it('contains new discovery colors', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black', 'deep-ocean-blue'], newColorNames: { 'deep-ocean-blue': 'Deep Ocean Blue' }, newEditions: {} });
    assert.ok(result.includes('color:black'));
    assert.ok(result.includes('color:deep-ocean-blue'));
    assert.ok(result.includes('Deep Ocean Blue'));
  });

  it('contains new discovery editions', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black+orange'], newColorNames: {}, newEditions: { 'cod-bo6': { display_name: 'COD BO6 Edition', colors: ['black+orange'] } } });
    assert.ok(result.includes('edition:cod-bo6'));
    assert.ok(result.includes('COD BO6 Edition'));
  });

  it('contains matching rules with match/new/reject actions', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.includes('preferred_label'), 'rename path via preferred_label');
    assert.ok(result.includes('"match"'), 'match action in example');
    assert.ok(result.includes('"new"'), 'new action in example');
    assert.ok(result.includes('"reject"'), 'reject action in example');
    assert.ok(result.includes('remove'));
  });

  it('does NOT contain old update/create actions in JSON examples', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(!result.includes('"action": "update"'), 'no update action in JSON');
    assert.ok(!result.includes('"action": "create"'), 'no create action in JSON');
  });

  it('contains expected JSON response shape', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.includes('"mappings"'));
    assert.ok(result.includes('"remove"'));
    assert.ok(result.includes('"action"'));
    assert.ok(result.includes('"match"'));
  });

  it('contains uniqueness rule for variant_ids', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.toLowerCase().includes('at most once') || result.toLowerCase().includes('only once'), 'uniqueness rule');
  });

  it('contains reject guidance for hallucinated discoveries', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.toLowerCase().includes('hallucinated') || result.toLowerCase().includes('reject'), 'reject guidance');
  });

  it('contains slug immutability rule', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.toLowerCase().includes('slug'), 'mentions slug protection');
  });

  it('injects the shared value-confidence rubric for per-mapping confidence', () => {
    const prompt = buildVariantIdentityCheckPrompt({
      product: { brand: 'Razer', model: 'Viper V3 Pro' },
      existingRegistry: [],
      newColors: ['black'],
      newColorNames: {},
      newEditions: {},
    });
    assert.ok(prompt.includes('Overall confidence'), 'rubric heading present');
    assert.ok(prompt.includes('90+'), 'rubric band 90+ present');
    assert.ok(prompt.toLowerCase().includes('not inflate'), 'inflation warning present');
  });

  it('response example mappings include value-level confidence field', () => {
    const prompt = buildVariantIdentityCheckPrompt({
      product: { brand: 'Razer', model: 'Viper V3 Pro' },
      existingRegistry: [],
      newColors: ['black'],
      newColorNames: {},
      newEditions: {},
    });
    // Mapping-level confidence lives between "verified" and "evidence_refs"
    // in the example JSON. Must be adjacent to mapping fields (not a nested
    // per-source confidence inside evidence_refs).
    assert.ok(
      /"verified":\s*(true|false)[^[]*?"confidence":\s*\d+/.test(prompt),
      'identity prompt mapping example must show mapping-level "confidence" (between "verified" and evidence_refs)',
    );
  });

  it('does NOT contain prefer-update bias', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(!result.includes('prefer "update"'), 'no prefer update bias');
    assert.ok(!result.includes('prefer "match"'), 'no prefer match bias');
  });

  it('promptOverride replaces entire prompt', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry, newColors: ['black'], newColorNames: {}, newEditions: {}, promptOverride: 'CUSTOM PROMPT' });
    assert.equal(result, 'CUSTOM PROMPT');
  });

  it('includes all entries in registry listing (no retired filter)', () => {
    const fullRegistry = [
      ...existingRegistry,
      { variant_id: 'v_rrr99999', variant_key: 'color:red', variant_type: 'color', variant_label: 'Red', color_atoms: ['red'], edition_slug: null, created_at: '2026-01-01T00:00:00Z' },
    ];
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry: fullRegistry, newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.includes('v_rrr99999'), 'all entries appear in registry listing');
  });

  it('handles empty registry gracefully', () => {
    const result = buildVariantIdentityCheckPrompt({ product, existingRegistry: [], newColors: ['black'], newColorNames: {}, newEditions: {} });
    assert.ok(result.includes('(none)'));
  });

  // ── orphanedPifKeys ──

  it('includes orphan section when orphanedPifKeys is non-empty', () => {
    const result = buildVariantIdentityCheckPrompt({
      product, existingRegistry: [], newColors: ['black'], newColorNames: {}, newEditions: {},
      orphanedPifKeys: ['edition:doom-the-dark-ages-edition', 'color:navy-blue'],
    });
    assert.ok(result.includes('ORPHANED PIF IMAGE KEYS'));
    assert.ok(result.includes('edition:doom-the-dark-ages-edition'));
    assert.ok(result.includes('color:navy-blue'));
    assert.ok(result.includes('orphan_remaps'));
  });

  it('omits orphan section when orphanedPifKeys is empty', () => {
    const result = buildVariantIdentityCheckPrompt({
      product, existingRegistry: [], newColors: ['black'], newColorNames: {}, newEditions: {},
      orphanedPifKeys: [],
    });
    assert.ok(!result.includes('ORPHANED PIF IMAGE KEYS'));
  });

  it('omits orphan section when orphanedPifKeys is not provided', () => {
    const result = buildVariantIdentityCheckPrompt({
      product, existingRegistry: [], newColors: ['black'], newColorNames: {}, newEditions: {},
    });
    assert.ok(!result.includes('ORPHANED PIF IMAGE KEYS'));
  });
});

describe('VARIANT_IDENTITY_CHECK_SPEC', () => {
  it('reuses colorFinder phase with distinct reason', () => {
    assert.equal(VARIANT_IDENTITY_CHECK_SPEC.phase, 'colorFinder');
    assert.equal(VARIANT_IDENTITY_CHECK_SPEC.reason, 'variant_identity_check');
    assert.equal(VARIANT_IDENTITY_CHECK_SPEC.role, 'triage');
  });

  it('jsonSchema has mappings, remove, and orphan_remaps properties', () => {
    assert.ok(VARIANT_IDENTITY_CHECK_SPEC.jsonSchema.properties.mappings);
    assert.ok(VARIANT_IDENTITY_CHECK_SPEC.jsonSchema.properties.remove);
    assert.ok(VARIANT_IDENTITY_CHECK_SPEC.jsonSchema.properties.orphan_remaps);
  });
});
