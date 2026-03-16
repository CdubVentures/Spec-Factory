import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { aggregateHostHealth } from '../src/features/indexing/analytics/hostHealthAggregator.js';

// ── helpers ─────────────────────────────────────────────────
async function withTempLog(lines, fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'host-health-'));
  const logPath = path.join(tmpDir, 'url-index.ndjson');
  if (lines !== null) {
    const text = lines.map((l) => typeof l === 'string' ? l : JSON.stringify(l)).join('\n');
    await fs.writeFile(logPath, text + '\n', 'utf8');
  }
  try {
    await fn(logPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function urlRow(host, fetchSuccess, fieldsFilled = 1, runId = 'r1') {
  return {
    url: `https://${host}/page-${Math.random().toString(36).slice(2, 6)}`,
    host,
    tier: 1,
    fields_filled: Array.from({ length: fieldsFilled }, (_, i) => `field_${i}`),
    fetch_success: fetchSuccess,
    run_id: runId,
    ts: new Date().toISOString(),
  };
}

// ── tests ───────────────────────────────────────────────────
test('hostHealth — missing file → empty array', () => {
  const result = aggregateHostHealth({
    urlIndexPath: '/nonexistent/path/url-index.ndjson',
    category: 'mouse',
  });
  assert.deepEqual(result, []);
});

test('hostHealth — all successful → healthy status', async () => {
  await withTempLog([
    urlRow('razer.com', true, 3),
    urlRow('razer.com', true, 2),
    urlRow('razer.com', true, 4),
  ], (logPath) => {
    const result = aggregateHostHealth({ urlIndexPath: logPath, category: 'mouse' });
    assert.equal(result.length, 1);
    assert.equal(result[0].host, 'razer.com');
    assert.equal(result[0].status, 'healthy');
    assert.equal(result[0].block_rate, 0);
    assert.equal(result[0].total, 3);
  });
});

test('hostHealth — ≥80% failures → blocked status', async () => {
  await withTempLog([
    urlRow('blocked.com', false),
    urlRow('blocked.com', false),
    urlRow('blocked.com', false),
    urlRow('blocked.com', false),
    urlRow('blocked.com', true),
  ], (logPath) => {
    const result = aggregateHostHealth({ urlIndexPath: logPath, category: 'mouse' });
    assert.equal(result.length, 1);
    assert.equal(result[0].status, 'blocked');
    assert.equal(result[0].block_rate, 0.8);
  });
});

test('hostHealth — multiple hosts mixed → correct per-host status', async () => {
  await withTempLog([
    // healthy.com: 0/3 failed → healthy
    urlRow('healthy.com', true), urlRow('healthy.com', true), urlRow('healthy.com', true),
    // degraded.com: 2/5 failed → 40% → degraded
    urlRow('degraded.com', false), urlRow('degraded.com', false),
    urlRow('degraded.com', true), urlRow('degraded.com', true), urlRow('degraded.com', true),
    // blocked.com: 9/10 failed → 90% → blocked
    ...Array.from({ length: 9 }, () => urlRow('blocked.com', false)),
    urlRow('blocked.com', true),
  ], (logPath) => {
    const result = aggregateHostHealth({ urlIndexPath: logPath, category: 'mouse' });
    assert.equal(result.length, 3);
    // Sorted by block_rate DESC
    assert.equal(result[0].host, 'blocked.com');
    assert.equal(result[0].status, 'blocked');
    assert.equal(result[1].host, 'degraded.com');
    assert.equal(result[1].status, 'degraded');
    assert.equal(result[2].host, 'healthy.com');
    assert.equal(result[2].status, 'healthy');
  });
});

test('hostHealth — empty file → empty array', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'host-health-empty-'));
  const logPath = path.join(tmpDir, 'url-index.ndjson');
  await fs.writeFile(logPath, '', 'utf8');
  try {
    const result = aggregateHostHealth({ urlIndexPath: logPath, category: 'mouse' });
    assert.deepEqual(result, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('hostHealth — malformed lines skipped', async () => {
  await withTempLog([
    'not valid json {{{',
    urlRow('good.com', true),
    '}{broken',
    urlRow('good.com', true),
  ], (logPath) => {
    const result = aggregateHostHealth({ urlIndexPath: logPath, category: 'mouse' });
    assert.equal(result.length, 1);
    assert.equal(result[0].host, 'good.com');
    assert.equal(result[0].total, 2);
  });
});
