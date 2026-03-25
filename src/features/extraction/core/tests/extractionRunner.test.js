import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createExtractionRunner } from '../extractionRunner.js';

function createPluginStub({ name, result, delayMs = 0, shouldThrow = false } = {}) {
  return {
    name,
    async onExtract() {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
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

  it('runs multiple plugins concurrently and collects all results', async () => {
    const pluginA = createPluginStub({ name: 'alpha', result: { a: 1 }, delayMs: 20 });
    const pluginB = createPluginStub({ name: 'beta', result: { b: 2 }, delayMs: 10 });
    const runner = createExtractionRunner({ plugins: [pluginA, pluginB] });
    const result = await runner.runExtractions({ url: 'https://example.com' });
    assert.deepStrictEqual(result, { alpha: { a: 1 }, beta: { b: 2 } });
  });

  it('executes plugins concurrently not sequentially', async () => {
    const start = Date.now();
    const pluginA = createPluginStub({ name: 'slow', result: {}, delayMs: 50 });
    const pluginB = createPluginStub({ name: 'also-slow', result: {}, delayMs: 50 });
    const runner = createExtractionRunner({ plugins: [pluginA, pluginB] });
    await runner.runExtractions({ url: 'https://example.com' });
    const elapsed = Date.now() - start;
    // Sequential would take ~100ms, concurrent should be ~50ms
    assert.ok(elapsed < 90, `Expected concurrent execution (<90ms) but took ${elapsed}ms`);
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
        return { tried: true };
      },
    };
    const runner = createExtractionRunner({ plugins: [mutator] });
    const result = await runner.runExtractions({ url: 'https://example.com' });
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
    await runner.runExtractions({ url: 'https://example.com' });
    const failed = errors.filter((e) => e.evt === 'extraction_plugin_failed');
    assert.strictEqual(failed.length, 1);
    assert.ok(failed[0].data.reason.includes('exploded'));
  });
});
