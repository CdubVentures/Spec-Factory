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

  // ── Signal-aware cancellation ─────────────────────────────────

  test('pre-aborted signal throws AbortError without calling fn', async () => {
    const controller = new AbortController();
    controller.abort();
    let fnCalled = false;
    await assert.rejects(
      () => enqueueLabCall(() => { fnCalled = true; return 42; }, 0, controller.signal),
      { name: 'AbortError' },
    );
    assert.equal(fnCalled, false);
  });

  test('signal aborted during queue sleep throws AbortError', async () => {
    const controller = new AbortController();
    // First call holds the queue for 200ms
    const first = enqueueLabCall(() => sleep(10).then(() => 'first'), 200);
    // Second call enters queue — will wait for 200ms delay
    const second = enqueueLabCall(() => 'second', 200, controller.signal);
    // Abort after 50ms (while second is waiting in queue)
    setTimeout(() => controller.abort(), 50);
    // WHY: Settle both in parallel to avoid unhandled-rejection window
    const [r1, r2] = await Promise.allSettled([first, second]);
    assert.equal(r1.status, 'fulfilled');
    assert.equal(r1.value, 'first');
    assert.equal(r2.status, 'rejected');
    assert.equal(r2.reason.name, 'AbortError');
  });

  test('no signal — existing behavior unchanged', async () => {
    const result = await enqueueLabCall(() => Promise.resolve('ok'), 0);
    assert.equal(result, 'ok');
  });
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
