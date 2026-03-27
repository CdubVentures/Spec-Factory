import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createExtractionRunner } from '../extractionRunner.js';

function createDeferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createPhasePlugin({ name, phase = 'capture', concurrent = false, result = {}, gate = null, onStart = null, shouldThrow = false } = {}) {
  return {
    name,
    phase,
    concurrent,
    async onExtract() {
      onStart?.();
      if (gate) await gate.promise;
      if (shouldThrow) throw new Error(`${name} exploded`);
      return result;
    },
  };
}

describe('extractionRunner: phase filtering', () => {
  it('runCaptures only runs capture-phase plugins', async () => {
    const capture = createPhasePlugin({ name: 'cap', phase: 'capture', result: { c: 1 } });
    const transform = createPhasePlugin({ name: 'xform', phase: 'transform', result: { t: 2 } });
    const runner = createExtractionRunner({ plugins: [capture, transform] });

    const result = await runner.runCaptures({});
    assert.deepStrictEqual(result, { cap: { c: 1 } });
    assert.strictEqual(result.xform, undefined, 'transform plugin should not run in capture phase');
  });

  it('runTransforms only runs transform-phase plugins', async () => {
    const capture = createPhasePlugin({ name: 'cap', phase: 'capture', result: { c: 1 } });
    const transform = createPhasePlugin({ name: 'xform', phase: 'transform', result: { t: 2 } });
    const runner = createExtractionRunner({ plugins: [capture, transform] });

    const result = await runner.runTransforms({});
    assert.deepStrictEqual(result, { xform: { t: 2 } });
    assert.strictEqual(result.cap, undefined, 'capture plugin should not run in transform phase');
  });

  it('plugins without phase default to capture', async () => {
    const noPhase = { name: 'legacy', async onExtract() { return { v: 1 }; } };
    const runner = createExtractionRunner({ plugins: [noPhase] });

    const captures = await runner.runCaptures({});
    assert.deepStrictEqual(captures, { legacy: { v: 1 } });

    const transforms = await runner.runTransforms({});
    assert.deepStrictEqual(transforms, {}, 'no-phase plugin defaults to capture, not transform');
  });

  it('runExtractions is backward compat alias for runCaptures', async () => {
    const capture = createPhasePlugin({ name: 'cap', phase: 'capture', result: { c: 1 } });
    const transform = createPhasePlugin({ name: 'xform', phase: 'transform', result: { t: 2 } });
    const runner = createExtractionRunner({ plugins: [capture, transform] });

    const result = await runner.runExtractions({});
    assert.deepStrictEqual(result, { cap: { c: 1 } }, 'runExtractions = runCaptures');
  });

  it('lifecycle plugins are excluded from both runCaptures and runTransforms', async () => {
    const lifecycle = createPhasePlugin({ name: 'video', phase: 'lifecycle', result: { v: 1 } });
    const capture = createPhasePlugin({ name: 'cap', phase: 'capture', result: { c: 1 } });
    const runner = createExtractionRunner({ plugins: [lifecycle, capture] });

    const caps = await runner.runCaptures({});
    assert.strictEqual(caps.video, undefined, 'lifecycle not in captures');
    assert.deepStrictEqual(caps, { cap: { c: 1 } });

    const xforms = await runner.runTransforms({});
    assert.strictEqual(xforms.video, undefined, 'lifecycle not in transforms');
  });
});

describe('extractionRunner: concurrent execution', () => {
  it('concurrent: true plugins run in parallel via Promise.all', async () => {
    const started = [];
    const gateA = createDeferred();
    const gateB = createDeferred();

    const a = createPhasePlugin({ name: 'a', concurrent: true, result: { a: 1 }, gate: gateA, onStart: () => started.push('a') });
    const b = createPhasePlugin({ name: 'b', concurrent: true, result: { b: 2 }, gate: gateB, onStart: () => started.push('b') });

    const runner = createExtractionRunner({ plugins: [a, b] });
    const resultPromise = runner.runCaptures({});

    await flushAsyncWork();
    // Both should have started (concurrent)
    assert.deepStrictEqual(started, ['a', 'b'], 'both concurrent plugins start immediately');

    gateA.resolve();
    gateB.resolve();
    const result = await resultPromise;
    assert.deepStrictEqual(result, { a: { a: 1 }, b: { b: 2 } });
  });

  it('sequential plugins run before concurrent plugins', async () => {
    const order = [];
    const seq = createPhasePlugin({ name: 'seq', concurrent: false, result: {}, onStart: () => order.push('seq') });
    const conc = createPhasePlugin({ name: 'conc', concurrent: true, result: {}, onStart: () => order.push('conc') });

    const runner = createExtractionRunner({ plugins: [conc, seq] });
    await runner.runCaptures({});

    assert.strictEqual(order[0], 'seq', 'sequential runs first regardless of registration order');
    assert.strictEqual(order[1], 'conc');
  });

  it('concurrent plugin failure does not affect other concurrent plugins', async () => {
    const good = createPhasePlugin({ name: 'good', concurrent: true, result: { ok: true } });
    const bad = createPhasePlugin({ name: 'bad', concurrent: true, shouldThrow: true });

    const runner = createExtractionRunner({ plugins: [good, bad] });
    const result = await runner.runCaptures({});

    assert.deepStrictEqual(result, { good: { ok: true } });
    assert.strictEqual(result.bad, undefined);
  });

  it('transform plugins always run concurrently', async () => {
    const started = [];
    const gateA = createDeferred();
    const gateB = createDeferred();

    // Even with concurrent: false, transforms should still be concurrent
    const a = createPhasePlugin({ name: 'ta', phase: 'transform', concurrent: false, result: { a: 1 }, gate: gateA, onStart: () => started.push('ta') });
    const b = createPhasePlugin({ name: 'tb', phase: 'transform', concurrent: false, result: { b: 2 }, gate: gateB, onStart: () => started.push('tb') });

    const runner = createExtractionRunner({ plugins: [a, b] });
    const resultPromise = runner.runTransforms({});

    await flushAsyncWork();
    assert.deepStrictEqual(started, ['ta', 'tb'], 'transforms always run concurrently');

    gateA.resolve();
    gateB.resolve();
    const result = await resultPromise;
    assert.deepStrictEqual(result, { ta: { a: 1 }, tb: { b: 2 } });
  });
});

describe('extractionRunner: context freezing in phases', () => {
  it('capture phase receives frozen context', async () => {
    const plugin = {
      name: 'freezeCheck',
      phase: 'capture',
      concurrent: false,
      async onExtract(ctx) {
        assert.throws(() => { ctx.injected = true; }, TypeError);
        return { frozen: true };
      },
    };
    const runner = createExtractionRunner({ plugins: [plugin] });
    const result = await runner.runCaptures({ url: 'https://example.com' });
    assert.deepStrictEqual(result, { freezeCheck: { frozen: true } });
  });

  it('transform phase receives frozen context', async () => {
    const plugin = {
      name: 'freezeCheck',
      phase: 'transform',
      async onExtract(ctx) {
        assert.throws(() => { ctx.injected = true; }, TypeError);
        return { frozen: true };
      },
    };
    const runner = createExtractionRunner({ plugins: [plugin] });
    const result = await runner.runTransforms({ html: '<html></html>' });
    assert.deepStrictEqual(result, { freezeCheck: { frozen: true } });
  });
});
