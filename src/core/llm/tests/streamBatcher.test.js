// WHY: streamBatcher batches LLM token deltas and flushes via broadcastWs
// at a fixed interval to prevent WebSocket flood (~10 msg/sec vs ~100/sec).

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStreamBatcher } from '../streamBatcher.js';

function makeBroadcastSpy() {
  const calls = [];
  const fn = (channel, data) => calls.push({ channel, data });
  fn.calls = calls;
  return fn;
}

describe('createStreamBatcher', () => {
  it('flush emits accumulated text via broadcastWs', () => {
    const spy = makeBroadcastSpy();
    const batcher = createStreamBatcher({ operationId: 'op-1', broadcastWs: spy });
    batcher.push('Hello');
    batcher.push(' world');
    batcher.flush();
    batcher.dispose();

    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].channel, 'llm-stream');
    assert.deepEqual(spy.calls[0].data, { operationId: 'op-1', text: 'Hello world' });
  });

  it('empty buffer does not broadcast on flush', () => {
    const spy = makeBroadcastSpy();
    const batcher = createStreamBatcher({ operationId: 'op-1', broadcastWs: spy });
    batcher.flush();
    batcher.dispose();

    assert.equal(spy.calls.length, 0);
  });

  it('dispose does final flush then future push is no-op', () => {
    const spy = makeBroadcastSpy();
    const batcher = createStreamBatcher({ operationId: 'op-1', broadcastWs: spy });
    batcher.push('final');
    batcher.dispose();
    batcher.push('ignored');
    batcher.flush();

    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].data.text, 'final');
  });

  it('multiple pushes between flushes concatenate', () => {
    const spy = makeBroadcastSpy();
    const batcher = createStreamBatcher({ operationId: 'op-2', broadcastWs: spy });
    batcher.push('a');
    batcher.push('b');
    batcher.push('c');
    batcher.flush();
    batcher.dispose();

    assert.equal(spy.calls[0].data.text, 'abc');
  });

  it('second flush after first emits only new content', () => {
    const spy = makeBroadcastSpy();
    const batcher = createStreamBatcher({ operationId: 'op-3', broadcastWs: spy });
    batcher.push('first');
    batcher.flush();
    batcher.push('second');
    batcher.flush();
    batcher.dispose();

    assert.equal(spy.calls.length, 2);
    assert.equal(spy.calls[0].data.text, 'first');
    assert.equal(spy.calls[1].data.text, 'second');
  });
});
