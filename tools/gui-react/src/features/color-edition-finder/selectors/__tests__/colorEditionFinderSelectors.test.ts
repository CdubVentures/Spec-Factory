import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFinderKpiCards,
  deriveFinderStatusChip,
  deriveSelectedStateDisplay,
  deriveRunHistoryRows,
} from '../colorEditionFinderSelectors.ts';
import type { ColorEditionFinderResult, ColorRegistryEntry, CefVariantRegistryEntry } from '../../types.ts';

/**
 * Build a variant_registry fixture from compact entry specs.
 * variant_id is derived from key for predictable assertions in tests.
 */
function makeVariantRegistry(
  entries: ReadonlyArray<{
    readonly id?: string;
    readonly key: string;
    readonly type: 'color' | 'edition';
    readonly label?: string;
    readonly atoms: readonly string[];
    readonly slug?: string;
    readonly displayName?: string;
  }>,
): CefVariantRegistryEntry[] {
  return entries.map((e, i) => ({
    variant_id: e.id ?? `v_test${String(i).padStart(4, '0')}`,
    variant_key: e.key,
    variant_type: e.type,
    variant_label: e.label ?? (e.displayName ?? e.atoms.join('+')),
    color_atoms: e.atoms,
    edition_slug: e.slug ?? null,
    edition_display_name: e.displayName ?? null,
    created_at: '2026-01-01T00:00:00Z',
  }));
}

const SAMPLE_RESULT: ColorEditionFinderResult = {
  product_id: 'mouse-001',
  category: 'mouse',
  run_count: 3,
  last_ran_at: '2026-04-01T12:00:00Z',
  published: {
    colors: ['black', 'white', 'black+red'],
    editions: ['launch-edition'],
    default_color: 'black',
    color_names: {},
    edition_details: {
      'launch-edition': { display_name: '', colors: ['black', 'white'] },
    },
  },
  variant_registry: makeVariantRegistry([
    { key: 'color:black', type: 'color', atoms: ['black'] },
    { key: 'color:white', type: 'color', atoms: ['white'] },
    { key: 'color:black+red', type: 'color', atoms: ['black', 'red'] },
    { key: 'edition:launch-edition', type: 'edition', atoms: ['black', 'white'], slug: 'launch-edition', displayName: '' },
  ]),
  candidates: { colors: [], editions: [] },
  runs: [
    {
      run_number: 1,
      ran_at: '2026-03-01T00:00:00Z',
      model: 'gpt-5.4',
      fallback_used: false,
      selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
      prompt: { system: 'System prompt run 1', user: '{"brand":"Corsair"}' },
      response: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
    },
    {
      run_number: 3,
      ran_at: '2026-04-01T12:00:00Z',
      model: 'gpt-6',
      fallback_used: true,
      selected: {
        colors: ['black', 'white', 'black+red'],
        editions: { 'launch-edition': { colors: ['black', 'white'] } },
        default_color: 'black',
      },
      prompt: { system: 'System prompt run 3', user: '{"brand":"Corsair"}' },
      response: {
        colors: ['black', 'white', 'black+red'],
        editions: { 'launch-edition': { colors: ['black', 'white'] } },
        default_color: 'black',
      },
    },
  ],
};

const REGISTRY: ColorRegistryEntry[] = [
  { name: 'black', hex: '#000000', css_var: '--color-black' },
  { name: 'white', hex: '#ffffff', css_var: '--color-white' },
  { name: 'red', hex: '#ef4444', css_var: '--color-red' },
  { name: 'silver', hex: '#c0c0c0', css_var: '--color-silver' },
];

// ── deriveFinderKpiCards ────────────────────────────────────────────

