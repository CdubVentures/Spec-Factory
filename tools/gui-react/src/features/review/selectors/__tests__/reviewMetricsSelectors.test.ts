import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReviewDashboardMetrics,
  assignMetricTone,
  deriveReviewKpiCards,
} from '../reviewMetricsSelectors.ts';
import type { ReviewDashboardMetrics, MetricKey } from '../reviewMetricsSelectors.ts';
import type { ProductReviewPayload } from '../../../../types/review.ts';

// ── Factories ─────────────────────────────────────────

function makeProduct(overrides: Partial<{
  brand: string;
  model: string;
  confidence: number;
  coverage: number;
  missing: number;
  has_run: boolean;
  updated_at: string;
}>): ProductReviewPayload {
  return {
    product_id: `p-${Math.random().toString(36).slice(2, 8)}`,
    category: 'mouse',
    identity: {
      id: 1,
      identifier: 'test-id',
      brand: overrides.brand ?? 'TestBrand',
      model: overrides.model ?? 'TestModel',
      variant: '',
    },
    fields: {},
    metrics: {
      confidence: overrides.confidence ?? 0.85,
      coverage: overrides.coverage ?? 0.9,
      missing: overrides.missing ?? 2,
      has_run: overrides.has_run ?? true,
      updated_at: overrides.updated_at ?? '2026-04-15T00:00:00Z',
    },
  };
}

// ── computeReviewDashboardMetrics ─────────────────────

describe('computeReviewDashboardMetrics', () => {
  it('returns all zeros for empty products array', () => {
    const m = computeReviewDashboardMetrics([], 100, 25);
    assert.deepStrictEqual(m.products, { filtered: 0, total: 100 });
    assert.equal(m.brands, 0);
    assert.equal(m.avgConfidence, 0);
    assert.equal(m.avgCoverage, 0);
    assert.equal(m.missingFields, 0);
    assert.equal(m.totalFields, 0);
    assert.deepStrictEqual(m.runStatus, { ran: 0, total: 0 });
  });

  it('computes correct metrics for a single product', () => {
    const p = makeProduct({ brand: 'Apple', confidence: 0.75, coverage: 0.6, missing: 5, has_run: true });
    const m = computeReviewDashboardMetrics([p], 10, 20);
    assert.deepStrictEqual(m.products, { filtered: 1, total: 10 });
    assert.equal(m.brands, 1);
    assert.equal(m.avgConfidence, 0.75);
    assert.equal(m.avgCoverage, 0.6);
    assert.equal(m.missingFields, 5);
    assert.equal(m.totalFields, 20); // 1 product * 20 fields
    assert.deepStrictEqual(m.runStatus, { ran: 1, total: 1 });
  });

  it('averages confidence and coverage across multiple products', () => {
    const products = [
      makeProduct({ confidence: 0.8, coverage: 1.0, missing: 0 }),
      makeProduct({ confidence: 0.6, coverage: 0.5, missing: 10 }),
    ];
    const m = computeReviewDashboardMetrics(products, 50, 25);
    assert.equal(m.avgConfidence, 0.7);
    assert.equal(m.avgCoverage, 0.75);
    assert.equal(m.missingFields, 10);
    assert.equal(m.totalFields, 50); // 2 * 25
  });

  it('counts distinct brands correctly', () => {
    const products = [
      makeProduct({ brand: 'Apple' }),
      makeProduct({ brand: 'Apple' }),
      makeProduct({ brand: 'Logitech' }),
      makeProduct({ brand: 'Razer' }),
      makeProduct({ brand: 'Logitech' }),
    ];
    const m = computeReviewDashboardMetrics(products, 100, 10);
    assert.equal(m.brands, 3);
  });

  it('handles mixed has_run statuses', () => {
    const products = [
      makeProduct({ has_run: true }),
      makeProduct({ has_run: false }),
      makeProduct({ has_run: true }),
      makeProduct({ has_run: false }),
      makeProduct({ has_run: true }),
    ];
    const m = computeReviewDashboardMetrics(products, 10, 10);
    assert.deepStrictEqual(m.runStatus, { ran: 3, total: 5 });
  });

  it('handles fieldCount=0 gracefully', () => {
    const products = [makeProduct({})];
    const m = computeReviewDashboardMetrics(products, 5, 0);
    assert.equal(m.totalFields, 0);
  });

  it('trims and ignores empty brand strings', () => {
    const products = [
      makeProduct({ brand: '  ' }),
      makeProduct({ brand: '' }),
      makeProduct({ brand: 'Valid' }),
    ];
    const m = computeReviewDashboardMetrics(products, 10, 5);
    assert.equal(m.brands, 1);
  });

  it('sums missing fields across all products', () => {
    const products = [
      makeProduct({ missing: 3 }),
      makeProduct({ missing: 7 }),
      makeProduct({ missing: 0 }),
      makeProduct({ missing: 12 }),
    ];
    const m = computeReviewDashboardMetrics(products, 20, 25);
    assert.equal(m.missingFields, 22);
    assert.equal(m.totalFields, 100); // 4 * 25
  });
});

// ── assignMetricTone ──────────────────────────────────

