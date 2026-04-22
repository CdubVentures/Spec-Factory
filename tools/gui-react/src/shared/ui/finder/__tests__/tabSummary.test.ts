import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { deriveScalarPublishedSummary } from '../tabSummary.ts';

describe('deriveScalarPublishedSummary', () => {
  it('returns idle with "no variants" KPI when no CEF variants yet', () => {
    const result = deriveScalarPublishedSummary({ candidates: [], totalVariants: 0 });
    strictEqual(result.status, 'idle');
    strictEqual(result.kpi, 'no variants');
  });

  it('returns empty when variants exist but no published candidates', () => {
    const result = deriveScalarPublishedSummary({ candidates: [], totalVariants: 4 });
    strictEqual(result.status, 'empty');
    strictEqual(result.kpi, '0 / 4 published');
  });

  it('ignores candidates with no publisher_candidates', () => {
    const result = deriveScalarPublishedSummary({
      candidates: [{}, {}],
      totalVariants: 2,
    });
    strictEqual(result.status, 'empty');
    strictEqual(result.kpi, '0 / 2 published');
  });

  it('ignores candidates whose publisher_candidates are not resolved', () => {
    const result = deriveScalarPublishedSummary({
      candidates: [
        { publisher_candidates: [{ status: 'rejected' }, { status: 'candidate' }] },
      ],
      totalVariants: 2,
    });
    strictEqual(result.kpi, '0 / 2 published');
    strictEqual(result.status, 'empty');
  });

  it('counts a candidate as published when any publisher_candidate is resolved', () => {
    const result = deriveScalarPublishedSummary({
      candidates: [
        { publisher_candidates: [{ status: 'candidate' }, { status: 'resolved' }] },
      ],
      totalVariants: 4,
    });
    strictEqual(result.kpi, '1 / 4 published');
    strictEqual(result.status, 'partial');
  });

  it('returns partial when 0 < published < total', () => {
    const result = deriveScalarPublishedSummary({
      candidates: [
        { publisher_candidates: [{ status: 'resolved' }] },
        { publisher_candidates: [{ status: 'resolved' }] },
        { publisher_candidates: [{ status: 'candidate' }] },
      ],
      totalVariants: 4,
    });
    strictEqual(result.kpi, '2 / 4 published');
    strictEqual(result.status, 'partial');
    strictEqual(result.numerator, 2);
    strictEqual(result.denominator, 4);
    strictEqual(result.percent, 50);
  });

  it('returns complete when published >= total', () => {
    const result = deriveScalarPublishedSummary({
      candidates: [
        { publisher_candidates: [{ status: 'resolved' }] },
        { publisher_candidates: [{ status: 'resolved' }] },
      ],
      totalVariants: 2,
    });
    strictEqual(result.kpi, '2 / 2 published');
    strictEqual(result.status, 'complete');
    strictEqual(result.numerator, 2);
    strictEqual(result.denominator, 2);
    strictEqual(result.percent, 100);
  });

  it('rounds percent to the nearest integer', () => {
    const result = deriveScalarPublishedSummary({
      candidates: [{ publisher_candidates: [{ status: 'resolved' }] }],
      totalVariants: 3,
    });
    // 1/3 = 33.333… → 33
    strictEqual(result.percent, 33);
  });

  it('omits ratio fields entirely when totalVariants is 0 (no ratio semantics)', () => {
    const result = deriveScalarPublishedSummary({ candidates: [], totalVariants: 0 });
    deepStrictEqual(Object.keys(result).sort(), ['kpi', 'status']);
  });

  it('includes numerator/denominator/percent whenever a ratio is meaningful', () => {
    const result = deriveScalarPublishedSummary({ candidates: [], totalVariants: 4 });
    deepStrictEqual(
      Object.keys(result).sort(),
      ['denominator', 'kpi', 'numerator', 'percent', 'status'],
    );
  });
});