describe('deriveFinderKpiCards', () => {
  it('returns 4 cards with correct values', () => {
    const cards = deriveFinderKpiCards(SAMPLE_RESULT);
    assert.equal(cards.length, 4);
    assert.equal(cards[0].label, 'Colors');
    assert.equal(cards[0].value, '3');
    assert.equal(cards[1].label, 'Editions');
    assert.equal(cards[1].value, '1');
    assert.equal(cards[2].label, 'Default Color');
    assert.equal(cards[2].value, 'black');
    assert.equal(cards[3].label, 'Runs');
    assert.equal(cards[3].value, '3');
  });

  it('returns "--" for default color when null result', () => {
    const cards = deriveFinderKpiCards(null);
    assert.equal(cards[0].value, '0');
    assert.equal(cards[1].value, '0');
    const defaultCard = cards.find(c => c.label === 'Default Color');
    assert.ok(defaultCard);
    assert.equal(defaultCard.value, '--');
  });
});

// ── deriveFinderStatusChip ──────────────────────────────────────────

describe('deriveFinderStatusChip', () => {
  it('returns "Not Run" for null', () => {
    const chip = deriveFinderStatusChip(null);
    assert.equal(chip.label, 'Not Run');
  });

  it('returns run info for result', () => {
    const chip = deriveFinderStatusChip(SAMPLE_RESULT);
    assert.ok(chip.label.includes('Run 3'));
  });
});

// ── deriveSelectedStateDisplay ──────────────────────────────────────

