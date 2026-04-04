import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFinderKpiCards,
  deriveCooldownState,
  deriveFinderStatusChip,
  deriveSelectedStateDisplay,
  deriveRunHistoryRows,
} from '../colorEditionFinderSelectors.ts';
import type { ColorEditionFinderResult, ColorRegistryEntry } from '../../types.ts';

const SAMPLE_RESULT: ColorEditionFinderResult = {
  product_id: 'mouse-001',
  category: 'mouse',
  colors: ['black', 'white', 'black+red'],
  editions: ['launch-edition'],
  default_color: 'black',
  cooldown_until: new Date(Date.now() + 20 * 86400000).toISOString(),
  on_cooldown: true,
  run_count: 3,
  last_ran_at: '2026-04-01T12:00:00Z',
  selected: {
    colors: ['black', 'white', 'black+red'],
    editions: {
      'launch-edition': { colors: ['black', 'white'] },
    },
    default_color: 'black',
  },
  runs: [
    {
      run_number: 1,
      ran_at: '2026-03-01T00:00:00Z',
      model: 'gpt-5.4',
      fallback_used: false,
      cooldown_until: '2026-03-31T00:00:00Z',
      selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
      prompt: { system: 'System prompt run 1', user: '{"brand":"Corsair"}' },
      response: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
    },
    {
      run_number: 3,
      ran_at: '2026-04-01T12:00:00Z',
      model: 'gpt-6',
      fallback_used: true,
      cooldown_until: '2026-05-01T12:00:00Z',
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
  color_details: {
    black: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' },
    white: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' },
    'black+red': { found_run: 3, found_at: '2026-07-15T00:00:00Z', model: 'gpt-6' },
  },
  edition_details: {
    'launch-edition': { found_run: 2, found_at: '2026-05-01T00:00:00Z', model: 'gpt-5.4' },
  },
};

const REGISTRY: ColorRegistryEntry[] = [
  { name: 'black', hex: '#000000', css_var: '--color-black' },
  { name: 'white', hex: '#ffffff', css_var: '--color-white' },
  { name: 'red', hex: '#ef4444', css_var: '--color-red' },
];

// ── deriveFinderKpiCards ────────────────────────────────────────────

describe('deriveFinderKpiCards', () => {
  it('returns 5 cards with correct values', () => {
    const cards = deriveFinderKpiCards(SAMPLE_RESULT);
    assert.equal(cards.length, 5);
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

// ── deriveCooldownState ─────────────────────────────────────────────

describe('deriveCooldownState', () => {
  it('detects active cooldown', () => {
    const state = deriveCooldownState(SAMPLE_RESULT);
    assert.equal(state.onCooldown, true);
    assert.ok(state.daysRemaining > 0);
    assert.ok(state.progressPct >= 0 && state.progressPct <= 100);
  });

  it('detects expired cooldown', () => {
    const expired = {
      ...SAMPLE_RESULT,
      cooldown_until: new Date(Date.now() - 86400000).toISOString(),
      on_cooldown: false,
    };
    const state = deriveCooldownState(expired);
    assert.equal(state.onCooldown, false);
  });

  it('handles null result', () => {
    const state = deriveCooldownState(null);
    assert.equal(state.onCooldown, false);
    assert.equal(state.daysRemaining, 0);
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
    assert.equal(display.ssotRunNumber, 0);
    assert.equal(display.defaultColorHex, '');
  });

  it('maps colors with hex from registry and marks isDefault', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    assert.equal(display.colors.length, 3);
    assert.equal(display.colors[0].name, 'black');
    assert.equal(display.colors[0].hex, '#000000');
    assert.equal(display.colors[0].isDefault, true);
    assert.equal(display.colors[1].name, 'white');
    assert.equal(display.colors[1].hex, '#ffffff');
    assert.equal(display.colors[1].isDefault, false);
  });

  it('resolves multi-color hex from first atom', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    const multiColor = display.colors.find(c => c.name === 'black+red');
    assert.ok(multiColor);
    assert.equal(multiColor.hex, '#000000');
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
      selected: {
        colors: ['black'],
        editions: { 'empty-edition': { colors: [] } },
        default_color: 'black',
      },
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    assert.equal(display.editions[0].slug, 'empty-edition');
    assert.deepEqual(display.editions[0].pairedColors, []);
  });

  it('returns empty hex for unknown color', () => {
    const result: ColorEditionFinderResult = {
      ...SAMPLE_RESULT,
      selected: {
        colors: ['unknown-color'],
        editions: {},
        default_color: 'unknown-color',
      },
    };
    const display = deriveSelectedStateDisplay(result, REGISTRY);
    assert.equal(display.colors[0].name, 'unknown-color');
    assert.equal(display.colors[0].hex, '');
  });

  it('sets ssotRunNumber to run_count', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    assert.equal(display.ssotRunNumber, 3);
  });

  it('resolves defaultColorHex from registry', () => {
    const display = deriveSelectedStateDisplay(SAMPLE_RESULT, REGISTRY);
    assert.equal(display.defaultColorHex, '#000000');
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
});
