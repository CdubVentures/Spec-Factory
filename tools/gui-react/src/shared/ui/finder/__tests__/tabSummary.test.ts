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
  });

  it('returns a frozen-shape FinderTabSummary (kpi + status only)', () => {
    const result = deriveScalarPublishedSummary({ candidates: [], totalVariants: 1 });
    deepStrictEqual(Object.keys(result).sort(), ['kpi', 'status']);
  });
});
