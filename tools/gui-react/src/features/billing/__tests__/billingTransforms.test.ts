import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  pivotDailyByReason,
  computeAvgPerCall,
  computeDonutSlices,
  computeHorizontalBars,
  chartColor,
} from '../billingTransforms.ts';

// ── pivotDailyByReason ──────────────────────────────────────────

describe('pivotDailyByReason', () => {
  it('returns empty array for empty input', () => {
    deepStrictEqual(pivotDailyByReason([]), []);
  });

  it('pivots single day / single reason', () => {
    const input = [{ day: '2026-04-10', reason: 'extract', calls: 5, cost_usd: 0.03 }];
    const result = pivotDailyByReason(input);
    strictEqual(result.length, 1);
    strictEqual(result[0].day, '2026-04-10');
    strictEqual(result[0]['extract'], 0.03);
  });

  it('pivots multi-day / multi-reason into correct shape', () => {
    const input = [
      { day: '2026-04-10', reason: 'extract', calls: 5, cost_usd: 0.03 },
      { day: '2026-04-10', reason: 'health', calls: 2, cost_usd: 0.01 },
      { day: '2026-04-11', reason: 'extract', calls: 3, cost_usd: 0.02 },
    ];
    const result = pivotDailyByReason(input);
    strictEqual(result.length, 2);

    const day10 = result.find((r) => r.day === '2026-04-10');
    ok(day10);
    strictEqual(day10['extract'], 0.03);
    strictEqual(day10['health'], 0.01);

    const day11 = result.find((r) => r.day === '2026-04-11');
    ok(day11);
    strictEqual(day11['extract'], 0.02);
    strictEqual(day11['health'], undefined);
  });

  it('sorts rows by day ascending', () => {
    const input = [
      { day: '2026-04-12', reason: 'a', calls: 1, cost_usd: 0.01 },
      { day: '2026-04-10', reason: 'a', calls: 1, cost_usd: 0.01 },
      { day: '2026-04-11', reason: 'a', calls: 1, cost_usd: 0.01 },
    ];
    const result = pivotDailyByReason(input);
    strictEqual(result[0].day, '2026-04-10');
    strictEqual(result[1].day, '2026-04-11');
    strictEqual(result[2].day, '2026-04-12');
  });
});

// ── computeAvgPerCall ───────────────────────────────────────────

describe('computeAvgPerCall', () => {
  it('returns 0 when calls is 0', () => {
    strictEqual(computeAvgPerCall(10, 0), 0);
  });

  it('divides cost by calls', () => {
    strictEqual(computeAvgPerCall(1, 100), 0.01);
  });

  it('handles single call', () => {
    strictEqual(computeAvgPerCall(0.05, 1), 0.05);
  });
});

// ── computeDonutSlices ──────────────────────────────────────────

describe('computeDonutSlices', () => {
  it('returns empty array for empty input', () => {
    deepStrictEqual(computeDonutSlices([]), []);
  });

  it('computes percentage for single reason', () => {
    const input = [{ key: 'extract', cost_usd: 1, calls: 10, prompt_tokens: 0, completion_tokens: 0 }];
    const result = computeDonutSlices(input);
    strictEqual(result.length, 1);
    strictEqual(result[0].reason, 'extract');
    strictEqual(result[0].pct, 100);
    ok(result[0].label.length > 0);
    ok(result[0].color.length > 0);
  });

  it('percentages sum to approximately 100', () => {
    const input = [
      { key: 'extract', cost_usd: 3, calls: 10, prompt_tokens: 0, completion_tokens: 0 },
      { key: 'health', cost_usd: 1, calls: 5, prompt_tokens: 0, completion_tokens: 0 },
    ];
    const result = computeDonutSlices(input);
    const total = result.reduce((sum, s) => sum + s.pct, 0);
    ok(Math.abs(total - 100) < 0.1, `percentages sum to ${total}, expected ~100`);
  });

  it('excludes zero-cost reasons', () => {
    const input = [
      { key: 'extract', cost_usd: 1, calls: 10, prompt_tokens: 0, completion_tokens: 0 },
      { key: 'health', cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 },
    ];
    const result = computeDonutSlices(input);
    strictEqual(result.length, 1);
    strictEqual(result[0].reason, 'extract');
  });
});

// ── computeHorizontalBars ───────────────────────────────────────

describe('computeHorizontalBars', () => {
  it('returns empty array for empty input', () => {
    deepStrictEqual(computeHorizontalBars([]), []);
  });

  it('single item gets pctOfMax = 100', () => {
    const input = [{ key: 'mouse', cost_usd: 5, calls: 100, prompt_tokens: 0, completion_tokens: 0 }];
    const result = computeHorizontalBars(input);
    strictEqual(result.length, 1);
    strictEqual(result[0].pctOfMax, 100);
  });

  it('multiple items scale relative to max', () => {
    const input = [
      { key: 'mouse', cost_usd: 10, calls: 100, prompt_tokens: 0, completion_tokens: 0 },
      { key: 'keyboard', cost_usd: 5, calls: 50, prompt_tokens: 0, completion_tokens: 0 },
    ];
    const result = computeHorizontalBars(input);
    strictEqual(result[0].pctOfMax, 100);
    strictEqual(result[1].pctOfMax, 50);
  });

  it('handles all-zero cost', () => {
    const input = [{ key: 'mouse', cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 }];
    const result = computeHorizontalBars(input);
    strictEqual(result[0].pctOfMax, 0);
  });
});

// ── chartColor ──────────────────────────────────────────────────

describe('chartColor', () => {
  it('extracts hex fallback from var(--token, #hex)', () => {
    strictEqual(chartColor('var(--sf-teal-fg, #5eead4)'), '#5eead4');
  });

  it('returns full var() string when no hex fallback', () => {
    strictEqual(chartColor('var(--sf-token-accent)'), 'var(--sf-token-accent)');
  });

  it('passes through bare hex', () => {
    strictEqual(chartColor('#ff0000'), '#ff0000');
  });
});
