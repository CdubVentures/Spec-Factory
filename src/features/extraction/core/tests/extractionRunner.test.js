import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createExtractionRunner } from '../extractionRunner.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createPluginStub({
  name,
  result,
  gate = null,
  onStart = null,
  onFinish = null,
  shouldThrow = false,
} = {}) {
  return {
    name,
    async onExtract() {
      onStart?.();
      if (gate) {
        await gate.promise;
      }
      onFinish?.();
      if (shouldThrow) throw new Error(`${name} exploded`);
      return result;
    },
  };
}

describe('createExtractionRunner', () => {
  it('returns empty object when no plugins are provided', async () => {
    const runner = createExtractionRunner({ plugins: [] });
    const result = await runner.runExtractions({ url: 'https://example.com' });
    assert.deepStrictEqual(result, {});
  });

  it('runs a single plugin and returns its result keyed by name', async () => {
    const plugin = createPluginStub({ name: 'screenshot', result: { screenshots: [1, 2] } });
    const runner = createExtractionRunner({ plugins: [plugin] });
    const result = await runner.runExtractions({ url: 'https://example.com' });
    assert.deepStrictEqual(result, { screenshot: { screenshots: [1, 2] } });
  });

  it('runs multiple plugins sequentially and collects all results', async () => {
    const started = [];
    const gateA = createDeferred();
    const pluginA = createPluginStub({
      name: 'alpha',
      result: { a: 1 },
      gate: gateA,
      onStart: () => started.push('alpha'),
    });
    const pluginB = createPluginStub({
      name: 'beta',
      result: { b: 2 },
      onStart: () => started.push('beta'),
    });
    const runner = createExtractionRunner({ plugins: [pluginA, pluginB] });
    const resultPromise = runner.runExtractions({ url: 'https://example.com' });

    await flushAsyncWork();
    // Sequential: only alpha has started; beta is blocked waiting for alpha
    assert.deepStrictEqual(started, ['alpha']);

    gateA.resolve();
    const result = await resultPromise;
    // After alpha completes, beta runs and finishes
    assert.deepStrictEqual(started, ['alpha', 'beta']);
    assert.deepStrictEqual(result, { alpha: { a: 1 }, beta: { b: 2 } });
  });

  it('executes plugins sequentially not concurrently', async () => {
    const lifecycle = [];
    const pluginA = createPluginStub({
      name: 'slow',
      result: {},
      onStart: () => lifecycle.push('slow:start'),
      onFinish: () => lifecycle.push('slow:finish'),
    });
    const pluginB = createPluginStub({
      name: 'also-slow',
      result: {},
      onStart: () => lifecycle.push('also-slow:start'),
      onFinish: () => lifecycle.push('also-slow:finish'),
    });
    const runner = createExtractionRunner({ plugins: [pluginA, pluginB] });
    await runner.runExtractions({ url: 'https://example.com' });

    // Sequential: each plugin must fully complete before the next starts
    assert.deepStrictEqual(
      lifecycle,
      ['slow:start', 'slow:finish', 'also-slow:start', 'also-slow:finish'],
    );
  });

  it('isolates plugin failures — one crash does not affect others', async () => {
    const good = createPluginStub({ name: 'good', result: { ok: true } });
    const bad = createPluginStub({ name: 'bad', shouldThrow: true });
    const runner = createExtractionRunner({ plugins: [bad, good] });
    const result = await runner.runExtractions({ url: 'https://example.com' });
    assert.deepStrictEqual(result, { good: { ok: true } });
    assert.strictEqual(result.bad, undefined);
  });

  it('passes a frozen context — plugins cannot mutate shared state', async () => {
    const mutator = {
      name: 'mutator',
      async onExtract(ctx) {
        assert.throws(() => { ctx.injected = true; }, TypeError);
        assert.throws(() => {
          ctx.settings.capturePageScreenshotEnabled = false;
        }, TypeError);
        return { tried: true };
      },
    };
    const runner = createExtractionRunner({ plugins: [mutator] });
    const result = await runner.runExtractions({
      url: 'https://example.com',
      settings: { capturePageScreenshotEnabled: true },
    });
    assert.deepStrictEqual(result, { mutator: { tried: true } });
  });

  it('emits extraction_plugin_completed via logger for each successful plugin', async () => {
    const events = [];
    const logger = { info: (evt, data) => events.push({ evt, data }), error: () => {} };
    const plugin = createPluginStub({ name: 'test', result: {} });
    const runner = createExtractionRunner({ plugins: [plugin], logger });
    await runner.runExtractions({ url: 'https://example.com', workerId: 'fetch-1' });
    const completed = events.filter((e) => e.evt === 'extraction_plugin_completed');
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].data.plugin, 'test');
    assert.strictEqual(completed[0].data.worker_id, 'fetch-1');
  });

  it('emits extraction_plugin_failed via logger for crashed plugins', async () => {
    const errors = [];
    const logger = { info: () => {}, error: (evt, data) => errors.push({ evt, data }) };
    const bad = createPluginStub({ name: 'crasher', shouldThrow: true });
    const runner = createExtractionRunner({ plugins: [bad], logger });
    await runner.runExtractions({ url: 'https://example.com', workerId: 'fetch-1' });
    const failed = errors.filter((e) => e.evt === 'extraction_plugin_failed');
    assert.deepStrictEqual(failed, [{
      evt: 'extraction_plugin_failed',
      data: {
        plugin: 'crasher',
        reason: 'crasher exploded',
        worker_id: 'fetch-1',
        url: 'https://example.com',
      },
    }]);
  });
});
