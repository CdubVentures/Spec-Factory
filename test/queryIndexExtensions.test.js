import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  isDeadQuery,
  queryIndexSummary,
  urlIndexSummary,
  highYieldUrls
} from '../src/features/indexing/discovery/queryIndex.js';

// Helper: create temp dir + NDJSON file
async function withTempLog(lines, fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'qi-ext-'));
  const logPath = path.join(dir, 'test.ndjson');
  if (lines.length > 0) {
    fs.appendFileSync(logPath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  }
  try {
    await fn(logPath);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

// ── isDeadQuery ─────────────────────────────────────────────

test('isDeadQuery returns false when log does not exist', async () => {
  const missing = path.join(os.tmpdir(), 'nonexistent-qi-' + Date.now() + '.ndjson');
  const result = isDeadQuery('test query', 'google', missing);
  assert.equal(result, false);
});

test('isDeadQuery returns false when query has fewer than 3 uses', async () => {
  await withTempLog([
    { query: 'q1', provider: 'google', field_yield: [], run_id: 'r1' },
    { query: 'q1', provider: 'google', field_yield: [], run_id: 'r2' }
  ], (logPath) => {
    assert.equal(isDeadQuery('q1', 'google', logPath), false);
  });
});

test('isDeadQuery returns true when query used >=3 times with no field yield', async () => {
  await withTempLog([
    { query: 'dead', provider: 'bing', field_yield: [], run_id: 'r1' },
    { query: 'dead', provider: 'bing', field_yield: null, run_id: 'r2' },
    { query: 'dead', provider: 'bing', field_yield: [], run_id: 'r3' }
  ], (logPath) => {
    assert.equal(isDeadQuery('dead', 'bing', logPath), true);
  });
});

test('isDeadQuery returns false when at least one use has field yield', async () => {
  await withTempLog([
    { query: 'alive', provider: 'google', field_yield: [], run_id: 'r1' },
    { query: 'alive', provider: 'google', field_yield: ['weight'], run_id: 'r2' },
    { query: 'alive', provider: 'google', field_yield: [], run_id: 'r3' }
  ], (logPath) => {
    assert.equal(isDeadQuery('alive', 'google', logPath), false);
  });
});

test('isDeadQuery only matches given provider', async () => {
  await withTempLog([
    { query: 'q', provider: 'google', field_yield: [], run_id: 'r1' },
    { query: 'q', provider: 'google', field_yield: [], run_id: 'r2' },
    { query: 'q', provider: 'google', field_yield: [], run_id: 'r3' },
    { query: 'q', provider: 'bing', field_yield: ['sensor'], run_id: 'r4' }
  ], (logPath) => {
    assert.equal(isDeadQuery('q', 'google', logPath), true);
    assert.equal(isDeadQuery('q', 'bing', logPath), false);
  });
});

// ── queryIndexSummary ───────────────────────────────────────

test('queryIndexSummary returns zeros for missing log', async () => {
  const missing = path.join(os.tmpdir(), 'nonexistent-qis-' + Date.now() + '.ndjson');
  const result = queryIndexSummary(missing);
  assert.equal(result.total, 0);
  assert.equal(result.dead_count, 0);
  assert.deepEqual(result.top_yield, []);
  assert.deepEqual(result.provider_breakdown, {});
});

test('queryIndexSummary computes correct breakdown', async () => {
  await withTempLog([
    { query: 'q1', provider: 'google', result_count: 10, field_yield: ['weight', 'sensor'], run_id: 'r1' },
    { query: 'q1', provider: 'google', result_count: 8, field_yield: ['weight'], run_id: 'r2' },
    { query: 'q1', provider: 'google', result_count: 6, field_yield: [], run_id: 'r3' },
    { query: 'q2', provider: 'bing', result_count: 5, field_yield: null, run_id: 'r1' },
    { query: 'q2', provider: 'bing', result_count: 3, field_yield: null, run_id: 'r2' },
    { query: 'q2', provider: 'bing', result_count: 4, field_yield: null, run_id: 'r3' }
  ], (logPath) => {
    const s = queryIndexSummary(logPath);
    assert.equal(s.total, 6);
    // q2 (bing) has 3 uses and all null yield → dead
    assert.equal(s.dead_count, 1);
    // provider breakdown
    assert.equal(s.provider_breakdown.google.query_count, 1);
    assert.equal(s.provider_breakdown.bing.query_count, 1);
    assert.equal(s.provider_breakdown.google.total_results, 24);
    // top_yield contains q1::google (avg yield 1.0) at top
    assert.ok(s.top_yield.length > 0);
    assert.equal(s.top_yield[0].query, 'q1');
  });
});

test('queryIndexSummary top_yield is capped at 10', async () => {
  const lines = [];
  for (let i = 0; i < 15; i++) {
    lines.push({ query: `q${i}`, provider: 'google', result_count: 1, field_yield: ['f' + i], run_id: 'r1' });
  }
  await withTempLog(lines, (logPath) => {
    const s = queryIndexSummary(logPath);
    assert.ok(s.top_yield.length <= 10);
  });
});

// ── urlIndexSummary ─────────────────────────────────────────

test('urlIndexSummary returns zeros for missing log', async () => {
  const missing = path.join(os.tmpdir(), 'nonexistent-uis-' + Date.now() + '.ndjson');
  const result = urlIndexSummary(missing);
  assert.equal(result.total, 0);
  assert.deepEqual(result.reuse_distribution, {});
  assert.deepEqual(result.high_yield, []);
  assert.deepEqual(result.tier_breakdown, {});
});

test('urlIndexSummary computes reuse distribution and tier breakdown', async () => {
  await withTempLog([
    { url: 'https://a.com', tier: 1, fields_filled: ['weight', 'sensor', 'dpi', 'buttons', 'shape'], fetch_success: true, run_id: 'r1' },
    { url: 'https://a.com', tier: 1, fields_filled: ['weight', 'sensor', 'dpi', 'buttons', 'shape'], fetch_success: true, run_id: 'r2' },
    { url: 'https://a.com', tier: 1, fields_filled: ['weight', 'sensor', 'dpi', 'buttons', 'shape'], fetch_success: true, run_id: 'r3' },
    { url: 'https://b.com', tier: 2, fields_filled: ['weight'], fetch_success: false, run_id: 'r1' }
  ], (logPath) => {
    const s = urlIndexSummary(logPath);
    assert.equal(s.total, 4);
    // reuse_distribution: a.com visited 3 times, b.com 1 time
    assert.equal(s.reuse_distribution['3'], 1);
    assert.equal(s.reuse_distribution['1'], 1);
    // high_yield: a.com qualifies (times_visited >= 3, fields_filled.length >= 5)
    assert.ok(s.high_yield.length >= 1);
    assert.ok(s.high_yield.some((u) => u.url === 'https://a.com'));
    // tier_breakdown
    assert.ok(s.tier_breakdown['1']);
    assert.ok(s.tier_breakdown['2']);
  });
});

test('urlIndexSummary deduplicates within same run_id', async () => {
  await withTempLog([
    { url: 'https://dup.com', tier: 1, fields_filled: ['a'], fetch_success: true, run_id: 'r1' },
    { url: 'https://dup.com', tier: 1, fields_filled: ['a'], fetch_success: true, run_id: 'r1' }
  ], (logPath) => {
    const s = urlIndexSummary(logPath);
    // After dedup, only 1 unique visit
    assert.equal(s.reuse_distribution['1'], 1);
  });
});

// ── highYieldUrls ───────────────────────────────────────────

test('highYieldUrls returns empty for missing log', async () => {
  const missing = path.join(os.tmpdir(), 'nonexistent-hyu-' + Date.now() + '.ndjson');
  const result = highYieldUrls(missing);
  assert.deepEqual(result, []);
});

test('highYieldUrls returns URLs meeting threshold', async () => {
  await withTempLog([
    { url: 'https://good.com', fetch_success: true, run_id: 'r1' },
    { url: 'https://good.com', fetch_success: true, run_id: 'r2' },
    { url: 'https://good.com', fetch_success: true, run_id: 'r3' },
    { url: 'https://bad.com', fetch_success: false, run_id: 'r1' },
    { url: 'https://bad.com', fetch_success: false, run_id: 'r2' },
    { url: 'https://bad.com', fetch_success: false, run_id: 'r3' }
  ], (logPath) => {
    const result = highYieldUrls(logPath, 3);
    assert.ok(result.includes('https://good.com'));
    assert.ok(!result.includes('https://bad.com'));
  });
});

test('highYieldUrls respects custom threshold', async () => {
  await withTempLog([
    { url: 'https://ok.com', fetch_success: true, run_id: 'r1' },
    { url: 'https://ok.com', fetch_success: true, run_id: 'r2' }
  ], (logPath) => {
    assert.deepEqual(highYieldUrls(logPath, 3), []);
    assert.ok(highYieldUrls(logPath, 2).includes('https://ok.com'));
  });
});
