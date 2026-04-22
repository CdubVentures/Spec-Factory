import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { deriveKeyFinderTabSummary } from '../tabSummary.ts';
import type { KeyFinderSummaryRow } from '../types.ts';

function row(overrides: Partial<KeyFinderSummaryRow> = {}): KeyFinderSummaryRow {
  return {
    field_key: 'k',
    group: 'g',
    label: 'Key',
    difficulty: 'easy',
    availability: 'common',
    required_level: 'must',
    variant_dependent: false,
    budget: null,
    raw_budget: null,
    in_flight_as_primary: false,
    in_flight_as_passenger_count: 0,
    bundle_preview: [],
    last_run_number: null,
    last_ran_at: null,
    last_status: 'never_ran',
    last_value: null,
    last_confidence: null,
    last_model: null,
    candidate_count: 0,
    published: false,
    run_count: 0,
    ...overrides,
  } as KeyFinderSummaryRow;
}

describe('deriveKeyFinderTabSummary', () => {
  it('returns a running summary when isRunning is true', () => {
    const r = deriveKeyFinderTabSummary([row()], true);
    strictEqual(r.status, 'running');
    strictEqual(r.kpi, 'Running');
    strictEqual(r.numerator, undefined);
    strictEqual(r.denominator, undefined);
    strictEqual(r.percent, undefined);
  });

  it('returns idle with 0/0 when summary is undefined', () => {
    const r = deriveKeyFinderTabSummary(undefined, false);
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, '0 / 0');
    strictEqual(r.numerator, undefined);
    strictEqual(r.denominator, undefined);
    strictEqual(r.percent, undefined);
  });

  it('returns idle with 0/0 when summary is empty', () => {
    const r = deriveKeyFinderTabSummary([], false);
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, '0 / 0');
  });

  it('counts published + resolved rows as resolved, against non-variant-dependent total', () => {
    const rows = [
      row({ field_key: 'a', published: true }),
      row({ field_key: 'b', last_status: 'resolved' }),
      row({ field_key: 'c', last_status: 'never_ran' }),
      row({ field_key: 'd', variant_dependent: true, published: true }),
    ];
    const r = deriveKeyFinderTabSummary(rows, false);
    // resolved: a (published) + b (resolved) + d (published) = 3 — the filter doesn't exclude variant_dependent
    // total: a + b + c = 3 (variant_dependent excluded)
    strictEqual(r.numerator, 3);
    strictEqual(r.denominator, 3);
    strictEqual(r.percent, 100);
    strictEqual(r.kpi, '3 / 3');
  });

  it('rounds percent to the nearest integer', () => {
    const rows = [
      row({ field_key: 'a', published: true }),
      ...Array.from({ length: 11 }, (_, i) => row({ field_key: `f${i}` })),
    ];
    const r = deriveKeyFinderTabSummary(rows, false);
    // 1 resolved, 12 total → 8.33% → 8
    strictEqual(r.numerator, 1);
    strictEqual(r.denominator, 12);
    strictEqual(r.percent, 8);
  });

  it('omits ratio fields when all rows are variant_dependent (total = 0)', () => {
    const r = deriveKeyFinderTabSummary(
      [row({ variant_dependent: true, published: true })],
      false,
    );
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, '1 / 0');
    deepStrictEqual(Object.keys(r).sort(), ['kpi', 'status']);
  });
});