describe('assignMetricTone', () => {
  // Table-driven: [metricKey, metricsOverrides, expectedTone]
  const toneCases: [MetricKey, Partial<ReviewDashboardMetrics>, string][] = [
    // Products
    ['products', { products: { filtered: 10, total: 10 } }, 'success'],
    ['products', { products: { filtered: 5, total: 10 } }, 'warning'],
    ['products', { products: { filtered: 0, total: 10 } }, 'danger'],
    ['products', { products: { filtered: 0, total: 0 } }, 'danger'],

    // Brands — always accent
    ['brands', { brands: 0 }, 'accent'],
    ['brands', { brands: 5 }, 'accent'],
    ['brands', { brands: 100 }, 'accent'],

    // Avg Confidence
    ['avgConfidence', { avgConfidence: 0.8 }, 'success'],
    ['avgConfidence', { avgConfidence: 0.95 }, 'success'],
    ['avgConfidence', { avgConfidence: 0.79 }, 'warning'],
    ['avgConfidence', { avgConfidence: 0.5 }, 'warning'],
    ['avgConfidence', { avgConfidence: 0.49 }, 'danger'],
    ['avgConfidence', { avgConfidence: 0 }, 'danger'],

    // Avg Coverage
    ['avgCoverage', { avgCoverage: 0.8 }, 'success'],
    ['avgCoverage', { avgCoverage: 0.95 }, 'success'],
    ['avgCoverage', { avgCoverage: 0.79 }, 'warning'],
    ['avgCoverage', { avgCoverage: 0.5 }, 'warning'],
    ['avgCoverage', { avgCoverage: 0.49 }, 'danger'],
    ['avgCoverage', { avgCoverage: 0 }, 'danger'],

    // Missing Fields
    ['missingFields', { missingFields: 0, totalFields: 100 }, 'success'],
    ['missingFields', { missingFields: 10, totalFields: 100 }, 'warning'],  // 10% < 20%
    ['missingFields', { missingFields: 19, totalFields: 100 }, 'warning'],  // 19% < 20%
    ['missingFields', { missingFields: 20, totalFields: 100 }, 'danger'],   // 20% >= 20%
    ['missingFields', { missingFields: 50, totalFields: 100 }, 'danger'],   // 50% >= 20%
    ['missingFields', { missingFields: 5, totalFields: 0 }, 'warning'],     // totalFields=0, ratio=0, but missing>0

    // Run Status
    ['runStatus', { runStatus: { ran: 10, total: 10 } }, 'success'],
    ['runStatus', { runStatus: { ran: 5, total: 10 } }, 'warning'],
    ['runStatus', { runStatus: { ran: 0, total: 10 } }, 'danger'],
    ['runStatus', { runStatus: { ran: 0, total: 0 } }, 'danger'],
  ];

  const baseMetrics: ReviewDashboardMetrics = {
    products: { filtered: 5, total: 10 },
    brands: 3,
    avgConfidence: 0.7,
    avgCoverage: 0.7,
    missingFields: 10,
    totalFields: 100,
    runStatus: { ran: 3, total: 5 },
  };

  for (const [key, overrides, expected] of toneCases) {
    it(`${key} with ${JSON.stringify(overrides)} => '${expected}'`, () => {
      const m = { ...baseMetrics, ...overrides } as ReviewDashboardMetrics;
      assert.equal(assignMetricTone(key, m), expected);
    });
  }
});

// ── deriveReviewKpiCards ──────────────────────────────

describe('deriveReviewKpiCards', () => {
  const metrics: ReviewDashboardMetrics = {
    products: { filtered: 45, total: 120 },
    brands: 8,
    avgConfidence: 0.872,
    avgCoverage: 0.721,
    missingFields: 156,
    totalFields: 2700,
    runStatus: { ran: 40, total: 45 },
  };

  it('returns exactly 6 cards', () => {
    const cards = deriveReviewKpiCards(metrics);
    assert.equal(cards.length, 6);
  });

  it('has correct labels in order', () => {
    const cards = deriveReviewKpiCards(metrics);
    const labels = cards.map((c) => c.label);
    assert.deepStrictEqual(labels, [
      'Products',
      'Brands',
      'Avg Confidence',
      'Avg Coverage',
      'Missing Fields',
      'Run Status',
    ]);
  });

  it('formats Products as filtered/total', () => {
    const cards = deriveReviewKpiCards(metrics);
    assert.equal(cards[0].value, '45/120');
  });

  it('formats Brands as plain count', () => {
    const cards = deriveReviewKpiCards(metrics);
    assert.equal(cards[1].value, '8');
  });

  it('formats Avg Confidence as percentage', () => {
    const cards = deriveReviewKpiCards(metrics);
    assert.equal(cards[2].value, '87.2%');
  });

  it('formats Avg Coverage as percentage', () => {
    const cards = deriveReviewKpiCards(metrics);
    assert.equal(cards[3].value, '72.1%');
  });

  it('formats Missing Fields as missing/total', () => {
    const cards = deriveReviewKpiCards(metrics);
    assert.equal(cards[4].value, '156/2700');
  });

  it('formats Run Status as ran/total', () => {
    const cards = deriveReviewKpiCards(metrics);
    assert.equal(cards[5].value, '40/45');
  });

  it('assigns correct tones', () => {
    const cards = deriveReviewKpiCards(metrics);
    assert.equal(cards[0].tone, 'warning');   // 45 < 120 filtered
    assert.equal(cards[1].tone, 'accent');    // brands always accent
    assert.equal(cards[2].tone, 'success');   // 87.2% >= 80%
    assert.equal(cards[3].tone, 'warning');   // 72.1% < 80%, >= 50%
    assert.equal(cards[4].tone, 'warning');   // 156/2700 = 5.8% < 20%
    assert.equal(cards[5].tone, 'warning');   // 40 < 45
  });

  it('handles zero-product metrics without error', () => {
    const empty: ReviewDashboardMetrics = {
      products: { filtered: 0, total: 0 },
      brands: 0,
      avgConfidence: 0,
      avgCoverage: 0,
      missingFields: 0,
      totalFields: 0,
      runStatus: { ran: 0, total: 0 },
    };
    const cards = deriveReviewKpiCards(empty);
    assert.equal(cards.length, 6);
    assert.equal(cards[0].value, '0/0');
    assert.equal(cards[4].value, '0');
  });
});
