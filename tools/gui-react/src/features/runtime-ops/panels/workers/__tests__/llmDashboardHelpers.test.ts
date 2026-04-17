import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ctMeta,
  CALL_TYPE_META,
  CALL_TYPE_ORDER,
  FILTER_GROUPS,
  fmtNum,
  fmtCost,
  fmtDur,
  fmtLatency,
  fmtSec,
  fmtCompact,
  pctOf,
  formatInputPreview,
  formatOutputPreview,
  computeFilteredStats,
  groupByRound,
  computeDonutSegments,
  modelRingColor,
  buildNarrative,
} from '../llmDashboardHelpers.ts';
import type { LlmCallRow, LlmWorkerSummary } from '../../../types.ts';

// ── Factories ────────────────────────────────────────────────────────────────

function makeCall(overrides: Partial<LlmCallRow> = {}): LlmCallRow {
  return {
    index: 1,
    worker_id: 'llm-w-001',
    call_type: 'extraction',
    round: 1,
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    status: 'done',
    prompt_tokens: 1000,
    completion_tokens: 500,
    total_tokens: 1500,
    estimated_cost: 0.005,
    duration_ms: 2000,
    prompt_preview: 'Extract specs from page',
    response_preview: '{"sensor": "Focus Pro 30K"}',
    prefetch_tab: null,
    is_fallback: false,
    is_lab: true,
    primary_duration_ms: null,
    ts: '2026-03-29T10:00:00Z',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<LlmWorkerSummary> = {}): LlmWorkerSummary {
  return {
    total_calls: 10,
    active_calls: 1,
    completed_calls: 9,
    total_cost_usd: 0.05,
    total_tokens: 15000,
    prompt_tokens: 10000,
    completion_tokens: 5000,
    avg_latency_ms: 2000,
    rounds: 3,
    calls_in_latest_round: 4,
    by_model: [
      { model: 'claude-sonnet-4-20250514', calls: 7, cost_usd: 0.035 },
      { model: 'claude-haiku-4-5-20251001', calls: 3, cost_usd: 0.015 },
    ],
    by_call_type: [
      { call_type: 'serp_selector', cost_usd: 0.025 },
      { call_type: 'brand_resolver', cost_usd: 0.015 },
      { call_type: 'needset_planner', cost_usd: 0.01 },
    ],
    ...overrides,
  };
}

// ── Characterization: ctMeta ─────────────────────────────────────────────────

describe('ctMeta', () => {
  it('returns metadata for known call types', () => {
    const m = ctMeta('needset_planner');
    assert.equal(m.symbol, '\u25A3');
    assert.equal(m.label, 'NeedSet Planner');
    assert.equal(m.chipClass, 'sf-chip-warning');
    assert.equal(m.prefetchTab, 'needset');
  });

  it('returns unknown fallback for unrecognized types', () => {
    const m = ctMeta('nonexistent');
    assert.equal(m.symbol, '?');
    assert.equal(m.label, 'Unknown');
    assert.equal(m.chipClass, 'sf-chip-neutral');
  });

  it('every CALL_TYPE_ORDER entry exists in CALL_TYPE_META', () => {
    for (const ct of CALL_TYPE_ORDER) {
      assert.ok(CALL_TYPE_META[ct], `missing meta for ${ct}`);
    }
  });
});

// ── Characterization: fmtCost ────────────────────────────────────────────────

describe('fmtCost', () => {
  const cases: Array<[number, boolean, string]> = [
    [0,       false, '$0'],
    [0.0001,  false, '$0.000100'],
    [0.005,   false, '$0.00500'],
    [0.5,     false, '$0.5000'],
    [1.5,     false, '$1.50'],
    [12.345,  false, '$12.35'],
    [0,       true,  '\u2014'],
    [99,      true,  '\u2014'],
    [NaN,     false, '$0'],
    [Infinity, false, '$0'],
  ];
  for (const [usd, active, expected] of cases) {
    it(`fmtCost(${usd}, ${active}) → '${expected}'`, () => {
      assert.equal(fmtCost(usd, active), expected);
    });
  }
});

// ── Characterization: fmtNum ─────────────────────────────────────────────────

describe('fmtNum', () => {
  it('formats finite numbers with locale separators', () => {
    const r = fmtNum(54231);
    assert.ok(r.includes('54') && r.includes('231'), `got ${r}`);
  });
  it('returns "0" for NaN', () => assert.equal(fmtNum(NaN), '0'));
  it('returns "0" for Infinity', () => assert.equal(fmtNum(Infinity), '0'));
});

// ── Characterization: fmtDur ─────────────────────────────────────────────────

describe('fmtDur', () => {
  it('returns dash for null', () => assert.equal(fmtDur(null), '\u2014'));
  it('returns dash for zero', () => assert.equal(fmtDur(0), '\u2014'));
  it('returns dash when active', () => assert.equal(fmtDur(2500, true), '\u2014'));
  it('formats ms to seconds', () => assert.equal(fmtDur(2500), '2.5s'));
});

// ── Characterization: fmtLatency ─────────────────────────────────────────────

describe('fmtLatency', () => {
  it('formats sub-second as ms', () => assert.equal(fmtLatency(500), '500ms'));
  it('formats >= 1000 as seconds', () => assert.equal(fmtLatency(2500), '2.5s'));
  it('rounds ms to integer', () => assert.equal(fmtLatency(123.7), '124ms'));
});

// ── Characterization: fmtSec ─────────────────────────────────────────────────

describe('fmtSec', () => {
  it('returns dash for null', () => assert.equal(fmtSec(null), '\u2014'));
  it('returns dash for undefined', () => assert.equal(fmtSec(undefined), '\u2014'));
  it('returns dash for zero', () => assert.equal(fmtSec(0), '\u2014'));
  it('returns dash for negative', () => assert.equal(fmtSec(-100), '\u2014'));
  it('formats positive ms', () => assert.equal(fmtSec(3200), '3.2s'));
});

// ── Characterization: pctOf ──────────────────────────────────────────────────

describe('pctOf', () => {
  it('calculates percentage', () => assert.equal(pctOf(72, 100), 72));
  it('returns 0 for zero total', () => assert.equal(pctOf(5, 0), 0));
  it('rounds to integer', () => assert.equal(pctOf(1, 3), 33));
});

// ── Characterization: formatInputPreview ─────────────────────────────────────

describe('formatInputPreview', () => {
  it('returns dash for null preview', () => {
    assert.equal(formatInputPreview(makeCall({ prompt_preview: null })), '\u2014');
  });

  it('parses JSON and extracts user field', () => {
    const call = makeCall({ prompt_preview: '{"user": "Extract specs please"}' });
    assert.equal(formatInputPreview(call), 'Extract specs please');
  });

  it('handles redacted JSON', () => {
    const call = makeCall({
      call_type: 'extraction',
      prompt_preview: '{"redacted": true, "system_chars": 500, "user_chars": 200}',
    });
    assert.equal(formatInputPreview(call), 'extraction (700 chars)');
  });

  it('falls back to raw text', () => {
    const call = makeCall({ prompt_preview: 'plain text prompt' });
    assert.equal(formatInputPreview(call), 'plain text prompt');
  });

  it('truncates to 120 chars', () => {
    const long = 'a'.repeat(200);
    const call = makeCall({ prompt_preview: long });
    assert.equal(formatInputPreview(call).length, 120);
  });
});

// ── Characterization: formatOutputPreview ────────────────────────────────────

describe('formatOutputPreview', () => {
  it('returns dash for null preview', () => {
    assert.equal(formatOutputPreview(makeCall({ response_preview: null })), '\u2014');
  });

  it('truncates to 120 chars', () => {
    const long = 'b'.repeat(200);
    assert.equal(formatOutputPreview(makeCall({ response_preview: long })).length, 120);
  });

  it('returns short previews as-is', () => {
    assert.equal(formatOutputPreview(makeCall({ response_preview: 'ok' })), 'ok');
  });
});

// ── New: fmtCompact ──────────────────────────────────────────────────────────

describe('fmtCompact', () => {
  it('returns "0" for zero', () => assert.equal(fmtCompact(0), '0'));
  it('returns "0" for NaN', () => assert.equal(fmtCompact(NaN), '0'));
  it('formats < 10K with locale', () => {
    const r = fmtCompact(1843);
    assert.ok(r.includes('1') && r.includes('843'), `got ${r}`);
  });
  it('formats >= 10K as K', () => assert.equal(fmtCompact(54231), '54.2K'));
  it('formats exactly 10K', () => assert.equal(fmtCompact(10000), '10.0K'));
});

// ── New: FILTER_GROUPS ───────────────────────────────────────────────────────

describe('FILTER_GROUPS', () => {
  it('has 2 groups (LLM Calls + Publish)', () => assert.equal(FILTER_GROUPS.length, 2));

  it('covers all CALL_TYPE_ORDER entries', () => {
    const allTypes = FILTER_GROUPS.flatMap((g) => g.types);
    for (const ct of CALL_TYPE_ORDER) {
      assert.ok(allTypes.includes(ct), `missing ${ct} in FILTER_GROUPS`);
    }
  });
});

// ── New: computeFilteredStats ────────────────────────────────────────────────

describe('computeFilteredStats', () => {
  it('returns summary passthrough when filter is "all"', () => {
    const summary = makeSummary();
    const result = computeFilteredStats([], summary, 'all');
    assert.equal(result, summary);
  });

  it('recalculates from filtered calls when filter is active', () => {
    const calls = [
      makeCall({ estimated_cost: 0.01, prompt_tokens: 500, completion_tokens: 200, round: 1 }),
      makeCall({ estimated_cost: 0.02, prompt_tokens: 800, completion_tokens: 300, round: 2, index: 2, worker_id: 'llm-w-002' }),
    ];
    const result = computeFilteredStats(calls, null, 'extraction');
    assert.equal(result.total_calls, 2);
    assert.equal(result.completed_calls, 2);
    assert.equal(result.active_calls, 0);
    assert.equal(result.total_tokens, 1800);
    assert.equal(result.prompt_tokens, 1300);
    assert.equal(result.completion_tokens, 500);
    assert.equal(result.rounds, 2);
  });

  it('counts active calls correctly', () => {
    const calls = [
      makeCall({ status: 'active', duration_ms: null }),
      makeCall({ status: 'done', index: 2, worker_id: 'llm-w-002' }),
    ];
    const result = computeFilteredStats(calls, null, 'extraction');
    assert.equal(result.active_calls, 1);
    assert.equal(result.completed_calls, 1);
  });
});

// ── New: groupByRound ────────────────────────────────────────────────────────

describe('groupByRound', () => {
  it('groups calls by round number', () => {
    const calls = [
      makeCall({ round: 2, call_type: 'extraction', worker_id: 'a' }),
      makeCall({ round: 1, call_type: 'needset_planner', worker_id: 'b' }),
      makeCall({ round: 1, call_type: 'brand_resolver', worker_id: 'c' }),
    ];
    const groups = groupByRound(calls);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].round, 1);
    assert.equal(groups[0].calls.length, 2);
    assert.equal(groups[1].round, 2);
  });

  it('sorts calls within a round by call type rank', () => {
    const calls = [
      makeCall({ round: 1, call_type: 'extraction', worker_id: 'a' }),
      makeCall({ round: 1, call_type: 'needset_planner', worker_id: 'b' }),
    ];
    const groups = groupByRound(calls);
    assert.equal(groups[0].calls[0].call_type, 'needset_planner');
    assert.equal(groups[0].calls[1].call_type, 'extraction');
  });

  it('returns empty array for no calls', () => {
    assert.deepEqual(groupByRound([]), []);
  });
});

