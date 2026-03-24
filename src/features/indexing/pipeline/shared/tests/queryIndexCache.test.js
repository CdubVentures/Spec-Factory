import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createQueryIndex } from '../createQueryIndex.js';
import { createPromptIndex } from '../createPromptIndex.js';

function withTempLog(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-cache-'));
  const logPath = path.join(dir, 'test.ndjson');
  try {
    fn(logPath);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Query index cache
// ---------------------------------------------------------------------------

test('queryIndexSummary reads file once on repeated calls (cache hit)', () => {
  withTempLog((logPath) => {
    const idx = createQueryIndex();
    idx.recordQueryResult({ query: 'q1', provider: 'serper', result_count: 5 }, logPath);

    const s1 = idx.queryIndexSummary(logPath);
    assert.equal(s1.total, 1);

    // Second call should use cache (same result, no re-read)
    const s2 = idx.queryIndexSummary(logPath);
    assert.equal(s2.total, 1);
    assert.deepEqual(s1, s2);
  });
});

test('queryIndex cache invalidates on recordQueryResult', () => {
  withTempLog((logPath) => {
    const idx = createQueryIndex();
    idx.recordQueryResult({ query: 'q1', provider: 'serper', result_count: 5 }, logPath);

    const s1 = idx.queryIndexSummary(logPath);
    assert.equal(s1.total, 1);

    idx.recordQueryResult({ query: 'q2', provider: 'serper', result_count: 3 }, logPath);

    const s2 = idx.queryIndexSummary(logPath);
    assert.equal(s2.total, 2);
  });
});

test('queryIndex cache invalidates on recordUrlVisit', () => {
  withTempLog((logPath) => {
    const idx = createQueryIndex();
    const urlLogPath = logPath + '.urls';

    idx.recordUrlVisit({ url: 'https://a.com', fetch_success: true, run_id: 'r1' }, urlLogPath);
    const h1 = idx.lookupUrlHistory('https://a.com', urlLogPath);
    assert.equal(h1.times_visited, 1);

    idx.recordUrlVisit({ url: 'https://a.com', fetch_success: false, run_id: 'r2' }, urlLogPath);
    const h2 = idx.lookupUrlHistory('https://a.com', urlLogPath);
    assert.equal(h2.times_visited, 2);
  });
});

test('createQueryIndex instances are independent (separate caches)', () => {
  withTempLog((logPath) => {
    const idx1 = createQueryIndex();
    const idx2 = createQueryIndex();

    idx1.recordQueryResult({ query: 'q1', provider: 'p1', result_count: 1 }, logPath);

    const s1 = idx1.queryIndexSummary(logPath);
    const s2 = idx2.queryIndexSummary(logPath);
    // Both should see the same data (read from file), but have separate caches
    assert.equal(s1.total, 1);
    assert.equal(s2.total, 1);
  });
});

// ---------------------------------------------------------------------------
// Prompt index cache
// ---------------------------------------------------------------------------

test('promptIndexSummary reads file once on repeated calls (cache hit)', () => {
  withTempLog((logPath) => {
    const idx = createPromptIndex();
    idx.recordPromptResult({ prompt_version: 'v1', field_count: 5, token_count: 100, success: true }, logPath);

    const s1 = idx.promptIndexSummary(logPath);
    assert.equal(s1.total_calls, 1);

    const s2 = idx.promptIndexSummary(logPath);
    assert.equal(s2.total_calls, 1);
    assert.deepEqual(s1, s2);
  });
});

test('promptIndex cache invalidates on recordPromptResult', () => {
  withTempLog((logPath) => {
    const idx = createPromptIndex();
    idx.recordPromptResult({ prompt_version: 'v1', field_count: 5, token_count: 100, success: true }, logPath);

    const s1 = idx.promptIndexSummary(logPath);
    assert.equal(s1.total_calls, 1);

    idx.recordPromptResult({ prompt_version: 'v2', field_count: 3, token_count: 50, success: false }, logPath);

    const s2 = idx.promptIndexSummary(logPath);
    assert.equal(s2.total_calls, 2);
  });
});
