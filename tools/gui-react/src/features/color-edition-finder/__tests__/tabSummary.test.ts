import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { deriveCefTabSummary } from '../tabSummary.ts';
import type { ColorEditionFinderResult } from '../types.ts';

function makeResult(overrides: Partial<ColorEditionFinderResult['published']> = {}): ColorEditionFinderResult {
  return {
    product_id: 'p',
    category: 'mouse',
    run_count: 0,
    last_ran_at: '',
    published: {
      colors: [],
      editions: [],
      default_color: '',
      ...overrides,
    },
    variant_registry: [],
    runs: [],
  };
}

describe('deriveCefTabSummary', () => {
  it('returns idle with em-dash KPI when data is null', () => {
    const r = deriveCefTabSummary(null);
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, '— · —');
  });

  it('returns idle when both colors and editions are empty', () => {
    const r = deriveCefTabSummary(makeResult());
    strictEqual(r.status, 'idle');
    strictEqual(r.kpi, '— · —');
  });

  it('returns complete when at least one color exists', () => {
    const r = deriveCefTabSummary(makeResult({ colors: ['black'] }));
    strictEqual(r.status, 'complete');
    strictEqual(r.kpi, '1c · 0ed');
  });

  it('returns complete when at least one edition exists', () => {
    const r = deriveCefTabSummary(makeResult({ editions: ['launch'] }));
    strictEqual(r.status, 'complete');
    strictEqual(r.kpi, '0c · 1ed');
  });

  it('counts both colors and editions in the KPI', () => {
    const r = deriveCefTabSummary(makeResult({
      colors: ['black', 'white', 'gray'],
      editions: ['launch'],
    }));
    strictEqual(r.kpi, '3c · 1ed');
    strictEqual(r.status, 'complete');
  });
});