// ── New: computeDonutSegments ────────────────────────────────────────────────

describe('computeDonutSegments', () => {
  const CIRC = 2 * Math.PI * 43;

  it('returns empty for empty input', () => {
    assert.deepEqual(computeDonutSegments([]), []);
  });

  it('returns single segment spanning full circle', () => {
    const segs = computeDonutSegments([{ model: 'sonnet', calls: 10, cost_usd: 0.1 }]);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].dashArray, `${CIRC} ${CIRC}`);
    assert.equal(segs[0].dashOffset, '0');
  });

  it('returns correct arcs for multiple models', () => {
    const segs = computeDonutSegments([
      { model: 'sonnet', calls: 6, cost_usd: 0.06 },
      { model: 'haiku', calls: 4, cost_usd: 0.04 },
    ]);
    assert.equal(segs.length, 2);
    const arc1 = (6 / 10) * CIRC;
    const arc2 = (4 / 10) * CIRC;
    assert.equal(segs[0].dashArray, `${arc1} ${CIRC}`);
    assert.equal(segs[0].dashOffset, '0');
    assert.equal(segs[1].dashArray, `${arc2} ${CIRC}`);
    assert.equal(segs[1].dashOffset, `${-arc1}`);
  });

  it('assigns colors via modelRingColor', () => {
    const segs = computeDonutSegments([{ model: 'claude-sonnet-4', calls: 1, cost_usd: 0 }]);
    assert.ok(segs[0].color.includes('info'), `got ${segs[0].color}`);
  });
});

