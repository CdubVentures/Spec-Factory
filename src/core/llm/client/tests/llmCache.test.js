import test from 'node:test';
import assert from 'node:assert/strict';
import { LLMCache } from '../llmCache.js';
import { SpecDb } from '../../../../db/specDb.js';

function makeCache(opts = {}) {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'test' });
  const cache = new LLMCache({
    specDb,
    defaultTtlMs: opts.defaultTtlMs || 10_000,
  });
  return { specDb, cache };
}

test('LLMCache stores and retrieves responses via SQL by deterministic key', async () => {
  const { cache } = makeCache();
  const key = cache.getCacheKey({
    model: 'gemini-2.0-flash',
    prompt: 'extract',
    evidence: { refs: ['s1'] },
  });

  await cache.set(key, { ok: true, candidates: 2 });
  const hit = await cache.get(key);
  assert.deepEqual(hit, { ok: true, candidates: 2 });
});

test('LLMCache expires stale entries by ttl', async () => {
  const originalNow = Date.now;
  let now = 1_000;
  try {
    Date.now = () => now;
    const { cache } = makeCache({ defaultTtlMs: 1 });
    const key = cache.getCacheKey({
      model: 'deepseek-reasoner',
      prompt: 'extract',
      evidence: { refs: ['s1'] },
    });
    await cache.set(key, { ok: true }, 1);
    now += 5;
    const miss = await cache.get(key);
    assert.equal(miss, null);
  } finally {
    Date.now = originalNow;
  }
});

test('getCacheKey produces deterministic SHA256 hashes', () => {
  const { cache } = makeCache();
  const key1 = cache.getCacheKey({ model: 'gpt-4', prompt: 'hello', evidence: { a: 1 } });
  const key2 = cache.getCacheKey({ model: 'gpt-4', prompt: 'hello', evidence: { a: 1 } });
  assert.equal(key1, key2);
  assert.match(key1, /^[a-f0-9]{64}$/);
});

test('get returns null when specDb is null', async () => {
  const cache = new LLMCache({ specDb: null });
  const result = await cache.get('some-key');
  assert.equal(result, null);
});

test('set is a no-op when specDb is null', async () => {
  const cache = new LLMCache({ specDb: null });
  await cache.set('some-key', { data: true });
  const result = await cache.get('some-key');
  assert.equal(result, null);
});
