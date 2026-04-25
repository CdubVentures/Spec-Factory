import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveFinderKpiCards,
  deriveVariantRows,
  sortRunsNewestFirst,
} from '../scalarFinderSelectors.ts';
import type { FinderVariantRowData } from '../variantRowHelpers.ts';

interface FixtureCandidate {
  readonly variant_id: string | null;
  readonly variant_key: string;
  readonly value: string | null;
  readonly publisher_candidates?: readonly { readonly status: string }[];
}

interface FixtureRun {
  readonly run_number: number;
  readonly ran_at: string;
}

interface FixtureResult {
  readonly candidates: readonly FixtureCandidate[];
  readonly runs?: readonly FixtureRun[];
  readonly run_count?: number;
}

const VARIANTS: readonly FinderVariantRowData[] = [
  { variant_id: 'v_001', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color' },
  { variant_id: 'v_002', variant_key: 'color:white', variant_label: 'White', variant_type: 'color' },
  { variant_id: 'v_003', variant_key: 'edition:le-2025', variant_label: 'LE 2025', variant_type: 'edition' },
];

describe('deriveFinderKpiCards', () => {
  it('returns 4 cards with neutral tones when result is null and no variants', () => {
    const cards = deriveFinderKpiCards({ result: null, totalVariants: 0, valueLabelPlural: 'Release Dates' });
    assert.equal(cards.length, 4);
    assert.equal(cards[0].label, 'Release Dates');
    assert.equal(cards[0].value, '0');
    assert.equal(cards[0].tone, 'neutral');
    assert.equal(cards[1].label, 'Variants');
    assert.equal(cards[1].value, '0');
    assert.equal(cards[1].tone, 'neutral');
    assert.equal(cards[2].label, 'Runs');
    assert.equal(cards[2].value, '0');
    assert.equal(cards[2].tone, 'neutral');
    assert.equal(cards[3].label, 'Published');
    assert.equal(cards[3].value, '--');
    assert.equal(cards[3].tone, 'neutral');
  });

  it('shows variant count + Published "0/N" when result null but variants exist', () => {
    const cards = deriveFinderKpiCards({ result: null, totalVariants: 5, valueLabelPlural: 'Release Dates' });
    assert.equal(cards[1].value, '5');
    assert.equal(cards[1].tone, 'purple');
    assert.equal(cards[3].value, '0/5');
    assert.equal(cards[3].tone, 'neutral');
  });

  it('counts only candidates with truthy value for first KPI', () => {
    const result: FixtureResult = {
      candidates: [
        { variant_id: 'v_001', variant_key: 'color:black', value: '2025-01-15' },
        { variant_id: 'v_002', variant_key: 'color:white', value: null },
        { variant_id: 'v_003', variant_key: 'edition:le-2025', value: '2025-06-01' },
      ],
    };
    const cards = deriveFinderKpiCards({ result, totalVariants: 3, valueLabelPlural: 'Release Dates' });
    assert.equal(cards[0].value, '2');
    assert.equal(cards[0].tone, 'accent');
  });

  it('counts run_count for Runs KPI with success tone when nonzero', () => {
    const result: FixtureResult = { candidates: [], run_count: 7 };
    const cards = deriveFinderKpiCards({ result, totalVariants: 3, valueLabelPlural: 'Release Dates' });
    assert.equal(cards[2].value, '7');
    assert.equal(cards[2].tone, 'success');
  });

  it('Published counts variants with at least one resolved publisher_candidate', () => {
    const result: FixtureResult = {
      candidates: [
        { variant_id: 'v_001', variant_key: 'color:black', value: '2025-01-15',
          publisher_candidates: [{ status: 'resolved' }] },
        { variant_id: 'v_002', variant_key: 'color:white', value: '2025-02-01',
          publisher_candidates: [{ status: 'pending' }] },
        { variant_id: 'v_003', variant_key: 'edition:le-2025', value: '2025-06-01',
          publisher_candidates: [{ status: 'resolved' }, { status: 'rejected' }] },
      ],
    };
    const cards = deriveFinderKpiCards({ result, totalVariants: 3, valueLabelPlural: 'Release Dates' });
    assert.equal(cards[3].value, '2/3');
    assert.equal(cards[3].tone, 'info');
  });

  it('Published tone is success when all variants are published', () => {
    const result: FixtureResult = {
      candidates: [
        { variant_id: 'v_001', variant_key: 'color:black', value: '2025-01-15',
          publisher_candidates: [{ status: 'resolved' }] },
        { variant_id: 'v_002', variant_key: 'color:white', value: '2025-02-01',
          publisher_candidates: [{ status: 'resolved' }] },
      ],
    };
    const cards = deriveFinderKpiCards({ result, totalVariants: 2, valueLabelPlural: 'Release Dates' });
    assert.equal(cards[3].value, '2/2');
    assert.equal(cards[3].tone, 'success');
  });

  it('parameterizes the first KPI label by valueLabelPlural ("SKUs")', () => {
    const cards = deriveFinderKpiCards({ result: null, totalVariants: 2, valueLabelPlural: 'SKUs' });
    assert.equal(cards[0].label, 'SKUs');
  });

  it('parameterizes the first KPI label by valueLabelPlural ("Prices")', () => {
    const cards = deriveFinderKpiCards({ result: null, totalVariants: 2, valueLabelPlural: 'Prices' });
    assert.equal(cards[0].label, 'Prices');
  });
});

describe('deriveVariantRows', () => {
  it('returns one row per CEF variant when result is null with candidate: null', () => {
    const rows = deriveVariantRows<FixtureCandidate>(VARIANTS, null);
    assert.equal(rows.length, 3);
    rows.forEach((r) => assert.equal(r.candidate, null));
    assert.equal(rows[0].variant_key, 'color:black');
    assert.equal(rows[1].variant_key, 'color:white');
    assert.equal(rows[2].variant_key, 'edition:le-2025');
  });

  it('matches candidate by variant_id when present', () => {
    const cand: FixtureCandidate = { variant_id: 'v_002', variant_key: 'color:white', value: '2025-03-01' };
    const rows = deriveVariantRows<FixtureCandidate>(VARIANTS, { candidates: [cand] });
    assert.equal(rows[0].candidate, null);
    assert.deepEqual(rows[1].candidate, cand);
    assert.equal(rows[2].candidate, null);
  });

  it('falls back to variant_key when both CEF variant_id and candidate variant_id are null', () => {
    const variantsNoId: readonly FinderVariantRowData[] = [
      { variant_id: null, variant_key: 'color:black', variant_label: 'Black', variant_type: 'color' },
      { variant_id: null, variant_key: 'color:white', variant_label: 'White', variant_type: 'color' },
    ];
    const cand: FixtureCandidate = { variant_id: null, variant_key: 'color:black', value: '2025-04-01' };
    const rows = deriveVariantRows<FixtureCandidate>(variantsNoId, { candidates: [cand] });
    assert.deepEqual(rows[0].candidate, cand);
    assert.equal(rows[1].candidate, null);
  });

  it('preserves CEF variant ordering regardless of candidate order', () => {
    const cands: FixtureCandidate[] = [
      { variant_id: 'v_003', variant_key: 'edition:le-2025', value: 'C' },
      { variant_id: 'v_001', variant_key: 'color:black', value: 'A' },
      { variant_id: 'v_002', variant_key: 'color:white', value: 'B' },
    ];
    const rows = deriveVariantRows<FixtureCandidate>(VARIANTS, { candidates: cands });
    assert.equal(rows[0].candidate?.value, 'A');
    assert.equal(rows[1].candidate?.value, 'B');
    assert.equal(rows[2].candidate?.value, 'C');
  });

  it('keeps variants with no matching candidate (candidate: null)', () => {
    const cand: FixtureCandidate = { variant_id: 'v_xyz', variant_key: 'color:teal', value: 'X' };
    const rows = deriveVariantRows<FixtureCandidate>(VARIANTS, { candidates: [cand] });
    assert.equal(rows.length, 3);
    rows.forEach((r) => assert.equal(r.candidate, null));
  });
});

describe('sortRunsNewestFirst', () => {
  it('returns [] when result is null', () => {
    assert.deepEqual(sortRunsNewestFirst<FixtureRun>(null), []);
  });

  it('returns [] when result has no runs property', () => {
    assert.deepEqual(sortRunsNewestFirst<FixtureRun>({ candidates: [] } as unknown as { runs: FixtureRun[] }), []);
  });

  it('sorts runs by run_number descending', () => {
    const runs: FixtureRun[] = [
      { run_number: 1, ran_at: '2025-01-01' },
      { run_number: 3, ran_at: '2025-01-03' },
      { run_number: 2, ran_at: '2025-01-02' },
    ];
    const sorted = sortRunsNewestFirst<FixtureRun>({ runs });
    assert.equal(sorted[0].run_number, 3);
    assert.equal(sorted[1].run_number, 2);
    assert.equal(sorted[2].run_number, 1);
  });

  it('does not mutate the input array', () => {
    const runs: FixtureRun[] = [
      { run_number: 1, ran_at: '2025-01-01' },
      { run_number: 2, ran_at: '2025-01-02' },
    ];
    const original = [...runs];
    sortRunsNewestFirst<FixtureRun>({ runs });
    assert.deepEqual(runs, original);
  });
});
