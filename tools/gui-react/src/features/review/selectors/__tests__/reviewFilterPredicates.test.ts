import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesConfidenceFilter,
  matchesCoverageFilter,
  matchesRunStatusFilter,
} from '../reviewFilterPredicates.ts';
import type { ProductReviewPayload } from '../../../../types/review.ts';
import type { ConfidenceFilter, CoverageFilter, RunStatusFilter } from '../../state/reviewFilterRegistry.ts';

// ── Factory ───────────────────────────────────────────

function makeProduct(overrides: Partial<{
  confidence: number;
  coverage: number;
  has_run: boolean;
}>): ProductReviewPayload {
  return {
    product_id: 'p-test',
    category: 'mouse',
    identity: { id: 1, identifier: 'test', brand: 'Test', model: 'M1', variant: '' },
    fields: {},
    metrics: {
      confidence: overrides.confidence ?? 0.5,
      coverage: overrides.coverage ?? 0.5,
      missing: 0,
      has_run: overrides.has_run ?? true,
      updated_at: '2026-04-15T00:00:00Z',
    },
  };
}

// ── matchesConfidenceFilter ───────────────────────────

describe('matchesConfidenceFilter', () => {
  const cases: [ConfidenceFilter, number, boolean][] = [
    // 'all' passes everything
    ['all', 0, true],
    ['all', 0.5, true],
    ['all', 1.0, true],

    // 'high' >= 0.8
    ['high', 0.8, true],
    ['high', 0.95, true],
    ['high', 1.0, true],
    ['high', 0.79, false],
    ['high', 0, false],

    // 'medium' >= 0.5 && < 0.8
    ['medium', 0.5, true],
    ['medium', 0.6, true],
    ['medium', 0.79, true],
    ['medium', 0.8, false],
    ['medium', 0.49, false],
    ['medium', 0, false],

    // 'low' < 0.5
    ['low', 0.49, true],
    ['low', 0.0, true],
    ['low', 0.1, true],
    ['low', 0.5, false],
    ['low', 0.8, false],
  ];

  for (const [filter, confidence, expected] of cases) {
    it(`filter='${filter}' confidence=${confidence} => ${expected}`, () => {
      const p = makeProduct({ confidence });
      assert.equal(matchesConfidenceFilter(p, filter), expected);
    });
  }
});

// ── matchesCoverageFilter ─────────────────────────────

describe('matchesCoverageFilter', () => {
  const cases: [CoverageFilter, number, boolean][] = [
    // 'all' passes everything
    ['all', 0, true],
    ['all', 0.5, true],
    ['all', 1.0, true],

    // 'complete' >= 1.0
    ['complete', 1.0, true],
    ['complete', 0.99, false],
    ['complete', 0, false],

    // 'partial' >= 0.5 && < 1.0
    ['partial', 0.5, true],
    ['partial', 0.75, true],
    ['partial', 0.99, true],
    ['partial', 1.0, false],
    ['partial', 0.49, false],
    ['partial', 0, false],

    // 'sparse' < 0.5
    ['sparse', 0.49, true],
    ['sparse', 0.0, true],
    ['sparse', 0.1, true],
    ['sparse', 0.5, false],
    ['sparse', 1.0, false],
  ];

  for (const [filter, coverage, expected] of cases) {
    it(`filter='${filter}' coverage=${coverage} => ${expected}`, () => {
      const p = makeProduct({ coverage });
      assert.equal(matchesCoverageFilter(p, filter), expected);
    });
  }
});

// ── matchesRunStatusFilter ────────────────────────────

describe('matchesRunStatusFilter', () => {
  const cases: [RunStatusFilter, boolean, boolean][] = [
    ['all', true, true],
    ['all', false, true],
    ['ran', true, true],
    ['ran', false, false],
    ['not-ran', false, true],
    ['not-ran', true, false],
  ];

  for (const [filter, has_run, expected] of cases) {
    it(`filter='${filter}' has_run=${has_run} => ${expected}`, () => {
      const p = makeProduct({ has_run });
      assert.equal(matchesRunStatusFilter(p, filter), expected);
    });
  }
});