describe('deriveSelectedStateDisplay', () => {
  it('returns empty display for null result', () => {
    const display = deriveSelectedStateDisplay(null, REGISTRY);
    assert.deepEqual(display.colors, []);
    assert.deepEqual(display.editions, []);
    assert.equal(display.defaultColorHex, '');
  });

  it('maps colors with hex, hexParts, and displayName from registry and marks isDefault', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    // WHY: 3 standalone colors (black, white, black+red) + 1 edition-derived
    // combo from launch-edition's paired colors ['black','white'] → 'black+white'.
    assert.equal(display.colors.length, 4);
    const black = display.colors.find(c => c.name === 'black');
    assert.ok(black);
    assert.equal(black.hex, '#000000');
    assert.deepEqual(black.hexParts, ['#000000']);
    assert.equal(black.displayName, '');
    assert.equal(black.isDefault, true);
    const white = display.colors.find(c => c.name === 'white');
    assert.ok(white);
    assert.equal(white.hex, '#ffffff');
    assert.deepEqual(white.hexParts, ['#ffffff']);
    assert.equal(white.displayName, '');
    assert.equal(white.isDefault, false);
  });

  it('resolves multi-color hex from first atom and hexParts for all atoms', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    const multiColor = display.colors.find(c => c.name === 'black+red');
    assert.ok(multiColor);
    assert.equal(multiColor.hex, '#000000');
    assert.deepEqual(multiColor.hexParts, ['#000000', '#ef4444']);
    assert.equal(multiColor.isDefault, false);
  });

  it('maps editions with paired color pills', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    assert.equal(display.editions.length, 1);
    assert.equal(display.editions[0].slug, 'launch-edition');
    assert.equal(display.editions[0].pairedColors.length, 2);
    assert.equal(display.editions[0].pairedColors[0].name, 'black');
    assert.equal(display.editions[0].pairedColors[0].hex, '#000000');
    assert.equal(display.editions[0].pairedColors[1].name, 'white');
    assert.equal(display.editions[0].pairedColors[1].hex, '#ffffff');
  });

  it('handles edition with empty colors array', () => {
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      published: {
        ...SAMPLE_RESULT.published,
        colors: ['black'],
        editions: ['empty-edition'],
        edition_details: { 'empty-edition': { colors: [] } },
      },
      variant_registry: makeVariantRegistry([
        { key: 'color:black', type: 'color', atoms: ['black'] },
        { key: 'edition:empty-edition', type: 'edition', atoms: [], slug: 'empty-edition' },
      ]),
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    assert.equal(display.editions[0].slug, 'empty-edition');
    assert.deepEqual(display.editions[0].pairedColors, []);
  });

  it('returns empty hex and hexParts for unknown color', () => {
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      published: {
        ...SAMPLE_RESULT.published,
        colors: ['unknown-color'],
        editions: [],
        default_color: 'unknown-color',
        edition_details: {},
      },
      variant_registry: makeVariantRegistry([
        { key: 'color:unknown-color', type: 'color', atoms: ['unknown-color'] },
      ]),
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    assert.equal(display.colors[0].name, 'unknown-color');
    assert.equal(display.colors[0].hex, '');
    assert.deepEqual(display.colors[0].hexParts, ['']);
  });

  it('populates displayName from color_names and edition display_name', () => {
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      published: {
        ...SAMPLE_RESULT.published,
        colors: ['black', 'white+silver'],
        editions: ['cod-bo6-edition'],
        default_color: 'black',
        color_names: { 'white+silver': 'Frost White' },
        edition_details: {
          'cod-bo6-edition': { display_name: 'Call of Duty: Black Ops 6 Edition', colors: ['black'] },
        },
      },
      variant_registry: makeVariantRegistry([
        { key: 'color:black', type: 'color', atoms: ['black'] },
        { key: 'color:white+silver', type: 'color', atoms: ['white', 'silver'] },
        { key: 'edition:cod-bo6-edition', type: 'edition', atoms: ['black'], slug: 'cod-bo6-edition', displayName: 'Call of Duty: Black Ops 6 Edition' },
      ]),
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    const black = display.colors.find(c => c.variantId === 'v_test0000');
    const whiteSilver = display.colors.find(c => c.variantId === 'v_test0001');
    assert.equal(black?.displayName, '');
    assert.equal(whiteSilver?.displayName, 'Frost White');
    assert.equal(display.editions[0].displayName, 'Call of Duty: Black Ops 6 Edition');
  });

  it('resolves hexParts with partial unknowns in combo', () => {
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      published: {
        ...SAMPLE_RESULT.published,
        colors: ['black+unknown+red'],
        editions: [],
        default_color: 'black+unknown+red',
        edition_details: {},
      },
      variant_registry: makeVariantRegistry([
        { key: 'color:black+unknown+red', type: 'color', atoms: ['black', 'unknown', 'red'] },
      ]),
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    assert.deepEqual(display.colors[0].hexParts, ['#000000', '', '#ef4444']);
  });

  it('resolves defaultColorHex from registry', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    assert.equal(display.defaultColorHex, '#000000');
  });

  // ── isPublished per-item flags ───────────────────────────────────
  // WHY: CEF panel renders per-chip Published (P) badges driven by the
  // publisher endpoint's resolved colors/editions arrays. The selector
  // decorates each pill/edition with isPublished so the component stays dumb.

  it('defaults isPublished to true on every pill and edition when publishedSets omitted', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    assert.ok(display.colors.every(p => p.isPublished === true));
    assert.ok(display.editions.every(e => e.isPublished === true));
    assert.ok(display.editions.every(e => e.pairedColors.every(p => p.isPublished === true)));
  });

  it('marks isPublished=true only for colors present in publishedSets.colors', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY, {
      colors: ['black', 'black+red'],
      editions: [],
    });
    const byName = new Map(display.colors.map(p => [p.name, p]));
    assert.equal(byName.get('black')?.isPublished, true);
    assert.equal(byName.get('white')?.isPublished, false);
    assert.equal(byName.get('black+red')?.isPublished, true);
  });

  it('marks isPublished=true only for editions present in publishedSets.editions', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY, {
      colors: [],
      editions: ['launch-edition'],
    });
    assert.equal(display.editions[0].slug, 'launch-edition');
    assert.equal(display.editions[0].isPublished, true);
  });

  it('marks an edition isPublished=false when its slug is absent from publishedSets.editions', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY, {
      colors: [],
      editions: ['unrelated-edition'],
    });
    assert.equal(display.editions[0].isPublished, false);
  });

  it('propagates publishedSets.colors into pairedColors inside editions', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY, {
      colors: ['black'],
      editions: ['launch-edition'],
    });
    const paired = display.editions[0].pairedColors;
    const black = paired.find(p => p.name === 'black');
    const white = paired.find(p => p.name === 'white');
    assert.equal(black?.isPublished, true);
    assert.equal(white?.isPublished, false);
  });

  it('marks all items isPublished=false when publishedSets has empty arrays', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY, {
      colors: [],
      editions: [],
    });
    assert.ok(display.colors.every(p => p.isPublished === false));
    assert.ok(display.editions.every(e => e.isPublished === false));
    assert.ok(display.editions.every(e => e.pairedColors.every(p => p.isPublished === false)));
  });

  // ── edition-color union (editions are also colors) ──────────────
  // WHY: An edition variant is conceptually a color variant — its paired
  // colors form a combo that should appear on the Colors side alongside
  // standalone colors. The combo's publish state cascades from the edition.

  it('adds an edition combo (paired colors joined with +) to the Colors list', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    const combo = display.colors.find(c => c.name === 'black+white');
    assert.ok(combo, 'launch-edition [black,white] should surface as black+white on the Colors side');
    assert.deepEqual(combo.hexParts, ['#000000', '#ffffff']);
  });

  it('multi-atom edition combo collapses with matching standalone color in registry (one chip)', () => {
    // WHY: dual-rule — multi-atom combos in colors[] dedupe with editions of the
    // same combo. The registry holds one variant (the edition), not two.
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      published: {
        ...SAMPLE_RESULT.published,
        colors: ['black', 'black+white'],
        editions: ['launch-edition'],
        edition_details: { 'launch-edition': { colors: ['black', 'white'] } },
      },
      variant_registry: makeVariantRegistry([
        { key: 'color:black', type: 'color', atoms: ['black'] },
        { key: 'edition:launch-edition', type: 'edition', atoms: ['black', 'white'], slug: 'launch-edition' },
      ]),
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    const matches = display.colors.filter(c => c.name === 'black+white');
    assert.equal(matches.length, 1);
  });

  it('skips registry entries with empty color_atoms (no combo contribution)', () => {
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      published: {
        ...SAMPLE_RESULT.published,
        colors: ['black'],
        editions: ['empty-edition'],
        edition_details: { 'empty-edition': { colors: [] } },
      },
      variant_registry: makeVariantRegistry([
        { key: 'color:black', type: 'color', atoms: ['black'] },
        { key: 'edition:empty-edition', type: 'edition', atoms: [], slug: 'empty-edition' },
      ]),
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    assert.equal(display.colors.length, 1);
    assert.equal(display.colors[0].name, 'black');
  });

  it('two editions sharing same multi-atom combo each get their own chip (per-variant rule)', () => {
    // Per-variant: each SKU is distinct even when atoms match. Two editions sharing
    // a combo are still two separate SKUs with their own evidence/Del button.
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      published: {
        ...SAMPLE_RESULT.published,
        colors: [],
        editions: ['ed-one', 'ed-two'],
        edition_details: {
          'ed-one': { colors: ['black', 'white'] },
          'ed-two': { colors: ['black', 'white'] },
        },
      },
      variant_registry: makeVariantRegistry([
        { key: 'edition:ed-one', type: 'edition', atoms: ['black', 'white'], slug: 'ed-one' },
        { key: 'edition:ed-two', type: 'edition', atoms: ['black', 'white'], slug: 'ed-two' },
      ]),
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    const matches = display.colors.filter(c => c.name === 'black+white');
    assert.equal(matches.length, 2, 'two editions = two distinct chips');
    const variantIds = new Set(matches.map(m => m.variantId));
    assert.equal(variantIds.size, 2, 'each chip has its own variant_id');
  });

  it('cascades isPublished=true onto an edition combo when the edition is in publishedSets.editions', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY, {
      colors: [],
      editions: ['launch-edition'],
    });
    const combo = display.colors.find(c => c.name === 'black+white');
    assert.ok(combo);
    assert.equal(combo.isPublished, true);
  });

  it('marks an edition combo isPublished=false when neither the edition nor the combo name is published', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY, {
      colors: ['black'],
      editions: [],
    });
    const combo = display.colors.find(c => c.name === 'black+white');
    assert.ok(combo);
    assert.equal(combo.isPublished, false);
  });

  it('marks an edition combo isPublished=true when the combo name is directly in publishedSets.colors (even without edition resolve)', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY, {
      colors: ['black+white'],
      editions: [],
    });
    const combo = display.colors.find(c => c.name === 'black+white');
    assert.ok(combo);
    assert.equal(combo.isPublished, true);
  });

  // ── Per-variant chips (M75 Wireless scenario) ────────────────────
  // WHY: Single-atom edition combos used to collapse with the standalone color
  // of the same atom — 3 distinct SKUs (plain Black + 2 black-bodied editions)
  // showed as 1 chip. Each variant is its own SKU with its own evidence and
  // its own Del button, so the Colors section emits one chip per variant.

  it('M75 shape: 3 colors + 2 single-atom editions sharing same atom → 5 chips, 3 visually black', () => {
    const result: ColorEditionFinderResult = {
      product_id: 'mouse-76a41560',
      category: 'mouse',
      run_count: 1,
      last_ran_at: '2026-04-18T23:16:57Z',
      published: {
        colors: ['black', 'white', 'light-blue'],
        editions: ['cod-bo6', 'cyberpunk-arasaka'],
        default_color: 'black',
        color_names: { 'light-blue': 'Glacier Blue' },
        edition_details: {
          'cod-bo6': { display_name: 'Call of Duty Black Ops 6 Edition', colors: ['black'] },
          'cyberpunk-arasaka': { display_name: 'Cyberpunk 2077: Arasaka Edition', colors: ['black'] },
        },
      },
      variant_registry: [
        { variant_id: 'v_blk00001', variant_key: 'color:black', variant_type: 'color', variant_label: 'black', color_atoms: ['black'], edition_slug: null, edition_display_name: null, created_at: '2026-04-18T23:16:57Z' },
        { variant_id: 'v_wht00002', variant_key: 'color:white', variant_type: 'color', variant_label: 'white', color_atoms: ['white'], edition_slug: null, edition_display_name: null, created_at: '2026-04-18T23:16:57Z' },
        { variant_id: 'v_lbl00003', variant_key: 'color:light-blue', variant_type: 'color', variant_label: 'Glacier Blue', color_atoms: ['light-blue'], edition_slug: null, edition_display_name: null, created_at: '2026-04-18T23:16:57Z' },
        { variant_id: 'v_cod00004', variant_key: 'edition:cod-bo6', variant_type: 'edition', variant_label: 'Call of Duty Black Ops 6 Edition', color_atoms: ['black'], edition_slug: 'cod-bo6', edition_display_name: 'Call of Duty Black Ops 6 Edition', created_at: '2026-04-18T23:16:57Z' },
        { variant_id: 'v_cyb00005', variant_key: 'edition:cyberpunk-arasaka', variant_type: 'edition', variant_label: 'Cyberpunk 2077: Arasaka Edition', color_atoms: ['black'], edition_slug: 'cyberpunk-arasaka', edition_display_name: 'Cyberpunk 2077: Arasaka Edition', created_at: '2026-04-18T23:16:57Z' },
      ],
      candidates: { colors: [], editions: [] },
      runs: [],
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    assert.equal(display.colors.length, 5, 'one chip per variant — no collapse');
    const blacks = display.colors.filter(c => c.name === 'black');
    assert.equal(blacks.length, 3, '3 visually-black chips, each tied to its own variant');
    const blackVariantIds = new Set(blacks.map(c => c.variantId));
    assert.equal(blackVariantIds.size, 3, 'each black chip has a distinct variant_id');
    assert.ok(blackVariantIds.has('v_blk00001'), 'plain black variant present');
    assert.ok(blackVariantIds.has('v_cod00004'), 'cod-bo6 black variant present');
    assert.ok(blackVariantIds.has('v_cyb00005'), 'cyberpunk-arasaka black variant present');
    // Edition chips inherit the edition's display_name as displayName so user can disambiguate
    const cod = blacks.find(c => c.variantId === 'v_cod00004');
    const cyber = blacks.find(c => c.variantId === 'v_cyb00005');
    assert.equal(cod?.displayName, 'Call of Duty Black Ops 6 Edition');
    assert.equal(cyber?.displayName, 'Cyberpunk 2077: Arasaka Edition');
  });
});