// ── New: modelRingColor ──────────────────────────────────────────────────────

describe('modelRingColor', () => {
  it('haiku → success', () => assert.ok(modelRingColor('claude-haiku-4').includes('success')));
  it('sonnet → info', () => assert.ok(modelRingColor('claude-sonnet-4').includes('info')));
  it('opus → accent', () => assert.ok(modelRingColor('claude-opus-4').includes('accent')));
  it('flash-lite → teal', () => assert.ok(modelRingColor('gemini-flash-lite').includes('teal')));
  it('gpt → warning', () => assert.ok(modelRingColor('gpt-4o').includes('warning')));
  it('unknown → subtle', () => assert.ok(modelRingColor('some-model').includes('subtle')));
});

// ── New: buildNarrative ──────────────────────────────────────────────────────

describe('buildNarrative', () => {
  it('derives correct fields from summary', () => {
    const summary = makeSummary();
    const n = buildNarrative(summary);
    assert.equal(n.completed, 9);
    assert.equal(n.rounds, 3);
    assert.equal(n.modelCount, 2);
    assert.equal(n.topType, 'SERP Selector');
    assert.equal(n.topPct, 50);
    assert.equal(n.latestRoundCalls, 4);
  });

  it('handles empty by_call_type', () => {
    const summary = makeSummary({ by_call_type: [], total_cost_usd: 0 });
    const n = buildNarrative(summary);
    assert.equal(n.topType, 'N/A');
    assert.equal(n.topPct, 0);
  });
});
