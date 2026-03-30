import test from 'node:test';
import assert from 'node:assert/strict';

import { computeCompoundCurve } from '../compoundCurve.js';

// ── helpers ─────────────────────────────────────────────────
function makeRun(id, counters = {}) {
  return {
    run_id: id,
    category: 'mouse',
    counters: {
      fields_filled: counters.fields_filled ?? 0,
      fields_total: counters.fields_total ?? 0,
      ...counters,
    },
  };
}

function queryRow(runId, query = 'test query') {
  return { query, run_id: runId, ts: new Date().toISOString() };
}

function urlRow(runId, url) {
  return { url, run_id: runId, host: 'example.com', ts: new Date().toISOString() };
}

// ── tests ───────────────────────────────────────────────────
test('compoundCurve — 0 runs → NOT_PROVEN, empty', () => {
  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [],
    queryRows: [],
    urlRows: [],
  });
  assert.equal(result.verdict, 'NOT_PROVEN');
  assert.deepEqual(result.runs, []);
});

test('compoundCurve — 1 run → NOT_PROVEN', () => {
  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1', { fields_filled: 5, fields_total: 10 })],
    queryRows: [queryRow('r1'), queryRow('r1')],
    urlRows: [urlRow('r1', 'https://a.com/1')],
  });
  assert.equal(result.verdict, 'NOT_PROVEN');
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].url_reuse_pct, 0);
});

test('compoundCurve — empty queryRows → searches all 0', () => {
  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1'), makeRun('r2')],
    queryRows: [],
    urlRows: [urlRow('r1', 'https://a.com/1')],
  });
  assert.equal(result.runs[0].searches, 0);
  assert.equal(result.runs[1].searches, 0);
});

test('compoundCurve — empty urlRows → reuse all 0', () => {
  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1'), makeRun('r2')],
    queryRows: [queryRow('r1'), queryRow('r2')],
    urlRows: [],
  });
  assert.equal(result.runs[0].url_reuse_pct, 0);
  assert.equal(result.runs[1].url_reuse_pct, 0);
});

test('compoundCurve — declining searches ≥30% + increasing reuse → PROVEN', () => {
  // r1: 10 searches, r2: 7 searches, r3: 5 searches → 50% reduction
  const qRows = [
    ...Array.from({ length: 10 }, () => queryRow('r1')),
    ...Array.from({ length: 7 }, () => queryRow('r2')),
    ...Array.from({ length: 5 }, () => queryRow('r3')),
  ];

  // URL reuse: r1 has urls A,B,C; r2 has A,B,D; r3 has A,B,D,E
  const uRows = [
    urlRow('r1', 'https://a.com/1'), urlRow('r1', 'https://b.com/1'), urlRow('r1', 'https://c.com/1'),
    urlRow('r2', 'https://a.com/1'), urlRow('r2', 'https://b.com/1'), urlRow('r2', 'https://d.com/1'),
    urlRow('r3', 'https://a.com/1'), urlRow('r3', 'https://b.com/1'), urlRow('r3', 'https://d.com/1'), urlRow('r3', 'https://e.com/1'),
  ];

  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [
      makeRun('r1', { fields_filled: 3, fields_total: 10 }),
      makeRun('r2', { fields_filled: 5, fields_total: 10 }),
      makeRun('r3', { fields_filled: 7, fields_total: 10 }),
    ],
    queryRows: qRows,
    urlRows: uRows,
  });
  assert.equal(result.verdict, 'PROVEN');
});

test('compoundCurve — 10-29% reduction → PARTIAL', () => {
  // r1: 10 searches, r2: 8 searches → 20% reduction (partial)
  const qRows = [
    ...Array.from({ length: 10 }, () => queryRow('r1')),
    ...Array.from({ length: 8 }, () => queryRow('r2')),
  ];
  // No URL reuse (all unique)
  const uRows = [
    urlRow('r1', 'https://a.com/1'),
    urlRow('r2', 'https://z.com/1'),
  ];

  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1'), makeRun('r2')],
    queryRows: qRows,
    urlRows: uRows,
  });
  assert.equal(result.verdict, 'PARTIAL');
});

