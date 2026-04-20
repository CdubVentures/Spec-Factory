import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  pivotDailyByReason,
  computeAvgPerCall,
  computeDonutSlices,
  computeHorizontalBars,
  chartColor,
  computePeriodDeltas,
  computeFilterChipCounts,
  computeTokenSegments,
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

// ── computePeriodDeltas ─────────────────────────────────────────

function summary(totals: { cost_usd: number; calls: number; prompt_tokens: number; completion_tokens: number }) {
  return { month: '2026-04', totals: { ...totals, cached_prompt_tokens: 0 }, models_used: 0, categories_used: 0 };
}

describe('computePeriodDeltas', () => {
  it('returns all-flat zeros when both inputs are nullish', () => {
    const d = computePeriodDeltas(null, null);
    strictEqual(d.cost_usd.pct, 0);
    strictEqual(d.cost_usd.direction, 'flat');
    strictEqual(d.calls.direction, 'flat');
    strictEqual(d.prompt_tokens.direction, 'flat');
    strictEqual(d.completion_tokens.direction, 'flat');
  });

  it('up direction when current exceeds prior', () => {
    const current = summary({ cost_usd: 100, calls: 100, prompt_tokens: 1000, completion_tokens: 500 });
    const prior   = summary({ cost_usd: 80,  calls: 80,  prompt_tokens: 900,  completion_tokens: 400 });
    const d = computePeriodDeltas(current, prior);
    strictEqual(d.cost_usd.direction, 'up');
    ok(d.cost_usd.pct > 24 && d.cost_usd.pct < 26, `cost delta ~25% got ${d.cost_usd.pct}`);
  });

  it('down direction when current is lower', () => {
    const current = summary({ cost_usd: 50, calls: 50, prompt_tokens: 100, completion_tokens: 100 });
    const prior   = summary({ cost_usd: 100, calls: 100, prompt_tokens: 200, completion_tokens: 200 });
    const d = computePeriodDeltas(current, prior);
    strictEqual(d.cost_usd.direction, 'down');
    ok(d.cost_usd.pct < -49 && d.cost_usd.pct > -51, `cost delta ~-50% got ${d.cost_usd.pct}`);
  });

  it('flat direction when delta is below 0.5%', () => {
    const current = summary({ cost_usd: 100.2, calls: 100, prompt_tokens: 100, completion_tokens: 100 });
    const prior   = summary({ cost_usd: 100,   calls: 100, prompt_tokens: 100, completion_tokens: 100 });
    const d = computePeriodDeltas(current, prior);
    strictEqual(d.cost_usd.direction, 'flat');
    strictEqual(d.cost_usd.pct, 0);
  });

  it('zero-prior with positive current surfaces as 100% up', () => {
    const current = summary({ cost_usd: 50, calls: 10, prompt_tokens: 1000, completion_tokens: 200 });
    const prior   = summary({ cost_usd: 0,  calls: 0,  prompt_tokens: 0,    completion_tokens: 0 });
    const d = computePeriodDeltas(current, prior);
    strictEqual(d.cost_usd.direction, 'up');
    strictEqual(d.cost_usd.pct, 100);
  });

  it('zero-prior with zero current is flat', () => {
    const d = computePeriodDeltas(summary({ cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 }), summary({ cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 }));
    strictEqual(d.cost_usd.direction, 'flat');
  });
});

// ── computeFilterChipCounts ─────────────────────────────────────

describe('computeFilterChipCounts', () => {
  it('builds maps keyed by grouped item key', () => {
    const counts = computeFilterChipCounts(
      { month: '2026-04', models: [
        { key: 'gpt-5', cost_usd: 10, calls: 400, prompt_tokens: 0, completion_tokens: 0 },
        { key: 'grok', cost_usd: 1, calls: 50, prompt_tokens: 0, completion_tokens: 0 },
      ] },
      { month: '2026-04', reasons: [
        { key: 'writer_formatting', cost_usd: 14, calls: 214, prompt_tokens: 0, completion_tokens: 0 },
      ] },
      { month: '2026-04', categories: [
        { key: 'mouse', cost_usd: 22, calls: 624, prompt_tokens: 0, completion_tokens: 0 },
      ] },
    );
    strictEqual(counts.model['gpt-5'], 400);
    strictEqual(counts.model['grok'], 50);
    strictEqual(counts.reason['writer_formatting'], 214);
    strictEqual(counts.category['mouse'], 624);
  });

  it('returns empty maps when all inputs are nullish', () => {
    const counts = computeFilterChipCounts(undefined, undefined, undefined);
    deepStrictEqual(counts, { model: {}, reason: {}, category: {} });
  });
});

// ── computeTokenSegments ────────────────────────────────────────

describe('computeTokenSegments', () => {
  it('returns all-zero when total is 0', () => {
    const s = computeTokenSegments({ prompt_tokens: 0, completion_tokens: 0, cached_prompt_tokens: 0 });
    deepStrictEqual(s, { promptPct: 0, completionPct: 0, cachedPct: 0 });
  });

  it('all-prompt no-cache splits ~100% prompt / 0% completion / 0% cached', () => {
    const s = computeTokenSegments({ prompt_tokens: 1000, completion_tokens: 0, cached_prompt_tokens: 0 });
    strictEqual(s.promptPct, 100);
    strictEqual(s.completionPct, 0);
    strictEqual(s.cachedPct, 0);
  });

  it('when cached === prompt, billable-prompt is 0; cached takes prompt share', () => {
    const s = computeTokenSegments({ prompt_tokens: 1000, completion_tokens: 0, cached_prompt_tokens: 1000 });
    strictEqual(s.promptPct, 0);
    strictEqual(s.cachedPct, 100);
  });

  it('percentages sum to ~100 for a realistic mix', () => {
    const s = computeTokenSegments({ prompt_tokens: 14220, completion_tokens: 2481, cached_prompt_tokens: 9820 });
    const total = s.promptPct + s.completionPct + s.cachedPct;
    ok(Math.abs(total - 100) < 0.01, `segments sum ${total} !~ 100`);
    // Billable prompt = 4400, completion = 2481, cached = 9820 → total 16701
    ok(s.cachedPct > s.promptPct, 'cached should dominate in this fixture');
  });

  it('defaults cached to 0 when undefined (current ledger state)', () => {
    const s = computeTokenSegments({ prompt_tokens: 500, completion_tokens: 100 });
    strictEqual(s.cachedPct, 0);
    ok(s.promptPct > 80, `prompt should dominate: ${s.promptPct}`);
    ok(s.completionPct > 0 && s.completionPct < 20);
  });
});
