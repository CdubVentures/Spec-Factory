import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  recordPromptResult,
  lookupPromptHistory,
  promptIndexSummary
} from '../promptIndex.js';

async function withTempLog(fn) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pi-test-'));
  const logPath = path.join(dir, 'prompts.ndjson');
  try {
    await fn(logPath);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

// ── recordPromptResult ──────────────────────────────────────

test('recordPromptResult appends NDJSON line', async () => {
  await withTempLog((logPath) => {
    recordPromptResult({
      prompt_version: 'v1.0',
      prompt_hash: 'abc123',
      model: 'gemini-2.0-flash',
      field_count: 5,
      token_count: 1200,
      latency_ms: 450,
      success: true,
      run_id: 'r1',
      category: 'mouse'
    }, logPath);

    const content = fs.readFileSync(logPath, 'utf8').trim();
    const parsed = JSON.parse(content);
    assert.equal(parsed.prompt_version, 'v1.0');
    assert.equal(parsed.model, 'gemini-2.0-flash');
    assert.equal(parsed.field_count, 5);
    assert.ok(parsed.ts);
  });
});

test('recordPromptResult appends multiple lines', async () => {
  await withTempLog((logPath) => {
    recordPromptResult({ prompt_version: 'v1', model: 'a', field_count: 1, token_count: 100, latency_ms: 50, success: true, run_id: 'r1', category: 'mouse' }, logPath);
    recordPromptResult({ prompt_version: 'v2', model: 'b', field_count: 2, token_count: 200, latency_ms: 100, success: false, run_id: 'r2', category: 'mouse' }, logPath);

    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
  });
});

// ── lookupPromptHistory ─────────────────────────────────────

test('lookupPromptHistory returns zeros for missing log', async () => {
  const missing = path.join(os.tmpdir(), 'nonexistent-ph-' + Date.now() + '.ndjson');
  const result = lookupPromptHistory('v1.0', missing);
  assert.equal(result.times_used, 0);
  assert.equal(result.avg_field_count, 0);
  assert.equal(result.success_rate, 0);
});

test('lookupPromptHistory computes averages correctly', async () => {
  await withTempLog((logPath) => {
    recordPromptResult({ prompt_version: 'v1.0', model: 'a', field_count: 4, token_count: 1000, latency_ms: 200, success: true, run_id: 'r1', category: 'mouse' }, logPath);
    recordPromptResult({ prompt_version: 'v1.0', model: 'a', field_count: 6, token_count: 1400, latency_ms: 300, success: true, run_id: 'r2', category: 'mouse' }, logPath);
    recordPromptResult({ prompt_version: 'v1.0', model: 'a', field_count: 2, token_count: 800, latency_ms: 100, success: false, run_id: 'r3', category: 'mouse' }, logPath);
    recordPromptResult({ prompt_version: 'v2.0', model: 'b', field_count: 10, token_count: 2000, latency_ms: 500, success: true, run_id: 'r4', category: 'mouse' }, logPath);

    const h = lookupPromptHistory('v1.0', logPath);
    assert.equal(h.times_used, 3);
    assert.equal(h.avg_field_count, 4);
    assert.equal(h.avg_token_count, (1000 + 1400 + 800) / 3);
    assert.equal(h.avg_latency_ms, 200);
    // 2 of 3 succeeded
    assert.ok(Math.abs(h.success_rate - 2 / 3) < 0.01);
  });
});

test('lookupPromptHistory returns zeros for unknown version', async () => {
  await withTempLog((logPath) => {
    recordPromptResult({ prompt_version: 'v1.0', model: 'a', field_count: 5, token_count: 1000, latency_ms: 200, success: true, run_id: 'r1', category: 'mouse' }, logPath);

    const h = lookupPromptHistory('v999', logPath);
    assert.equal(h.times_used, 0);
  });
});

// ── promptIndexSummary ──────────────────────────────────────

test('promptIndexSummary returns zeros for missing log', async () => {
  const missing = path.join(os.tmpdir(), 'nonexistent-pis-' + Date.now() + '.ndjson');
  const result = promptIndexSummary(missing);
  assert.equal(result.total_calls, 0);
  assert.equal(result.total_tokens, 0);
  assert.equal(result.unique_versions, 0);
  assert.deepEqual(result.versions, []);
  assert.deepEqual(result.model_breakdown, {});
});

test('promptIndexSummary computes full summary', async () => {
  await withTempLog((logPath) => {
    recordPromptResult({ prompt_version: 'v1', model: 'gemini', field_count: 3, token_count: 500, latency_ms: 100, success: true, run_id: 'r1', category: 'mouse' }, logPath);
    recordPromptResult({ prompt_version: 'v1', model: 'gemini', field_count: 5, token_count: 700, latency_ms: 200, success: true, run_id: 'r2', category: 'mouse' }, logPath);
    recordPromptResult({ prompt_version: 'v2', model: 'deepseek', field_count: 8, token_count: 1200, latency_ms: 400, success: false, run_id: 'r3', category: 'mouse' }, logPath);

    const s = promptIndexSummary(logPath);
    assert.equal(s.total_calls, 3);
    assert.equal(s.total_tokens, 500 + 700 + 1200);
    assert.equal(s.unique_versions, 2);
    assert.ok(s.versions.length === 2);
    assert.ok(s.model_breakdown.gemini);
    assert.ok(s.model_breakdown.deepseek);
    assert.equal(s.model_breakdown.gemini.call_count, 2);
    assert.equal(s.model_breakdown.deepseek.call_count, 1);
  });
});

test('promptIndexSummary versions include per-version stats', async () => {
  await withTempLog((logPath) => {
    recordPromptResult({ prompt_version: 'v1', model: 'a', field_count: 4, token_count: 600, latency_ms: 150, success: true, run_id: 'r1', category: 'mouse' }, logPath);
    recordPromptResult({ prompt_version: 'v1', model: 'a', field_count: 6, token_count: 800, latency_ms: 250, success: true, run_id: 'r2', category: 'mouse' }, logPath);

    const s = promptIndexSummary(logPath);
    const v1 = s.versions.find((v) => v.version === 'v1');
    assert.ok(v1);
    assert.equal(v1.call_count, 2);
    assert.equal(v1.avg_field_count, 5);
    assert.equal(v1.success_rate, 1);
  });
});