test('compoundCurve — <10% reduction, no reuse → NOT_PROVEN', () => {
  // r1: 10 searches, r2: 10 searches → 0% reduction
  const qRows = [
    ...Array.from({ length: 10 }, () => queryRow('r1')),
    ...Array.from({ length: 10 }, () => queryRow('r2')),
  ];
  const uRows = [
    urlRow('r1', 'https://a.com/1'),
    urlRow('r2', 'https://z.com/1'),
  ];

  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1'), makeRun('r2')],
    queryRows: qRows,
    urlRows: uRows,
  });
  assert.equal(result.verdict, 'NOT_PROVEN');
});

test('compoundCurve — URL reuse slope >1.0 → increasing', () => {
  const qRows = [queryRow('r1'), queryRow('r2'), queryRow('r3')];

  // r1: {A,B} r2: {A,B,C} (reuse 66%) r3: {A,B,C,D} (reuse 75%)
  const uRows = [
    urlRow('r1', 'https://a.com/1'), urlRow('r1', 'https://b.com/1'),
    urlRow('r2', 'https://a.com/1'), urlRow('r2', 'https://b.com/1'), urlRow('r2', 'https://c.com/1'),
    urlRow('r3', 'https://a.com/1'), urlRow('r3', 'https://b.com/1'), urlRow('r3', 'https://c.com/1'), urlRow('r3', 'https://d.com/1'),
  ];

  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1'), makeRun('r2'), makeRun('r3')],
    queryRows: qRows,
    urlRows: uRows,
  });
  assert.equal(result.url_reuse_trend, 'increasing');
});

test('compoundCurve — URL reuse slope <-1.0 → decreasing', () => {
  const qRows = [queryRow('r1'), queryRow('r2'), queryRow('r3'), queryRow('r4')];

  // r1: {A,B} r2: {A,B,C} (reuse 66%) r3: {D,E,F} (reuse 0%) r4: {G,H} (reuse 0%)
  const uRows = [
    urlRow('r1', 'https://a.com/1'), urlRow('r1', 'https://b.com/1'),
    urlRow('r2', 'https://a.com/1'), urlRow('r2', 'https://b.com/1'), urlRow('r2', 'https://c.com/1'),
    urlRow('r3', 'https://d.com/1'), urlRow('r3', 'https://e.com/1'), urlRow('r3', 'https://f.com/1'),
    urlRow('r4', 'https://g.com/1'), urlRow('r4', 'https://h.com/1'),
  ];

  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1'), makeRun('r2'), makeRun('r3'), makeRun('r4')],
    queryRows: qRows,
    urlRows: uRows,
  });
  assert.equal(result.url_reuse_trend, 'decreasing');
});

test('compoundCurve — slope between -1.0 and 1.0 → flat', () => {
  const qRows = [queryRow('r1'), queryRow('r2'), queryRow('r3')];

  // All unique URLs per run → zero reuse → flat slope (all 0)
  const uRows = [
    urlRow('r1', 'https://a.com/1'), urlRow('r1', 'https://b.com/1'),
    urlRow('r2', 'https://c.com/1'), urlRow('r2', 'https://d.com/1'),
    urlRow('r3', 'https://e.com/1'), urlRow('r3', 'https://f.com/1'),
  ];

  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1'), makeRun('r2'), makeRun('r3')],
    queryRows: qRows,
    urlRows: uRows,
  });
  assert.equal(result.url_reuse_trend, 'flat');
});

test('compoundCurve — first run search=0 → reduction=0', () => {
  const result = computeCompoundCurve({
    category: 'mouse',
    runSummaries: [makeRun('r1'), makeRun('r2')],
    queryRows: [],
    urlRows: [],
  });
  assert.equal(result.search_reduction_pct, 0);
});
