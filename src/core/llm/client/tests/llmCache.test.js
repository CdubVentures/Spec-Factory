import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LLMCache } from '../llmCache.js';

test('LLMCache stores and retrieves responses by deterministic key', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-cache-test-'));
  try {
    const cache = new LLMCache({
      cacheDir: root,
      defaultTtlMs: 10_000
    });
    const key = cache.getCacheKey({
      model: 'gemini-2.0-flash',
      prompt: 'extract',
      evidence: { refs: ['s1'] }
    });

    await cache.set(key, { ok: true, candidates: 2 });
    const hit = await cache.get(key);
    assert.deepEqual(hit, { ok: true, candidates: 2 });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('LLMCache expires stale entries by ttl', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-cache-expiry-'));
  const originalNow = Date.now;
  let now = 1_000;
  try {
    Date.now = () => now;
    const cache = new LLMCache({
      cacheDir: root,
      defaultTtlMs: 1
    });
    const key = cache.getCacheKey({
      model: 'deepseek-reasoner',
      prompt: 'extract',
      evidence: { refs: ['s1'] }
    });
    await cache.set(key, { ok: true }, 1);
    now += 5;
    const miss = await cache.get(key);
    assert.equal(miss, null);
  } finally {
    Date.now = originalNow;
    await fs.rm(root, { recursive: true, force: true });
  }
});
