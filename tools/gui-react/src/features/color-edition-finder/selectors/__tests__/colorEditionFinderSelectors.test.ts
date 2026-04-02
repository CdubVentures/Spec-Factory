import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFinderKpiCards,
  deriveCooldownState,
  deriveColorTableRows,
  deriveEditionTableRows,
  deriveFinderStatusChip,
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

describe('deriveFinderKpiCards', () => {
  it('returns 5 cards with correct values', () => {
    const cards = deriveFinderKpiCards(SAMPLE_RESULT);
    assert.equal(cards.length, 5);
    assert.equal(cards[0].label, 'Colors');
    assert.equal(cards[0].value, '3');
    assert.equal(cards[1].label, 'Editions');
    assert.equal(cards[1].value, '1');
    assert.equal(cards[3].label, 'Runs');
    assert.equal(cards[3].value, '3');
  });

  it('returns zeros for null result', () => {
    const cards = deriveFinderKpiCards(null);
    assert.equal(cards[0].value, '0');
    assert.equal(cards[1].value, '0');
  });
});

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

describe('deriveColorTableRows', () => {
  it('returns rows with hex from registry', () => {
    const rows = deriveColorTableRows(SAMPLE_RESULT, REGISTRY);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].name, 'black');
    assert.equal(rows[0].hex, '#000000');
    assert.equal(rows[0].isDefault, true);
    assert.equal(rows[1].isDefault, false);
  });

  it('marks multi-color rows with component hexes', () => {
    const rows = deriveColorTableRows(SAMPLE_RESULT, REGISTRY);
    const multiRow = rows.find(r => r.name === 'black+red');
    assert.ok(multiRow);
    assert.ok(multiRow.hex); // derived from first atom
  });

  it('returns empty array for null result', () => {
    const rows = deriveColorTableRows(null, REGISTRY);
    assert.deepEqual(rows, []);
  });
});

describe('deriveEditionTableRows', () => {
  it('returns rows with detail', () => {
    const rows = deriveEditionTableRows(SAMPLE_RESULT);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].slug, 'launch-edition');
    assert.equal(rows[0].foundRun, 2);
    assert.equal(rows[0].model, 'gpt-5.4');
  });

  it('returns empty array for null result', () => {
    const rows = deriveEditionTableRows(null);
    assert.deepEqual(rows, []);
  });
});

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
