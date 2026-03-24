import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostConcurrencyGate, createRequestThrottler } from '../requestThrottler.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('request throttler enforces global and per-key token buckets', async () => {
  let nowMs = 0;
  const waits = [];
  const throttler = createRequestThrottler({
    globalRps: 2,
    globalBurst: 1,
    keyRps: 1,
    keyBurst: 1,
    nowFn: () => nowMs,
    sleepFn: async (ms) => {
      waits.push(ms);
      nowMs += ms;
    }
  });

  await throttler.acquire({ key: 'a.example' });
  await throttler.acquire({ key: 'a.example' });
  await throttler.acquire({ key: 'b.example' });

  assert.deepEqual(waits, [1000, 500]);
});

test('request throttler penalize applies cooldown wait to matching key only', async () => {
  let nowMs = 5_000;
  const waits = [];
  const throttler = createRequestThrottler({
    nowFn: () => nowMs,
    sleepFn: async (ms) => {
      waits.push(ms);
      nowMs += ms;
    }
  });

  await throttler.acquire({ key: 'a.example' });
  assert.deepEqual(waits, []);

  const appliedPenaltyMs = throttler.penalize({
    key: 'a.example',
    cooldownMs: 750
  });
  assert.equal(appliedPenaltyMs, 750);

  await throttler.acquire({ key: 'a.example' });
  assert.deepEqual(waits, [750]);

  await throttler.acquire({ key: 'b.example' });
  assert.deepEqual(waits, [750]);
});

test('host concurrency gate serializes work per host key', async () => {
  const gate = createHostConcurrencyGate({ maxInFlight: 1 });
  let inFlight = 0;
  let maxInFlight = 0;

  const runTask = async (id, ms) =>
    gate.run({
      key: 'example.com',
      task: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(ms);
        inFlight -= 1;
        return id;
      }
    });

  const rows = await Promise.all([
    runTask('a', 25),
    runTask('b', 10),
    runTask('c', 5)
  ]);

  assert.deepEqual(rows.sort(), ['a', 'b', 'c']);
  assert.equal(maxInFlight, 1);
});

test('host concurrency gate allows parallel work across different host keys', async () => {
  const gate = createHostConcurrencyGate({ maxInFlight: 1 });
  let inFlight = 0;
  let maxInFlight = 0;

  await Promise.all([
    gate.run({
      key: 'a.example',
      task: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(30);
        inFlight -= 1;
      }
    }),
    gate.run({
      key: 'b.example',
      task: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await delay(30);
        inFlight -= 1;
      }
    })
  ]);

  assert.equal(maxInFlight >= 2, true);
});
