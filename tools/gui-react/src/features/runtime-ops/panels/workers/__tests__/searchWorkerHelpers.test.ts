import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchStatusLabel,
  stateBadgeContent,
  attemptLabel,
  computeSearchStats,
  buildSearchNarrative,
  computeProviderUsage,
  computeTriageSummary,
} from '../searchWorkerHelpers.ts';
import type { SearchWorkerAttempt, RuntimeOpsWorkerRow } from '../../../types.ts';

// ── Factories ────────────────────────────────────────────────────────────────

function makeAttempt(overrides: Partial<SearchWorkerAttempt> = {}): SearchWorkerAttempt {
  return {
    attempt_no: 1,
    attempt_type: 'primary',
    attempt_type_label: '1',
    query: 'test query',
    provider: 'serper',
    resolved_provider: null,
    status: 'done',
    result_count: 10,
    duration_ms: 1200,
    started_ts: '2026-03-29T10:23:41Z',
    finished_ts: '2026-03-29T10:23:42Z',
    results: [],
    ...overrides,
  };
}

function makeWorker(overrides: Partial<RuntimeOpsWorkerRow> = {}): RuntimeOpsWorkerRow {
  return {
    worker_id: 'search-w-01',
    pool: 'search',
    state: 'running',
    tasks_started: 5,
    tasks_completed: 4,
    current_url: null,
    current_query: 'test',
    current_provider: 'serper',
    last_result_count: 10,
    last_duration_ms: 1200,
    last_error: null,
    elapsed_ms: 3000,
    slot_label: '1',
    ...overrides,
  } as RuntimeOpsWorkerRow;
}

// ── Characterization: searchStatusLabel ───────────────────────────────────────

describe('searchStatusLabel', () => {
  const cases: Array<[string, string, string]> = [
    ['done',    'Done',        'sf-chip-success'],
    ['zero',    '0 results',   'sf-chip-warning'],
    ['running', 'Running\u2026', 'sf-chip-info'],
    ['other',   'other',       'sf-chip-neutral'],
  ];
  for (const [status, label, chipClass] of cases) {
    it(`${status} → "${label}" / ${chipClass}`, () => {
      const r = searchStatusLabel(status);
      assert.equal(r.label, label);
      assert.equal(r.chipClass, chipClass);
    });
  }
});

// ── Characterization: stateBadgeContent ──────────────────────────────────────

describe('stateBadgeContent', () => {
  it('running → success chip + pulse', () => {
    const r = stateBadgeContent('running');
    assert.equal(r.chipClass, 'sf-chip-success');
    assert.equal(r.pulse, true);
  });
  it('stuck → warning chip', () => {
    assert.equal(stateBadgeContent('stuck').chipClass, 'sf-chip-warning');
  });
  it('queued → neutral chip with opacity', () => {
    assert.ok(stateBadgeContent('queued').chipClass.includes('opacity-50'));
  });
  it('idle → neutral chip', () => {
    assert.equal(stateBadgeContent('idle').pulse, false);
  });
  it('unknown → raw label', () => {
    assert.equal(stateBadgeContent('whatever').label, 'whatever');
  });
});

// ── New: attemptLabel ────────────────────────────────────────────────────────

describe('attemptLabel', () => {
  it('primary → p + label', () => {
    assert.equal(attemptLabel(makeAttempt({ attempt_type: 'primary', attempt_type_label: '3' })), 'p3');
  });
  it('fallback → f + label', () => {
    assert.equal(attemptLabel(makeAttempt({ attempt_type: 'fallback', attempt_type_label: '1' })), 'f1');
  });
  it('falls back to attempt_no if label empty', () => {
    assert.equal(attemptLabel(makeAttempt({ attempt_type: 'primary', attempt_type_label: '', attempt_no: 5 })), 'p5');
  });
});

// ── New: computeSearchStats ──────────────────────────────────────────────────

describe('computeSearchStats', () => {
  it('computes from attempts', () => {
    const attempts = [
      makeAttempt({ status: 'done', result_count: 10, duration_ms: 1200 }),
      makeAttempt({ status: 'done', result_count: 8, duration_ms: 900, attempt_no: 2 }),
      makeAttempt({ status: 'zero', result_count: 0, duration_ms: 2100, attempt_no: 3 }),
    ];
    const s = computeSearchStats(attempts, makeWorker());
    assert.equal(s.started, 3);
    assert.equal(s.completed, 2);
    assert.equal(s.zeroResults, 1);
    assert.equal(s.totalResults, 18);
    assert.equal(s.avgLatencyMs, 1400); // (1200+900+2100)/3
    assert.equal(s.avgResults, 9); // 18/2 done
  });

  it('handles empty attempts with worker fallback', () => {
    const s = computeSearchStats([], makeWorker({ tasks_started: 3 }));
    assert.equal(s.started, 3);
    assert.equal(s.completed, 0);
    assert.equal(s.avgLatencyMs, 0);
  });
});

// ── New: buildSearchNarrative ────────────────────────────────────────────────

describe('buildSearchNarrative', () => {
  it('returns correct fields', () => {
    const stats = computeSearchStats([
      makeAttempt({ status: 'done', result_count: 10, duration_ms: 1400 }),
    ], makeWorker());
    const n = buildSearchNarrative(stats, 'serper', (ms) => `${(ms / 1000).toFixed(1)}s`);
    assert.equal(n.completed, 1);
    assert.equal(n.started, 1);
    assert.equal(n.provider, 'serper');
    assert.equal(n.avgResults, '10.0');
    assert.equal(n.avgLatency, '1.4s');
  });
});

// ── New: computeProviderUsage ────────────────────────────────────────────────

describe('computeProviderUsage', () => {
  it('groups by provider sorted by query count', () => {
    const attempts = [
      makeAttempt({ provider: 'serper', result_count: 10 }),
      makeAttempt({ provider: 'serper', result_count: 8, attempt_no: 2 }),
      makeAttempt({ provider: 'google', result_count: 5, attempt_no: 3 }),
    ];
    const u = computeProviderUsage(attempts);
    assert.equal(u.length, 2);
    assert.equal(u[0].provider, 'serper');
    assert.equal(u[0].queries, 2);
    assert.equal(u[0].results, 18);
    assert.equal(u[1].provider, 'google');
    assert.equal(u[1].queries, 1);
  });

  it('returns empty for no attempts', () => {
    assert.deepEqual(computeProviderUsage([]), []);
  });
});

// ── New: computeTriageSummary ────────────────────────────────────────────────

describe('computeTriageSummary', () => {
  it('counts decisions correctly', () => {
    const results = [
      { decision: 'keep', fetched: true },
      { decision: 'keep', fetched: true },
      { decision: 'maybe', fetched: true },
      { decision: 'drop', fetched: false },
      { decision: 'hard_drop', fetched: false },
    ];
    const t = computeTriageSummary(results);
    assert.equal(t.keep, 2);
    assert.equal(t.maybe, 1);
    assert.equal(t.drop, 1);
    assert.equal(t.hardDrop, 1);
    assert.equal(t.total, 5);
    assert.equal(t.fetched, 3);
  });

  it('handles empty', () => {
    const t = computeTriageSummary([]);
    assert.equal(t.total, 0);
    assert.equal(t.keep, 0);
  });
});
