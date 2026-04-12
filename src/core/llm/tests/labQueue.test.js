import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueLabCall, _resetForTest } from '../labQueue.js';

// ---------------------------------------------------------------------------
// enqueueLabCall — dispatch-throttle contract tests
// ---------------------------------------------------------------------------

describe('enqueueLabCall', () => {
  // WHY: Reset module-level queue state between tests to prevent ordering leaks.
  test.afterEach(() => _resetForTest());

  test('returns the result of fn()', async () => {
    const result = await enqueueLabCall(() => Promise.resolve('hello'), 0);
    assert.equal(result, 'hello');
  });

  test('propagates errors from fn() to the caller', async () => {
    await assert.rejects(
      () => enqueueLabCall(() => Promise.reject(new Error('boom')), 0),
      { message: 'boom' },
    );
  });

  test('dispatches in FIFO order with delay between dispatches', async () => {
    const dispatches = [];
    const make = (label) => enqueueLabCall(async () => {
      dispatches.push({ label, at: Date.now() });
      await sleep(10); // simulate short work
      return label;
    }, 50);

    const [a, b, c] = await Promise.all([make('A'), make('B'), make('C')]);
    assert.equal(a, 'A');
    assert.equal(b, 'B');
    assert.equal(c, 'C');

    // Dispatches should be spaced ~50ms apart
    const gapAB = dispatches[1].at - dispatches[0].at;
    const gapBC = dispatches[2].at - dispatches[1].at;
    assert.ok(gapAB >= 40, `gap A→B dispatch was ${gapAB}ms, expected >= 40ms`);
    assert.ok(gapBC >= 40, `gap B→C dispatch was ${gapBC}ms, expected >= 40ms`);
  });

  test('calls run concurrently after dispatch — does NOT wait for completion', async () => {
    const events = [];
    const make = (label, workMs) => enqueueLabCall(async () => {
      events.push(`start:${label}`);
      await sleep(workMs);
      events.push(`end:${label}`);
      return label;
    }, 10);

    // A takes 200ms, B takes 10ms. If queue waited for completion,
    // B would start AFTER A ends. With dispatch-only throttle, B starts
    // while A is still running.
    await Promise.all([make('A', 200), make('B', 10)]);

    // B should START before A ENDS (overlap)
    const startB = events.indexOf('start:B');
    const endA = events.indexOf('end:A');
    assert.ok(startB < endA, `expected B to start before A ends, got: ${events.join(', ')}`);
  });

  test('failed call does not block subsequent dispatches', async () => {
    const results = [];
    const fail = enqueueLabCall(() => Promise.reject(new Error('fail')), 0);
    const ok = enqueueLabCall(async () => { results.push('ok'); return 'ok'; }, 0);

    await assert.rejects(() => fail, { message: 'fail' });
    const r = await ok;
    assert.equal(r, 'ok');
    assert.deepEqual(results, ['ok']);
  });

  test('zero delay dispatches immediately but still FIFO', async () => {
    const order = [];
    const make = (label) => enqueueLabCall(async () => {
      order.push(label);
      return label;
    }, 0);

    await Promise.all([make('A'), make('B'), make('C')]);
    assert.deepEqual(order, ['A', 'B', 'C']);
  });

  test('handles sync fn return', async () => {
    const result = await enqueueLabCall(() => 42, 0);
    assert.equal(result, 42);
  });
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
