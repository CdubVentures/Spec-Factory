import test from 'node:test';
import assert from 'node:assert/strict';
import { createPacer } from '../createPacer.js';

test('createPacer with zero interval resolves immediately', async () => {
  const pacer = createPacer({ minIntervalMs: 0 });
  const before = Date.now();
  await pacer.waitForSlot();
  const elapsed = Date.now() - before;
  assert.ok(elapsed < 50, `expected <50ms, got ${elapsed}ms`);
});

test('createPacer enforces minimum interval between calls', async () => {
  const pacer = createPacer({ minIntervalMs: 100 });
  await pacer.waitForSlot({ interval: 100 });
  const before = Date.now();
  await pacer.waitForSlot({ interval: 100 });
  const elapsed = Date.now() - before;
  assert.ok(elapsed >= 80, `expected >=80ms, got ${elapsed}ms`);
});

test('createPacer resetForTests clears pacing state', async () => {
  const pacer = createPacer({ minIntervalMs: 500 });
  await pacer.waitForSlot({ interval: 500 });
  pacer.resetForTests();
  const before = Date.now();
  await pacer.waitForSlot({ interval: 500 });
  const elapsed = Date.now() - before;
  // After reset, first call should not wait (no prior timestamp)
  assert.ok(elapsed < 50, `expected <50ms after reset, got ${elapsed}ms`);
});

test('createPacer applies jitter factor', async () => {
  const pacer = createPacer({ minIntervalMs: 100 });
  await pacer.waitForSlot({ interval: 100, jitterFactor: 0.3 });
  // Jitter adds up to 30% of interval, so next call waits 100-130ms
  const before = Date.now();
  await pacer.waitForSlot({ interval: 100, jitterFactor: 0.3 });
  const elapsed = Date.now() - before;
  assert.ok(elapsed >= 80, `expected >=80ms with jitter, got ${elapsed}ms`);
});

test('createPacer instances are independent', async () => {
  const p1 = createPacer({ minIntervalMs: 200 });
  const p2 = createPacer({ minIntervalMs: 0 });
  await p1.waitForSlot({ interval: 200 });
  // p2 should not be affected by p1's state
  const before = Date.now();
  await p2.waitForSlot();
  const elapsed = Date.now() - before;
  assert.ok(elapsed < 50, `p2 should be independent, got ${elapsed}ms`);
});

test('createPacer overrides minIntervalMs with per-call interval', async () => {
  const pacer = createPacer({ minIntervalMs: 500 });
  await pacer.waitForSlot({ interval: 0 });
  const before = Date.now();
  await pacer.waitForSlot({ interval: 0 });
  const elapsed = Date.now() - before;
  assert.ok(elapsed < 50, `per-call interval=0 should skip wait, got ${elapsed}ms`);
});