// ── deriveRunHistoryRows ────────────────────────────────────────────

describe('deriveRunHistoryRows', () => {
  it('returns empty array for null result', () => {
    assert.deepEqual(deriveRunHistoryRows(null), []);
  });

  it('returns empty array for result with no runs', () => {
    const result: ColorEditionFinderResult = { ...SAMPLE_RESULT, runs: [] };
    assert.deepEqual(deriveRunHistoryRows(result), []);
  });

  it('marks single run as isLatest', () => {
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      run_count: 1,
      runs: [SAMPLE_RESULT.runs[0]],
    };
    const rows = deriveRunHistoryRows(result);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].isLatest, true);
  });

  it('marks only highest run_number as isLatest', () => {
    const rows = deriveRunHistoryRows(SAMPLE_RESULT);
    assert.equal(rows.length, 2);
    const latest = rows.find(r => r.isLatest);
    assert.ok(latest);
    assert.equal(latest.runNumber, 3);
    const notLatest = rows.find(r => !r.isLatest);
    assert.ok(notLatest);
    assert.equal(notLatest.runNumber, 1);
  });

  it('sorts rows newest-first (descending)', () => {
    const rows = deriveRunHistoryRows(SAMPLE_RESULT);
    assert.equal(rows[0].runNumber, 3);
    assert.equal(rows[1].runNumber, 1);
  });

  it('derives colorCount and editionCount from run.selected', () => {
    const rows = deriveRunHistoryRows(SAMPLE_RESULT);
    const run3 = rows.find(r => r.runNumber === 3);
    assert.ok(run3);
    assert.equal(run3.colorCount, 3);
    assert.equal(run3.editionCount, 1);
    const run1 = rows.find(r => r.runNumber === 1);
    assert.ok(run1);
    assert.equal(run1.colorCount, 2);
    assert.equal(run1.editionCount, 0);
  });

  it('formats responseJson as pretty-printed JSON', () => {
    const rows = deriveRunHistoryRows(SAMPLE_RESULT);
    const run3 = rows.find(r => r.runNumber === 3);
    assert.ok(run3);
    const parsed = JSON.parse(run3.responseJson);
    assert.deepEqual(parsed.colors, ['black', 'white', 'black+red']);
    assert.ok(run3.responseJson.includes('\n')); // pretty-printed
  });

  it('extracts systemPrompt and userMessage from run.prompt', () => {
    const rows = deriveRunHistoryRows(SAMPLE_RESULT);
    const run1 = rows.find(r => r.runNumber === 1);
    assert.ok(run1);
    assert.equal(run1.systemPrompt, 'System prompt run 1');
    assert.equal(run1.userMessage, '{"brand":"Corsair"}');
  });

  it('successful runs have validationStatus "valid" with empty rejectionSummary', () => {
    const rows = deriveRunHistoryRows(SAMPLE_RESULT);
    for (const row of rows) {
      assert.equal(row.validationStatus, 'valid');
      assert.equal(row.rejectionSummary, '');
    }
  });

  // ── v2 audit fields: siblings_excluded + discovery_log ──

  it('derives siblingsExcluded from response.siblings_excluded', () => {
    const runWithSiblings = {
      ...SAMPLE_RESULT.runs[0],
      run_number: 5,
      response: {
        ...SAMPLE_RESULT.runs[0].response,
        siblings_excluded: ['M75 Air Wireless Pro', 'M75 Wired'],
        discovery_log: {
          confirmed_from_known: ['black'],
          added_new: ['white'],
          rejected_from_known: ['gray'],
          urls_checked: ['https://corsair.com/m75'],
          queries_run: ['Corsair M75 colors'],
        },
      },
    };
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      runs: [runWithSiblings],
    };
    const rows = deriveRunHistoryRows(result);
    assert.deepEqual(rows[0].siblingsExcluded, ['M75 Air Wireless Pro', 'M75 Wired']);
  });

  it('derives discoveryLog counts and arrays from response.discovery_log', () => {
    const runWithLog = {
      ...SAMPLE_RESULT.runs[0],
      run_number: 6,
      response: {
        ...SAMPLE_RESULT.runs[0].response,
        discovery_log: {
          confirmed_from_known: ['black', 'white'],
          added_new: ['red'],
          rejected_from_known: [],
          urls_checked: ['https://corsair.com/m75', 'https://amazon.com/dp/B123'],
          queries_run: ['Corsair M75 colors', 'Corsair M75 editions'],
        },
      },
    };
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      runs: [runWithLog],
    };
    const rows = deriveRunHistoryRows(result);
    const log = rows[0].discoveryLog;
    assert.equal(log.confirmedCount, 2);
    assert.equal(log.addedNewCount, 1);
    assert.equal(log.rejectedCount, 0);
    assert.equal(log.urlsCheckedCount, 2);
    assert.equal(log.queriesRunCount, 2);
    assert.deepEqual(log.confirmedFromKnown, ['black', 'white']);
    assert.deepEqual(log.addedNew, ['red']);
    assert.deepEqual(log.urlsChecked, ['https://corsair.com/m75', 'https://amazon.com/dp/B123']);
  });

  it('v1 runs without audit fields default to empty', () => {
    const rows = deriveRunHistoryRows(SAMPLE_RESULT);
    const row = rows[0];
    assert.deepEqual(row.siblingsExcluded, []);
    assert.equal(row.discoveryLog.confirmedCount, 0);
    assert.equal(row.discoveryLog.addedNewCount, 0);
    assert.equal(row.discoveryLog.urlsCheckedCount, 0);
    assert.deepEqual(row.discoveryLog.confirmedFromKnown, []);
    assert.deepEqual(row.discoveryLog.addedNew, []);
  });

  it('rejected run has validationStatus "rejected" with reason summary', () => {
    const rejectedRun = {
      run_number: 4,
      ran_at: '2026-04-09T00:00:00Z',
      model: 'claude-sonnet-4-6',
      fallback_used: false,
      selected: { colors: [] as string[], editions: {} as Record<string, { colors: string[] }>, default_color: '' },
      prompt: { system: '', user: '' },
      response: {
        colors: [] as string[],
        editions: {} as Record<string, { colors: string[] }>,
        default_color: '',
        status: 'rejected' as const,
        raw: { colors: ['black'], editions: { se: { display_name: 'SE', colors: ['black'] } }, default_color: 'black' },
        rejections: [
          { reason_code: 'wrong_shape', detail: { expected: 'list', reason: 'expected array, got object' } },
        ],
      },
    };
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      runs: [...SAMPLE_RESULT.runs, rejectedRun],
    };
    const rows = deriveRunHistoryRows(result);
    const rejected = rows.find(r => r.runNumber === 4);
    assert.ok(rejected);
    assert.equal(rejected.validationStatus, 'rejected');
    assert.ok(rejected.rejectionSummary.includes('wrong_shape'));
    assert.ok(rejected.rejectionSummary.includes('expected array, got object'));
    assert.equal(rejected.colorCount, 0);
    assert.equal(rejected.editionCount, 0);
  });
});
