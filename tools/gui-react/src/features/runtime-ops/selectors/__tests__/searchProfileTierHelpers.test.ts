import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyQueryTier,
  tierLabel,
  tierChipClass,
  groupByTier,
  buildTierBudgetSummary,
  enrichmentStrategyLabel,
} from '../searchProfileTierHelpers.ts';
import type { PrefetchSearchProfileQueryRow } from '../../types.ts';

function makeRow(overrides: Partial<PrefetchSearchProfileQueryRow> = {}): PrefetchSearchProfileQueryRow {
  return { query: 'test query', ...overrides };
}

// ---------------------------------------------------------------------------
// classifyQueryTier
// ---------------------------------------------------------------------------
describe('classifyQueryTier', () => {
  const cases: Array<[string, Partial<PrefetchSearchProfileQueryRow>, string]> = [
    ['tier field: seed', { tier: 'seed' }, 'seed'],
    ['tier field: group_search', { tier: 'group_search' }, 'group'],
    ['tier field: key_search', { tier: 'key_search' }, 'key'],
    ['hint_source fallback: tier1_seed', { hint_source: 'tier1_seed' }, 'seed'],
    ['hint_source fallback: tier2_group', { hint_source: 'tier2_group' }, 'group'],
    ['hint_source fallback: tier3_key', { hint_source: 'tier3_key' }, 'key'],
    ['unknown hint_source → key', { hint_source: 'field_rules.search_hints' }, 'key'],
    ['empty row → key', {}, 'key'],
    ['tier takes precedence over hint_source', { tier: 'seed', hint_source: 'tier3_key' }, 'seed'],
  ];
  for (const [label, overrides, expected] of cases) {
    it(label, () => {
      assert.equal(classifyQueryTier(makeRow(overrides)), expected);
    });
  }
});

// ---------------------------------------------------------------------------
// tierLabel
// ---------------------------------------------------------------------------
describe('tierLabel', () => {
  const cases: Array<[string, string]> = [
    ['seed', 'Seed'],
    ['group', 'Group'],
    ['key', 'Key'],
    ['unknown', 'Key'],
    ['', 'Key'],
  ];
  for (const [input, expected] of cases) {
    it(`${input || '(empty)'} → ${expected}`, () => {
      assert.equal(tierLabel(input), expected);
    });
  }
});

// ---------------------------------------------------------------------------
// tierChipClass
// ---------------------------------------------------------------------------
describe('tierChipClass', () => {
  const cases: Array<[string, string]> = [
    ['seed', 'sf-chip-accent'],
    ['group', 'sf-chip-warning'],
    ['key', 'sf-chip-info'],
    ['', 'sf-chip-neutral'],
  ];
  for (const [input, expected] of cases) {
    it(`${input || '(empty)'} → ${expected}`, () => {
      assert.equal(tierChipClass(input), expected);
    });
  }
});

// ---------------------------------------------------------------------------
// groupByTier
// ---------------------------------------------------------------------------
describe('groupByTier', () => {
  it('partitions rows by tier', () => {
    const rows = [
      makeRow({ tier: 'seed' }),
      makeRow({ tier: 'group_search' }),
      makeRow({ tier: 'key_search' }),
      makeRow({ hint_source: 'field_rules.search_hints' }),
      makeRow({ tier: 'seed' }),
    ];
    const result = groupByTier(rows);
    assert.equal(result.seed.length, 2);
    assert.equal(result.group.length, 1);
    assert.equal(result.key.length, 2);
  });

  it('returns empty arrays for no rows', () => {
    const result = groupByTier([]);
    assert.deepEqual(result, { seed: [], group: [], key: [] });
  });
});

// ---------------------------------------------------------------------------
// buildTierBudgetSummary
// ---------------------------------------------------------------------------
describe('buildTierBudgetSummary', () => {
  it('computes counts and percentages', () => {
    const rows = [
      makeRow({ tier: 'seed' }),
      makeRow({ tier: 'seed' }),
      makeRow({ tier: 'group_search' }),
      makeRow({ tier: 'key_search' }),
      makeRow({ tier: 'key_search' }),
      makeRow({ tier: 'key_search' }),
    ];
    const result = buildTierBudgetSummary(rows, 24);
    assert.equal(result.seed.count, 2);
    assert.equal(result.group.count, 1);
    assert.equal(result.key.count, 3);
    assert.equal(result.total, 6);
    assert.equal(result.cap, 24);
    assert.ok(Math.abs(result.seed.pct - (2 / 6) * 100) < 0.01);
  });

  it('handles empty rows', () => {
    const result = buildTierBudgetSummary([], 24);
    assert.equal(result.total, 0);
    assert.equal(result.seed.count, 0);
    assert.equal(result.seed.pct, 0);
  });
});

// ---------------------------------------------------------------------------
// enrichmentStrategyLabel
// ---------------------------------------------------------------------------
describe('enrichmentStrategyLabel', () => {
  const cases: Array<[string, number | undefined, string]> = [
    ['repeat 0', 0, 'bare search'],
    ['repeat 1', 1, '+aliases'],
    ['repeat 2', 2, '+domain hint'],
    ['repeat 3', 3, '+content type'],
    ['repeat 4', 4, '+content type'],
    ['undefined', undefined, 'bare search'],
  ];
  for (const [label, repeat, expected] of cases) {
    it(label, () => {
      assert.equal(enrichmentStrategyLabel(makeRow({ tier: 'key_search', repeat_count: repeat })), expected);
    });
  }

  it('returns empty string for seed rows', () => {
    assert.equal(enrichmentStrategyLabel(makeRow({ tier: 'seed' })), '');
  });

  it('returns empty string for group rows', () => {
    assert.equal(enrichmentStrategyLabel(makeRow({ tier: 'group_search' })), '');
  });

  it('returns enrichment label for unrecognized hint_source (falls to key tier)', () => {
    assert.equal(enrichmentStrategyLabel(makeRow({ hint_source: 'field_rules.search_hints' })), 'bare search');
  });
});
